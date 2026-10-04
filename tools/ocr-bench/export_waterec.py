"""
Exports WATERec to ONNX as two models, the way a phone runs it: an encoder
run once per crop, and a one-step decoder called in a loop until the end
token. Checks both against PyTorch on real crops of different sizes.

Needs .cache/OpenOCR-WATERec (https://github.com/YesianRohn/OpenOCR-WATERec)
with waterec-onnx.patch applied, and .cache/WATERec-RS.pth
(https://huggingface.co/Yesianrohn/WATERec-Models). Writes .cache/onnx/.

    .venv/bin/python export_waterec.py
"""
import os, sys
import numpy as np
import torch
import torch.nn.functional as F
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(HERE, '.cache')
sys.path.insert(0, os.path.join(CACHE, 'OpenOCR-WATERec'))
os.chdir(os.path.join(CACHE, 'OpenOCR-WATERec'))
from tools.engine.config import Config
from tools.infer_rec import OpenRecognizer

cfg = Config('configs/rec/waterec/navit_ar.yml').cfg
cfg['Global']['pretrained_model'] = os.path.join(CACHE, 'WATERec-RS.pth')
rec = OpenRecognizer(cfg, backend='torch', use_gpu='false')
model = rec.model.eval()
dec = model.decoder


class Encoder(torch.nn.Module):
    def __init__(self):
        super().__init__()
        self.encoder = model.encoder

    def forward(self, x):
        return self.encoder(x)[0]


class DecoderStep(torch.nn.Module):
    """Next-token probabilities, given the encoder output and the tokens so far (starting with BOS)."""

    def __init__(self):
        super().__init__()
        self.d = dec

    def forward(self, memory, tokens):
        t = self.d.positional_encoding(self.d.embedding(tokens))
        n = tokens.shape[1]
        mask = torch.triu(torch.full((n, n), float('-inf')), diagonal=1)
        out = self.d.decoder(t, memory, tgt_mask=mask, tgt_is_causal=True)  # skips a value check torch.export cannot trace
        return F.softmax(self.d.tgt_word_prj(out[:, -1:, :]), dim=-1)


def preprocess(crop):
    b = rec.transform({'image': crop}, rec.ops[1:])
    return torch.from_numpy(b[0] if isinstance(b[0], np.ndarray) else b[0].numpy())[None].float()


img = Image.open(os.path.join(HERE, 'images', 'Stone Delicious IPA - label.png')).convert('RGB')
w, h = img.size
crops = {
    'Delicious': img.crop((int(w * 0.15), int(h * 0.55), int(w * 0.85), int(h * 0.78))),
    'STONE': img.crop((int(w * 0.18), int(h * 0.45), int(w * 0.82), int(h * 0.66))),
    'hops line': img.crop((int(w * 0.05), int(h * 0.86), int(w * 0.95), int(h * 0.97))),
}
x = preprocess(crops['Delicious'])
enc, step = Encoder().eval(), DecoderStep().eval()
out_dir = os.path.join(CACHE, 'onnx')
with torch.no_grad():
    memory = enc(x)
    # The dynamo exporter keeps sizes symbolic; the older tracing exporter froze them at the example's.
    H, W = torch.export.Dim('height', min=8, max=256), torch.export.Dim('width', min=8, max=2048)
    torch.onnx.export(enc, (x,), f'{out_dir}/WATERec-RS-encoder.onnx', input_names=['image'], output_names=['memory'],
                      dynamic_shapes={'x': {2: H * 4, 3: W * 4}}, dynamo=True, optimize=True)
    tokens = torch.tensor([[dec.bos, 5, 7]], dtype=torch.int64)
    P, L = torch.export.Dim('patches', min=1, max=8192), torch.export.Dim('length', min=1, max=dec.max_len + 1)
    torch.onnx.export(step, (memory, tokens), f'{out_dir}/WATERec-RS-decoder.onnx', input_names=['memory', 'tokens'],
                      output_names=['probs'], dynamic_shapes={'memory': {1: P}, 'tokens': {1: L}}, dynamo=True, optimize=True)
for f in ['encoder', 'decoder']:
    print(f, round(os.path.getsize(f'{out_dir}/WATERec-RS-{f}.onnx') / 1e6, 1), 'MB')

import onnxruntime as ort
se = ort.InferenceSession(f'{out_dir}/WATERec-RS-encoder.onnx', providers=['CPUExecutionProvider'])
sd = ort.InferenceSession(f'{out_dir}/WATERec-RS-decoder.onnx', providers=['CPUExecutionProvider'])


def onnx_read(x):
    memory = se.run(None, {'image': x.numpy()})[0]
    tokens, probs = [dec.bos], []
    for _ in range(dec.max_len):
        p = sd.run(None, {'memory': memory, 'tokens': np.array([tokens], dtype=np.int64)})[0]
        probs.append(p)
        tokens.append(int(p[0, -1].argmax()))
        if tokens[-1] == dec.eos:
            break
    return rec.post_process_class(torch.from_numpy(np.concatenate(probs, axis=1)), torch_tensor=True)[0][0]


for name, crop in crops.items():
    x = preprocess(crop)
    with torch.no_grad():
        ref = rec.post_process_class(model(x), torch_tensor=True)[0][0]
    print(f'{name:10s} input {tuple(x.shape)}  torch: {ref!r}  onnx: {onnx_read(x)!r}')
