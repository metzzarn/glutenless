#!/usr/bin/env bash
# Pulls the scan debug reports (and their photos) the app saved on the
# phone into tools/ocr-bench/reports/ (not in git), and lists the newest.
# Each scan in scan debug mode saves one; see app/scan-debug.tsx.
#
#   tools/pull-reports.sh            # needs adb connected to the phone
set -euo pipefail
cd "$(dirname "$0")/.."
ADB=${ADB:-$HOME/Android/Sdk/platform-tools/adb}
DEST=tools/ocr-bench/reports
mkdir -p "$DEST"
"$ADB" pull /sdcard/Android/data/com.glutenless.app/files/reports/. "$DEST/" | tail -1
ls -t "$DEST"/*.txt 2>/dev/null | head -10
