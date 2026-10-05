#!/usr/bin/env bash
# Opens a glutenless:// link on the phone from a fresh start, e.g.
#
#   tools/open-link.sh 'glutenless://camera?mode=can'
#   tools/open-link.sh 'glutenless://bench?set=menus'
#
# After `adb install`, Android stops the app and relaunches it on its last
# page (CorePackageUpdate), and that relaunch can land after a link sent
# straight away. So this waits for a relaunch within the last few seconds
# to settle, stops the app, and opens the link on a cold start.
set -euo pipefail
ADB=${ADB:-$HOME/Android/Sdk/platform-tools/adb}
URL=${1:?usage: tools/open-link.sh glutenless://<route>}
PKG=com.glutenless.app
# Seconds since the app was last updated, from the package manager.
updated=$("$ADB" shell dumpsys package "$PKG" | sed -n 's/.*lastUpdateTime=//p' | head -1)
age=$(( $(date +%s) - $(date -d "$updated" +%s 2>/dev/null || echo 0) ))
if [ "$age" -lt 8 ]; then sleep $(( 8 - age )); fi
"$ADB" shell am force-stop "$PKG"
"$ADB" shell am start -a android.intent.action.VIEW -d "'$URL'" "$PKG" >/dev/null
