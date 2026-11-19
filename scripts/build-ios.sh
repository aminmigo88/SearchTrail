#!/usr/bin/env bash
set -euo pipefail
task_root="$(cd "$(dirname "$0")/.." && pwd)"
if [[ "$(uname -s)" != Darwin ]]; then
  echo 'This build needs macOS with Xcode. Use the included GitHub Actions workflow from Windows.' >&2
  exit 1
fi
task_build="$task_root/build"
mkdir -p "$task_build" "$task_root/dist"
if xcrun --find safari-web-extension-packager >/dev/null 2>&1; then
  task_packager=safari-web-extension-packager
else
  task_packager=safari-web-extension-converter
fi
xcrun "$task_packager" "$task_root/extension" \
  --project-location "$task_build/project" \
  --app-name SearchTrail --bundle-identifier app.searchtrail.prototype \
  --ios-only --swift --copy-resources --no-open --no-prompt --force
task_project="$(find "$task_build/project" -maxdepth 3 -name '*.xcodeproj' -type d -print -quit)"
if [[ -z "$task_project" ]]; then echo 'No Xcode project was generated.' >&2; exit 1; fi
xcodebuild -list -json -project "$task_project" > "$task_build/project-info.json"
task_scheme="$(python3 "$task_root/scripts/select-scheme.py" "$task_build/project-info.json")"
xcodebuild -project "$task_project" -scheme "$task_scheme" \
  -configuration Release -sdk iphoneos -destination 'generic/platform=iOS' \
  -derivedDataPath "$task_build/DerivedData" \
  CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO CODE_SIGN_IDENTITY='' \
  IPHONEOS_DEPLOYMENT_TARGET=16.4 build
task_app="$(find "$task_build/DerivedData/Build/Products/Release-iphoneos" -maxdepth 1 -name '*.app' -type d -print -quit)"
if [[ -z "$task_app" ]]; then echo 'No iPhone app was produced.' >&2; exit 1; fi
python3 "$task_root/scripts/package-ipa.py" "$task_app" "$task_root/dist/SearchTrail-unsigned.ipa"
echo 'Created dist/SearchTrail-unsigned.ipa. It must be signed, including its embedded Safari extension, before installation.'
