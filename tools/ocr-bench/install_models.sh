#!/usr/bin/env bash
# Copies the shipped OCR models into the app (Android assets of
# modules/ocr-models), where scripts/build-android.sh expects them.
#
# Builds them first if needed, which takes the bench's Python environment
# (.venv) and the exports from export_paddle.sh and export_waterec.py.
set -euo pipefail
cd "$(dirname "$0")"
if [ ! -d .cache/onnx-ship ]; then
  .venv/bin/python shrink_models.py ship
fi
DEST=../../modules/ocr-models/android/src/main/assets/ocr-models
rm -rf "$DEST"
mkdir -p "$DEST"
cp .cache/onnx-ship/* "$DEST"/
du -sh "$DEST"
