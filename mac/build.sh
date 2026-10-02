#!/bin/zsh
# Kasino 맥 버전 빌드 → mac/build/Kasino.app (애플 실리콘 + 인텔 유니버설)
set -e
cd "$(dirname "$0")"
VERSION="${1:-1.0.0}"
APP=build/Kasino.app
rm -rf build
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"

for ARCH in arm64 x86_64; do
  swiftc -O -parse-as-library -swift-version 5 -target $ARCH-apple-macos13 \
    Kasino.swift -o build/Kasino-$ARCH
done
lipo -create build/Kasino-arm64 build/Kasino-x86_64 -output "$APP/Contents/MacOS/Kasino"
rm build/Kasino-arm64 build/Kasino-x86_64
cp ../assets/Kasino.icns "$APP/Contents/Resources/Kasino.icns"

cat > "$APP/Contents/Info.plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>CFBundleName</key><string>Kasino</string>
  <key>CFBundleDisplayName</key><string>Kasino</string>
  <key>CFBundleIdentifier</key><string>io.github.kasino</string>
  <key>CFBundleExecutable</key><string>Kasino</string>
  <key>CFBundleIconFile</key><string>Kasino</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>$VERSION</string>
  <key>CFBundleVersion</key><string>$VERSION</string>
  <key>LSMinimumSystemVersion</key><string>13.0</string>
  <key>LSUIElement</key><true/>
  <key>NSHumanReadableCopyright</key><string>For practice and learning only. No real-money gambling.</string>
</dict></plist>
EOF
codesign --force --sign - "$APP" >/dev/null 2>&1 || true
echo "✅ 빌드 완료: mac/$APP ($VERSION)"

# 설치용 DMG: Kasino.app 옆에 응용 프로그램 폴더 바로가기를 둬서 끌어다 놓으면 설치
mkdir -p build/dmg
cp -R "$APP" build/dmg/
ln -s /Applications build/dmg/Applications
hdiutil create -volname "Kasino" -srcfolder build/dmg -ov -format UDZO "build/Kasino-$VERSION.dmg" >/dev/null
rm -rf build/dmg
echo "✅ DMG: mac/build/Kasino-$VERSION.dmg"
