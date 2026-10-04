#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cd "$ROOT_DIR"

# The on-device OCR models are generated, not in git (see tools/ocr-bench/install_models.sh).
if [ ! -f modules/ocr-models/android/src/main/assets/ocr-models/PP-OCRv6_small_det.onnx ]; then
  echo "OCR models missing: run tools/ocr-bench/install_models.sh first." >&2
  exit 1
fi

npx expo prebuild

cd "$ROOT_DIR/android"
./gradlew assembleRelease
