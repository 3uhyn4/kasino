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
# 공증 없는 무료 앱이라 첫 실행 경고를 없애는 명령을 안내 파일로 같이 넣는다 (TextEdit가 한글을 바로 읽도록 UTF-8 BOM)
printf '\xEF\xBB\xBF' > "build/dmg/설치 방법 - How to install.txt"
cat >> "build/dmg/설치 방법 - How to install.txt" <<'TXT'
Kasino 설치 방법

1. Kasino를 옆의 Applications(응용 프로그램) 폴더로 끌어다 놓으세요.

2. 터미널을 열고(Spotlight에서 "터미널" 검색) 아래 한 줄을 복사해 붙여넣은 뒤 Enter를 누르세요.

   xattr -dr com.apple.quarantine /Applications/Kasino.app

3. 응용 프로그램 폴더에서 Kasino를 열면 메뉴바에 스페이드 표시가 생깁니다.

2번은 애플 공증을 받지 않은 무료 앱이라 처음 한 번만 필요합니다. 이 과정을 건너뛰면 "Kasino를 열 수 없습니다" 창이 뜹니다.


How to install Kasino

1. Drag Kasino onto the Applications folder next to it.

2. Open Terminal (search "Terminal" in Spotlight), paste this line and press Enter:

   xattr -dr com.apple.quarantine /Applications/Kasino.app

3. Open Kasino from Applications. A spade icon appears in the menu bar.

Step 2 is only needed once. Kasino is a free app without Apple notarization, and skipping this step shows a "Kasino Not Opened" warning.
TXT
hdiutil create -volname "Kasino" -srcfolder build/dmg -ov -format UDZO "build/Kasino-$VERSION.dmg" >/dev/null
rm -rf build/dmg
echo "✅ DMG: mac/build/Kasino-$VERSION.dmg"
