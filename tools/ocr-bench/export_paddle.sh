#!/usr/bin/env bash
# Converts PaddleOCR's PP-OCRv6 models (downloaded by bench.py into
# ~/.paddlex/official_models) to ONNX in .cache/onnx/, with paddle2onnx 2.1.
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p .cache/onnx
for model in PP-OCRv6_small_det PP-OCRv6_small_rec PP-OCRv6_medium_det PP-OCRv6_medium_rec; do
  .venv/bin/paddle2onnx \
    --model_dir ~/.paddlex/official_models/$model \
    --model_filename inference.json --params_filename inference.pdiparams \
    --save_file .cache/onnx/$model.onnx --opset_version 17
done
