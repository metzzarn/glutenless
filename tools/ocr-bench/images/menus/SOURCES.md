# Menu photos

Made-up drinks menus, drawn by `tools/ocr-bench/make_menus.py` and made to look
photographed (tilt, a table around the page, uneven light, blur, JPEG): gluten-free
beers among ordinary ones, next to look-alikes that contain gluten (Estrella Damm
and Daura Damm, Peroni and Peroni Gluten Free), and menus with none.

Each file is named after the beers from our list its menu identifies, joined by
` + ` (`none`: only beers with gluten), then ` - generated NN <style>`.

Push them to the phone, read them with every menu reader, and score:

```bash
adb push tools/ocr-bench/images/menus/*.jpg /sdcard/Android/data/com.glutenless.app/files/menus/
adb logcat -c
adb shell am start -a android.intent.action.VIEW -d 'glutenless://bench?set=menus'
# when the screen says Done:
adb logcat -d | grep -o 'MENU .*' > tools/ocr-bench/menus-phone.log
node tools/ocr-bench/score_menus.mts tools/ocr-bench/menus-phone.log
```
