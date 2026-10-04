"""
Runs candidate on-device text readers over beer label photos, to compare them
with ML Kit before integrating any into the app.

    tools/ocr-bench/.venv/bin/python tools/ocr-bench/bench.py [reader ...]

Photos go in tools/ocr-bench/images/, named after what the label says
("Stone Delicious IPA - bottle.jpg"). Each reader's text is written to
results.json; score.mts then runs it through the app's own matcher.
"""

import json
import sys
import time
from pathlib import Path

from PIL import Image

HERE = Path(__file__).parent
IMAGES = sorted(p for p in (HERE / 'images').iterdir() if p.suffix.lower() in {'.jpg', '.jpeg', '.png', '.webp'})
RESULTS = HERE / 'results.json'


def easyocr_reader():
    import easyocr

    reader = easyocr.Reader(['en'], gpu=True)

    def read(path):
        return '\n'.join(text for _, text, _ in reader.readtext(str(path)))

    return read


def paddle_reader(version):
    from paddleocr import PaddleOCR

    # The mobile models: the size that would run on a phone.
    ocr = PaddleOCR(
        text_detection_model_name=f'PP-OCR{version}_mobile_det',
        text_recognition_model_name=f'{"en_" if version == "v4" else ""}PP-OCR{version}_mobile_rec',
        use_doc_orientation_classify=False,
        use_doc_unwarping=False,
        use_textline_orientation=False,
        # PaddlePaddle 3.3's oneDNN path fails on these models ("ConvertPirAttribute2RuntimeAttribute not support").
        enable_mkldnn=False,
    )

    def read(path):
        return '\n'.join(text for result in ocr.predict(str(path)) for text in result['rec_texts'])

    return read


def florence_reader():
    import torch
    from transformers import AutoProcessor, Florence2ForConditionalGeneration

    model_id = 'florence-community/Florence-2-base'
    model = Florence2ForConditionalGeneration.from_pretrained(model_id, torch_dtype=torch.float16).to('cuda')
    processor = AutoProcessor.from_pretrained(model_id)

    # <OCR_WITH_REGION> rather than <OCR>: plain <OCR> runs every line together ("DAURADAMM").
    task = '<OCR_WITH_REGION>'

    def read(path):
        image = Image.open(path).convert('RGB')
        inputs = processor(text=task, images=image, return_tensors='pt').to('cuda', torch.float16)
        ids = model.generate(**inputs, max_new_tokens=512, num_beams=3)
        raw = processor.batch_decode(ids, skip_special_tokens=False)[0]
        parsed = processor.post_process_generation(raw, task=task, image_size=image.size)
        return '\n'.join(label.replace('</s>', '').strip() for label in parsed[task]['labels'])

    return read


def trocr_reader(variant):
    """TrOCR reads one cropped line at a time; EasyOCR's detector (CRAFT) finds the lines, standing in for ML Kit's boxes."""
    import easyocr
    import torch
    from transformers import TrOCRProcessor, VisionEncoderDecoderModel

    detector = easyocr.Reader(['en'], gpu=True, recognizer=False)
    model_id = f'microsoft/trocr-base-{variant}'
    processor = TrOCRProcessor.from_pretrained(model_id)
    model = VisionEncoderDecoderModel.from_pretrained(model_id).to('cuda')

    def read(path):
        image = Image.open(path).convert('RGB')
        horizontal, free = detector.detect(str(path))
        lines = []
        for x_min, x_max, y_min, y_max in horizontal[0]:
            crop = image.crop((max(0, x_min), max(0, y_min), x_max, y_max))
            if crop.width < 4 or crop.height < 4:
                continue
            pixels = processor(images=crop, return_tensors='pt').pixel_values.to('cuda')
            with torch.no_grad():
                ids = model.generate(pixels, max_new_tokens=32)
            lines.append(processor.batch_decode(ids, skip_special_tokens=True)[0])
        return '\n'.join(lines)

    return read


READERS = {
    'easyocr': easyocr_reader,
    'paddle-v4': lambda: paddle_reader('v4'),
    'paddle-v5': lambda: paddle_reader('v5'),
    'florence2': florence_reader,
    'trocr-printed': lambda: trocr_reader('printed'),
    'trocr-handwritten': lambda: trocr_reader('handwritten'),
}


def main():
    names = sys.argv[1:] or list(READERS)
    results = json.loads(RESULTS.read_text()) if RESULTS.exists() else {}
    for name in names:
        print(f'== {name}', flush=True)
        try:
            read = READERS[name]()
        except Exception as e:  # a reader that won't load shouldn't stop the others
            print(f'   failed to load: {e}', flush=True)
            continue
        for path in IMAGES:
            started = time.time()
            try:
                text = read(path)
            except Exception as e:
                text = f'[error: {e}]'
            ms = round((time.time() - started) * 1000)
            results.setdefault(path.name, {})[name] = {'text': text, 'ms': ms}
            print(f'   {path.name}: {text!r} ({ms} ms)', flush=True)
        RESULTS.write_text(json.dumps(results, indent=2, ensure_ascii=False))


if __name__ == '__main__':
    main()
