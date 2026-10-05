#!/usr/bin/env bash
# Puts the on-device OCR models into the app (Android assets of
# modules/ocr-models), where scripts/build-android.sh expects them, in ORT
# format for the app's minimal ONNX Runtime. Builds that runtime too
# (build_ort.sh) when it's missing or the models need operators it lacks.
#
# Builds the models first if needed, which takes the bench's Python
# environment (.venv) and the exports from export_paddle.sh and
# export_waterec.py.
set -euo pipefail
cd "$(dirname "$0")"
if [ ! -d .cache/onnx-ship ]; then
  .venv/bin/python shrink_models.py ship
fi

# Optimized now for the phone's CPU, since the minimal runtime can't; the
# conversion also lists the operators and types the runtime must include.
rm -rf .cache/onnx-ort
cp -r .cache/onnx-ship .cache/onnx-ort
.venv/bin/python -m onnxruntime.tools.convert_onnx_models_to_ort .cache/onnx-ort \
  --optimization_style Fixed --target_platform arm --enable_type_reduction
rm .cache/onnx-ort/*.onnx

DEST=../../modules/ocr-models/android/src/main/assets/ocr-models
rm -rf "$DEST"
mkdir -p "$DEST"
cp .cache/onnx-ort/*.ort .cache/onnx-ort/*.txt "$DEST"/
du -sh "$DEST"

LIBS=../../modules/ocr-models/android/libs
if ! cmp -s <(grep -v '^#' .cache/onnx-ort/required_operators_and_types.config) \
            <(grep -v '^#' "$LIBS/required_operators_and_types.config" 2>/dev/null); then
  ./build_ort.sh
fi
