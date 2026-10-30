#!/usr/bin/env bash
set -euo pipefail
mkdir -p production-link-results
package=com.casamichele.app.preview
domain=casa-michele.mic-gritzbach.workers.dev
adb install CasaMichele-v5.0.0-preview.apk
adb shell pm verify-app-links --re-verify "$package"
# Wait for Android's own verifier. Never force an approved/verified state.
for attempt in $(seq 1 36); do
  adb shell pm get-app-links "$package" | tee production-link-results/domain-state.txt
  if grep -q "$domain: verified" production-link-results/domain-state.txt; then break; fi
  sleep 5
done
grep -q "$domain: verified" production-link-results/domain-state.txt
adb shell am start -W -a android.intent.action.VIEW -c android.intent.category.BROWSABLE -d "https://$domain/?event=QA30LIVE" | tee production-link-results/https-launch.txt
grep -q "$package/" production-link-results/https-launch.txt
sleep 5
adb shell uiautomator dump /sdcard/window.xml
adb pull /sdcard/window.xml production-link-results/https-window.xml
adb exec-out screencap -p > production-link-results/https-screen.png
adb shell am force-stop "$package"
adb shell am start -W -a android.intent.action.VIEW -c android.intent.category.BROWSABLE -d 'casamichele://join?event=QA30LIVE' | tee production-link-results/custom-launch.txt
grep -q "$package/" production-link-results/custom-launch.txt
