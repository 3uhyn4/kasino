// 앱 아이콘 생성: swift assets/make-icon.swift <출력 폴더>
import AppKit

func render(_ size: CGFloat) -> NSBitmapImageRep {
    let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: Int(size), pixelsHigh: Int(size),
                               bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false,
                               colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
    let s = size / 1024
    // macOS 아이콘 그리드: 824px 둥근 사각형
    let rect = NSRect(x: 100 * s, y: 100 * s, width: 824 * s, height: 824 * s)
    let path = NSBezierPath(roundedRect: rect, xRadius: 185 * s, yRadius: 185 * s)
    NSGradient(colors: [NSColor(red: 0.07, green: 0.42, blue: 0.27, alpha: 1),
                        NSColor(red: 0.02, green: 0.20, blue: 0.13, alpha: 1)])!.draw(in: path, angle: -90)
    NSColor(red: 0.95, green: 0.78, blue: 0.35, alpha: 1).setStroke()
    let ring = NSBezierPath(roundedRect: rect.insetBy(dx: 34 * s, dy: 34 * s), xRadius: 155 * s, yRadius: 155 * s)
    ring.lineWidth = 14 * s
    ring.stroke()
    let cfg = NSImage.SymbolConfiguration(pointSize: 460 * s, weight: .bold)
    let spade = NSImage(systemSymbolName: "suit.spade.fill", accessibilityDescription: nil)!.withSymbolConfiguration(cfg)!
    let tinted = NSImage(size: spade.size, flipped: false) { r in
        spade.draw(in: r)
        NSColor.white.set()
        r.fill(using: .sourceAtop)
        return true
    }
    let sz = tinted.size
    tinted.draw(in: NSRect(x: (size - sz.width) / 2, y: (size - sz.height) / 2 + 10 * s, width: sz.width, height: sz.height))
    NSGraphicsContext.restoreGraphicsState()
    return rep
}

let out = CommandLine.arguments[1]
func write(_ size: CGFloat, _ name: String) {
    try! render(size).representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: "\(out)/\(name)"))
}
write(1024, "icon.png")
let iconset = "\(out)/Kasino.iconset"
try? FileManager.default.createDirectory(atPath: iconset, withIntermediateDirectories: true)
for p in [16, 32, 128, 256, 512] {
    write(CGFloat(p), "Kasino.iconset/icon_\(p)x\(p).png")
    write(CGFloat(p * 2), "Kasino.iconset/icon_\(p)x\(p)@2x.png")
}
write(32, "tray.png")
write(64, "tray@2x.png")
