#!/usr/bin/env bash
set -euo pipefail

BUILD_ROOT="${1:?Pass the build directory}"
PRODUCTS="$BUILD_ROOT/DerivedData/Build/Products/Release-iphoneos"
APP_PATH="$(find "$PRODUCTS" -maxdepth 1 -type d -name '*.app' | head -n 1)"
if [[ -z "$APP_PATH" ]]; then
  echo "No device app bundle was produced."
  exit 1
fi

APPEX_PATHS=("$APP_PATH"/PlugIns/*.appex)
if [[ "${#APPEX_PATHS[@]}" -ne 2 ]]; then
  echo "Expected the ReplayKit and Widget extensions."
  exit 1
fi

BROADCAST_APPEX_PATH=""
WIDGET_APPEX_PATH=""
for appex in "${APPEX_PATHS[@]}"; do
  bundle_id=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$appex/Info.plist")
  case "$bundle_id" in
    *.broadcast) BROADCAST_APPEX_PATH="$appex" ;;
    *.widgets) WIDGET_APPEX_PATH="$appex" ;;
  esac
done
if [[ -z "$BROADCAST_APPEX_PATH" || -z "$WIDGET_APPEX_PATH" ]]; then
  echo "Could not identify both embedded extensions."
  exit 1
fi

while IFS= read -r -d '' framework; do
  /usr/bin/codesign --force --sign - --timestamp=none "$framework"
done < <(find "$APP_PATH" -type d -name '*.framework' -print0)
while IFS= read -r -d '' dylib; do
  /usr/bin/codesign --force --sign - --timestamp=none "$dylib"
done < <(find "$APP_PATH" -type f -name '*.dylib' -print0)

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
/usr/bin/codesign --force --sign - --timestamp=none "$BROADCAST_APPEX_PATH"
/usr/bin/codesign --force --sign - --timestamp=none \
  --entitlements "$SCRIPT_DIR/CommandCentreWidgets/CommandCentreWidgets.entitlements" \
  "$WIDGET_APPEX_PATH"
/usr/bin/codesign --force --sign - --timestamp=none \
  --entitlements "$SCRIPT_DIR/CommandCentreNative/CommandCentreNative.entitlements" \
  "$APP_PATH"

APP_SHORT=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$APP_PATH/Info.plist")
APP_BUILD=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleVersion' "$APP_PATH/Info.plist")
for appex in "${APPEX_PATHS[@]}"; do
  EXT_SHORT=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$appex/Info.plist")
  EXT_BUILD=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleVersion' "$appex/Info.plist")
  EXT_EXEC=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleExecutable' "$appex/Info.plist")
  if [[ "$APP_SHORT" != "$EXT_SHORT" || "$APP_BUILD" != "$EXT_BUILD" || -z "$EXT_EXEC" ]]; then
    echo "Extension version or executable is invalid: $appex"
    exit 1
  fi
done

/usr/bin/codesign --verify --deep --strict --verbose=4 "$APP_PATH"
mkdir -p "$BUILD_ROOT/Payload"
/usr/bin/ditto "$APP_PATH" "$BUILD_ROOT/Payload/$(basename "$APP_PATH")"
IPA_PATH="$BUILD_ROOT/CommandCentre-iOS26-v${APP_SHORT}.ipa"
/usr/bin/ditto -c -k --sequesterRsrc --keepParent "$BUILD_ROOT/Payload" "$IPA_PATH"
/usr/bin/unzip -t "$IPA_PATH"

{
  echo "Command Centre Signulous IPA structure report"
  echo "App version: $APP_SHORT ($APP_BUILD)"
  echo "Bundle ID: $(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$APP_PATH/Info.plist")"
  echo "Extensions: ${APPEX_PATHS[*]}"
  echo "Code signature verification: passed"
} > "$BUILD_ROOT/ipa-structure-report.txt"
echo "Created $IPA_PATH"
