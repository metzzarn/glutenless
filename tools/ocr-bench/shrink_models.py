"""
Shrinks the ONNX models for shipping in the app, in variants to compare on
the phone (glutenless://bench?mode=read):

  latin       PP-OCRv6's reader keeps only Latin-script characters (its last
              layer was 9 of its 21 MB, for 18,710 mostly CJK characters)
  latin-int8  + 8-bit weights for the reader and WATERec (dynamic quantization)
  all-int8    + 8-bit weights for the detector too
  ship        the Latin reader at full precision, WATERec in 8 bits: what the
              app ships. On the phone bench, the 8-bit reader lost a photo
              ("NASTRO AZZUR") and saved no space: dynamic quantization only
              compresses matrix multiplications, and PP-OCRv6 is mostly convolutions.

Reads .cache/onnx/ (export_paddle.sh, export_waterec.py); writes
.cache/onnx-<variant>/ with the same file names the app loads.

    .venv/bin/python shrink_models.py
"""
import shutil
import sys
from pathlib import Path

import numpy as np
import onnx
from onnx import numpy_helper
from onnxruntime.quantization import QuantType, quantize_dynamic

HERE = Path(__file__).parent
SRC = HERE / '.cache' / 'onnx'


def is_latin_text_char(c: str) -> bool:
    """Characters a beer label in a Latin-script language might print."""
    cp = ord(c)
    return (
        0x20 <= cp <= 0x7E  # ASCII
        or 0xA0 <= cp <= 0x24F  # Latin-1 Supplement, Latin Extended-A/B: å ä ö ø æ é ñ ß ...
        or 0x1E00 <= cp <= 0x1EFF  # Latin Extended Additional
        or 0x2010 <= cp <= 0x206F  # general punctuation: – — ‘ ’ “ ” • …
        or 0x20A0 <= cp <= 0x20CF  # currency: €
        or c in '°ºª№™℮'
    )


def latin_reader(out: Path):
    """The reader with its last layer cut to Latin characters (plus "blank" first and space last)."""
    chars = (SRC / 'PP-OCRv6.chars.txt').read_text().split('\n')[:-1]
    keep = [i for i, c in enumerate(chars) if is_latin_text_char(c)]
    columns = [0] + [i + 1 for i in keep] + [len(chars) + 1]  # blank, kept characters, space
    model = onnx.load(SRC / 'PP-OCRv6_small_rec.onnx')
    for node in model.graph.node:
        if node.op_type == 'Constant' and node.output[0] in ('linear_8.w_0', 'linear_8.b_0'):
            value = numpy_helper.to_array(node.attribute[0].t)
            sliced = value[..., columns] if value.ndim == 2 else value[columns]
            node.attribute[0].t.CopyFrom(numpy_helper.from_array(np.ascontiguousarray(sliced), node.output[0]))
    onnx.save(model, out / 'PP-OCRv6_small_rec.onnx')
    (out / 'PP-OCRv6.chars.txt').write_text('\n'.join(chars[i] for i in keep) + '\n')
    print(f'  reader: {len(chars)} -> {len(keep)} characters')


def quantize(src: Path, dst: Path):
    quantize_dynamic(str(src), str(dst), weight_type=QuantType.QInt8)


def copy(name: str, out: Path):
    shutil.copy(SRC / name, out / name)
    data = SRC / f'{name}.data'
    if data.exists():
        shutil.copy(data, out / data.name)


def build(variant: str):
    out = HERE / '.cache' / f'onnx-{variant}'
    shutil.rmtree(out, ignore_errors=True)
    out.mkdir(parents=True)
    print(variant)
    latin_reader(out)
    if variant == 'latin':
        for name in ['PP-OCRv6_small_det.onnx', 'WATERec-RS-encoder.onnx', 'WATERec-RS-decoder.onnx']:
            copy(name, out)
    elif variant == 'ship':
        copy('PP-OCRv6_small_det.onnx', out)
        for name in ['WATERec-RS-encoder.onnx', 'WATERec-RS-decoder.onnx']:
            quantize(SRC / name, out / name)
    else:
        rec = out / 'PP-OCRv6_small_rec.onnx'
        quantize(rec, rec)
        for name in ['WATERec-RS-encoder.onnx', 'WATERec-RS-decoder.onnx']:
            quantize(SRC / name, out / name)
        if variant == 'all-int8':
            quantize(SRC / 'PP-OCRv6_small_det.onnx', out / 'PP-OCRv6_small_det.onnx')
        else:
            copy('PP-OCRv6_small_det.onnx', out)
    shutil.copy(SRC / 'WATERec-RS.chars.txt', out / 'WATERec-RS.chars.txt')
    total = sum(f.stat().st_size for f in out.iterdir())
    for f in sorted(out.iterdir()):
        print(f'  {f.name:32s} {f.stat().st_size / 1e6:6.1f} MB')
    print(f'  total {total / 1e6:.1f} MB')


if __name__ == '__main__':
    for variant in sys.argv[1:] or ['latin', 'latin-int8', 'all-int8', 'ship']:
        build(variant)
