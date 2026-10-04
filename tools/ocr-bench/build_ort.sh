#!/usr/bin/env bash
# Builds the app's ONNX Runtime: a minimal build for arm64 with only the
# operators (and data types) the shipped models use, about a tenth of the
# full library. It loads only ORT-format models: install_models.sh converts
# them and runs this when the operators they need change, as listed in
# .cache/onnx-ort/required_operators_and_types.config. A model needing an
# operator the build left out fails to load.
#
# Built without telemetry: the official Android package reports to
# Microsoft (1DS) from app launch, and adds the INTERNET permission for it.
#
# Output: modules/ocr-models/android/libs/ (not in git): the Java classes
# (onnxruntime.jar) and native libraries (jni/) unpacked from the AAR, since
# a library module can't depend on a local AAR, and the operator list they
# were built from.
#
# Needs the bench's .venv (with cmake and ninja: uv pip install cmake ninja),
# the Android SDK and NDK, and JDK 17. Takes about 20 minutes.
set -euo pipefail
cd "$(dirname "$0")"
ORT_VERSION=1.30.0
SDK=${ANDROID_HOME:-$HOME/Android/Sdk}
NDK=${ANDROID_NDK_HOME:-$(ls -d "$SDK"/ndk/* | sort -V | tail -1)}
SRC=.cache/onnxruntime
LIBS=../../modules/ocr-models/android/libs

[ -d "$SRC" ] || git clone --depth 1 --branch "v$ORT_VERSION" https://github.com/microsoft/onnxruntime.git "$SRC"
CONFIG=$PWD/.cache/onnx-ort/required_operators_and_types.config
[ -f "$CONFIG" ] || { echo "Run install_models.sh: it converts the models and lists their operators." >&2; exit 1; }

cat > .cache/ort-aar-settings.json <<EOF
{
  "build_abis": ["arm64-v8a"],
  "android_min_sdk_version": 26,
  "android_target_sdk_version": 34,
  "build_params": [
    "--enable_lto",
    "--android",
    "--parallel", "12",
    "--cmake_generator=Ninja",
    "--build_java",
    "--build_shared_lib",
    "--minimal_build",
    "--disable_ml_ops",
    "--disable_rtti",
    "--enable_reduced_operator_type_support",
    "--no_telemetry",
    "--skip_tests"
  ]
}
EOF

PATH="$PWD/.venv/bin:$PATH" .venv/bin/python "$SRC/tools/ci_build/github/android/build_aar_package.py" \
  --config MinSizeRel \
  --android_sdk_path "$SDK" --android_ndk_path "$NDK" \
  --build_dir "$PWD/.cache/ort-build" \
  --include_ops_by_config "$CONFIG" \
  .cache/ort-aar-settings.json

AAR=".cache/ort-build/aar_out/MinSizeRel/com/microsoft/onnxruntime/onnxruntime-android/$ORT_VERSION/onnxruntime-android-$ORT_VERSION.aar"
if unzip -l "$AAR" | grep -qi telemetry; then
  echo "The build still contains telemetry." >&2
  exit 1
fi
rm -rf "$LIBS"
mkdir -p "$LIBS"
unzip -q -o "$AAR" classes.jar 'jni/*' -d "$LIBS"
mv "$LIBS/classes.jar" "$LIBS/onnxruntime.jar"
cp "$CONFIG" "$LIBS/"
find "$LIBS" -type f | xargs ls -la
