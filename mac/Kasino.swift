import SwiftUI
import AppKit
import Charts

// MARK: - 언어

enum Lang: String, CaseIterable, Identifiable {
    case ko, en, ja
    var id: String { rawValue }
    var display: String { ["한국어", "English", "日本語"][index] }
    var index: Int { Lang.allCases.firstIndex(of: self)! }
}

let langKey = "casino-lang"
var currentLang: Lang = Lang(rawValue: UserDefaults.standard.string(forKey: langKey) ?? "") ?? .ko

/// 현재 언어에 맞는 문자열 (한국어, 영어, 일본어)
func T(_ ko: String, _ en: String, _ ja: String) -> String {
    switch currentLang {
    case .ko: return ko
    case .en: return en
    case .ja: return ja
    }
}

// MARK: - 숫자 포맷

let numberFormatter: NumberFormatter = {
    let f = NumberFormatter()
    f.numberStyle = .decimal
    f.maximumFractionDigits = 2
    return f
}()

func fmt(_ v: Double) -> String {
    let r = abs(v) >= 1000 ? v.rounded() : (v * 100).rounded() / 100
    return numberFormatter.string(from: NSNumber(value: r)) ?? "\(r)"
}

/// 메뉴바용 짧은 표기 (1.2M 등)
func fmtShort(_ v: Double) -> String {
    let a = abs(v)
    for (d, u) in [(1e12, "T"), (1e9, "B"), (1e6, "M"), (1e3, "K")] where a >= d {
        let x = v / d
        return (x == x.rounded() ? String(Int(x)) : String(format: "%.1f", x)) + u
    }
    return fmt(v)
}

func signed(_ v: Double) -> String { (v >= 0 ? "+" : "−") + fmt(abs(v)) }
func pct(_ v: Double) -> String { String(format: "%.1f%%", v * 100) }

// MARK: - 카드

struct Card: Identifiable, Equatable {
    let id = UUID()
    let rank: Int   // 2...14 (14 = A)
    let suit: Int   // 0♠ 1♥ 2♦ 3♣

    var label: String {
        let r: String
        switch rank {
        case 14: r = "A"
        case 13: r = "K"
        case 12: r = "Q"
        case 11: r = "J"
        default: r = String(rank)
        }
        return r + ["♠", "♥", "♦", "♣"][suit]
    }
    var isRed: Bool { suit == 1 || suit == 2 }
    /// 그림장 인물 (J 기사, Q 여왕, K 왕)
    var faceEmoji: String? { [11: "💂", 12: "👸", 13: "🤴"][rank] }
    var baccaratValue: Int { rank == 14 ? 1 : (rank >= 10 ? 0 : rank) }

    static func deck(_ n: Int = 1) -> [Card] {
        var d: [Card] = []
        for _ in 0..<n { for s in 0..<4 { for r in 2...14 { d.append(Card(rank: r, suit: s)) } } }
        return d.shuffled()
    }
}

// MARK: - 기록

enum Game: String, CaseIterable, Codable, Identifiable {
    case baccarat, dragonTiger, roulette, holdem, slots
    var id: String { rawValue }
    var name: String {
        switch self {
        case .baccarat: return T("바카라", "Baccarat", "バカラ")
        case .roulette: return T("룰렛", "Roulette", "ルーレット")
        case .holdem: return T("홀덤", "Hold'em", "ホールデム")
        case .slots: return T("슬롯", "Slots", "スロット")
        case .dragonTiger: return T("용호", "Dragon Tiger", "ドラゴンタイガー")
        }
    }
}

struct GameStats: Codable {
    var rounds = 0
    var wins = 0
    var losses = 0
    var pushes = 0
    var wagered = 0.0
    var net = 0.0
    var expected = 0.0        // 하우스 엣지 기준 기대 손익
    var biggestWin = 0.0
    var biggestLoss = 0.0
    var streak = 0            // +연승 / −연패
    var bestStreak = 0
    var worstStreak = 0
    var decisions = 0         // 홀덤 판단 횟수
    var goodDecisions = 0

    mutating func record(net n: Double, wager: Double, expectedLoss: Double) {
        rounds += 1
        wagered += wager
        net += n
        expected -= expectedLoss
        if n > 0 {
            wins += 1
            streak = streak > 0 ? streak + 1 : 1
            bestStreak = max(bestStreak, streak)
            biggestWin = max(biggestWin, n)
        } else if n < 0 {
            losses += 1
            streak = streak < 0 ? streak - 1 : -1
            worstStreak = min(worstStreak, streak)
            biggestLoss = min(biggestLoss, n)
        } else {
            pushes += 1
        }
    }

    var winRate: Double? { wins + losses > 0 ? Double(wins) / Double(wins + losses) : nil }
    var roi: Double? { wagered > 0 ? net / wagered : nil }
    /// 운 = 실제 손익 − 기대 손익
    var luck: Double { net - expected }
    var accuracy: Double? { decisions > 0 ? Double(goodDecisions) / Double(decisions) : nil }
}

struct SaveData: Codable {
    var bankroll: Double = 1_000_000
    var startBankroll: Double = 1_000_000
    var stats: [String: GameStats] = [:]
    var curve: [Double] = [1_000_000]     // 뱅크롤 변화 기록
    var bacHistory: [BacResult] = []
    var dtHistory: [BacResult]? = nil    // 옵셔널: 기존 저장 파일과 호환
    var rouHistory: [Int]? = nil         // 룰렛 최근 결과 (최신이 앞)
}

// MARK: - 테마

enum Theme: String, CaseIterable, Identifiable {
    case system, light, dark
    var id: String { rawValue }
    var label: String {
        switch self {
        case .system: return T("시스템", "System", "システム")
        case .light: return T("라이트", "Light", "ライト")
        case .dark: return T("다크", "Dark", "ダーク")
        }
    }
    var appearance: NSAppearance? {
        switch self {
        case .system: return nil
        case .light: return NSAppearance(named: .aqua)
        case .dark: return NSAppearance(named: .darkAqua)
        }
    }
}

// MARK: - 상태

@MainActor
final class GameState: ObservableObject {
    @Published var s = SaveData()
    @Published var bet: Double = 10_000
    @Published var allIn = false
    @Published var toast = ""
    @Published var lang: Lang = currentLang {
        didSet {
            currentLang = lang
            UserDefaults.standard.set(lang.rawValue, forKey: langKey)
            holdem.languageChanged()
        }
    }
    @Published var showCoach: Bool = UserDefaults.standard.object(forKey: "casino-coach") as? Bool ?? true {
        didSet { UserDefaults.standard.set(showCoach, forKey: "casino-coach") }
    }
    @Published var theme: Theme = Theme(rawValue: UserDefaults.standard.string(forKey: "casino-theme") ?? "") ?? .system {
        didSet {
            UserDefaults.standard.set(theme.rawValue, forKey: "casino-theme")
            NSApplication.shared.appearance = theme.appearance
        }
    }
    let holdem = HoldemGame()
    let online = OnlineAccount()
    /// 랭크 모드: 서버 계정의 칩으로 하고 전체 순위에 반영된다
    @Published var ranked: Bool = UserDefaults.standard.bool(forKey: "kasino-ranked") {
        didSet {
            UserDefaults.standard.set(ranked, forKey: "kasino-ranked")
            allIn = false
            bet = max(1, (money / 100).rounded())
        }
    }
    // 랭크 잔액 = 서버가 확인한 잔액 − 진행 중인 판에 건 돈 + 서버 확인을 기다리는 결과
    // (서버 응답이 진행 중인 판의 차감분을 덮어쓰지 않도록 나눠서 관리한다)
    @Published private(set) var rankServer: Double = 0
    @Published private(set) var openStake: Double = 0
    @Published private(set) var queuedNets: [Int: Double] = [:]
    private var nextRoundId = 1
    var rankBalance: Double { rankServer - openStake + queuedNets.values.reduce(0, +) }
    /// 베팅했지만 아직 정산 전인 판 수 (이 동안은 모드 전환 금지)
    @Published var inFlight = 0
    private(set) var sessionStart: Double = 0
    private var toastTask: Task<Void, Never>?
    private let key = "casino-practice-v1"

    init() {
        load()
        sessionStart = s.bankroll
        holdem.g = self
        online.g = self
        rankServer = online.profile?.balance ?? 0
        if ranked { bet = max(1, (rankBalance / 100).rounded()) }
        NSApplication.shared.appearance = theme.appearance
        Task { await online.refresh() }
    }

    var money: Double { ranked ? rankBalance : s.bankroll }
    var canSwitchMode: Bool { inFlight == 0 && !holdem.inHand }
    var sessionNet: Double { s.bankroll - sessionStart }
    var totalNet: Double { s.bankroll - s.startBankroll }
    func stats(_ game: Game) -> GameStats { s.stats[game.rawValue] ?? GameStats() }

    // 베팅
    func setBet(_ v: Double) { allIn = false; bet = max(1, v.rounded()) }
    var effectiveBet: Double { allIn ? money : bet }

    func placeBet() -> Double? {
        let b = effectiveBet
        return spend(b) ? b : nil
    }

    /// 금액을 차감한다. 잔액이 부족하면 false
    func spend(_ amount: Double) -> Bool {
        if ranked {
            guard online.signedIn else {
                show(T("랭크 모드는 로그인이 필요해요", "Ranked mode needs an account", "ランクモードはログインが必要です"))
                return false
            }
            guard rankBalance >= amount, amount > 0 else {
                show(T("칩이 부족해요 — 베팅을 줄이거나 순위 탭에서 파산 지원을 받으세요",
                       "Not enough chips — lower your bet or claim relief in the Ranking tab",
                       "チップ不足 — 賭け金を下げるか、ランキングタブで救済を受けてください"))
                return false
            }
            openStake += amount
            inFlight += 1
            return true
        }
        guard s.bankroll >= amount, amount > 0 else {
            show(T("잔액이 부족해요 — 베팅을 줄이거나 설정에서 뱅크롤을 리셋하세요",
                   "Insufficient bankroll — lower your bet or reset it in Settings",
                   "残高不足 — 賭け金を下げるか設定でリセットしてください"))
            return false
        }
        s.bankroll -= amount
        inFlight += 1
        return true
    }

    /// 홀덤처럼 판 중간에 칩을 넣을 때: 가진 만큼만 빼고 실제로 뺀 금액을 돌려준다
    func debit(_ amount: Double) -> Double {
        let a = min(amount, money)
        if ranked { openStake += a } else { s.bankroll -= a }
        return a
    }

    func syncBalance(_ b: Double) {
        // 처음 칩을 받았을 때(가입·로그인) 기본 베팅을 잔액의 1%로
        if ranked && rankServer == 0 && b > 0 { allIn = false; bet = max(1, (b / 100).rounded()) }
        rankServer = b
    }

    /// 서버가 이 판을 반영했거나(성공) 버렸을 때(실패)
    func roundAcknowledged(_ id: Int) { queuedNets[id] = nil }

    /// 로그아웃 등으로 계정이 바뀔 때
    func resetRankLedger() {
        queuedNets = [:]
        openStake = 0
    }

    /// 총 반환금(원금 포함)을 지급하고 기록한다. 순손익을 돌려준다
    @discardableResult
    func settle(_ game: Game, bet b: Double, payout: Double, expectedLoss: Double) -> Double {
        inFlight = max(0, inFlight - 1)
        if ranked {
            openStake = max(0, openStake - b)
            let id = nextRoundId
            nextRoundId += 1
            queuedNets[id] = payout - b
            online.submitRound(id: id, game, bet: b, payout: payout)
            return payout - b
        }
        s.bankroll += payout
        let net = payout - b
        var st = stats(game)
        st.record(net: net, wager: b, expectedLoss: expectedLoss)
        s.stats[game.rawValue] = st
        s.curve.append(s.bankroll)
        if s.curve.count > 500 { s.curve.removeFirst(s.curve.count - 500) }
        save()
        return net
    }

    func recordDecision(good: Bool) {
        guard !ranked else { return }   // 통계는 연습 모드 기록
        var st = stats(.holdem)
        st.decisions += 1
        if good { st.goodDecisions += 1 }
        s.stats[Game.holdem.rawValue] = st
    }

    // 바카라 중국점
    var bacHistory: [BacResult] { s.bacHistory }
    func recordBaccarat(_ r: BacResult) {
        s.bacHistory.append(r)
        if s.bacHistory.count > 150 { s.bacHistory.removeFirst(s.bacHistory.count - 150) }
    }
    var dtHistory: [BacResult] { s.dtHistory ?? [] }
    func recordDT(_ r: BacResult) {
        var h = dtHistory
        h.append(r)
        if h.count > 150 { h.removeFirst(h.count - 150) }
        s.dtHistory = h
    }
    // 룰렛 기록
    var rouHistory: [Int] { s.rouHistory ?? [] }
    func recordRoulette(_ n: Int) {
        var h = rouHistory
        h.insert(n, at: 0)
        if h.count > 100 { h.removeLast(h.count - 100) }
        s.rouHistory = h
        save()
    }
    func clearRoulette() {
        s.rouHistory = []
        save()
    }

    func newDTShoe() {
        s.dtHistory = []
        save()
    }

    func newShoe() {
        s.bacHistory = []
        save()
    }

    // 설정
    func setStartBankroll(_ v: Double) {
        s.startBankroll = v
        resetBankroll()
    }
    func resetBankroll() {
        s.bankroll = s.startBankroll
        s.curve.append(s.bankroll)
        sessionStart = s.bankroll
        allIn = false
        bet = max(1, (s.startBankroll / 100).rounded())
        save()
        show(T("뱅크롤을 \(fmt(s.bankroll))(으)로 리셋했어요", "Bankroll reset to \(fmt(s.bankroll))", "残高を \(fmt(s.bankroll)) にリセットしました"))
    }
    func resetStats() {
        s.stats = [:]
        s.curve = [s.bankroll]
        s.bacHistory = []
        s.dtHistory = []
        s.rouHistory = []
        sessionStart = s.bankroll
        save()
        show(T("통계를 초기화했어요", "Stats cleared", "統計をリセットしました"))
    }

    func show(_ msg: String) {
        toast = msg
        toastTask?.cancel()
        toastTask = Task { @MainActor in
            try? await Task.sleep(nanoseconds: 4_000_000_000)
            if !Task.isCancelled { self.toast = "" }
        }
    }

    func save() {
        if let d = try? JSONEncoder().encode(s) { UserDefaults.standard.set(d, forKey: key) }
    }
    func load() {
        guard let d = UserDefaults.standard.data(forKey: key),
              let loaded = try? JSONDecoder().decode(SaveData.self, from: d) else { return }
        s = loaded
        bet = max(1, (s.startBankroll / 100).rounded())
    }
}

// MARK: - 단색 버튼
// 최신 macOS는 .borderedProminent 색 버튼을 반투명 파스텔로 그려 흰 글씨가 안 보인다 → 진한 단색으로 직접 그림

enum Solid {
    static let blue = Color(red: 0.15, green: 0.39, blue: 0.92)
    static let red = Color(red: 0.86, green: 0.15, blue: 0.15)
    static let green = Color(red: 0.09, green: 0.55, blue: 0.27)
    static let orange = Color(red: 0.85, green: 0.42, blue: 0.02)
    static let purple = Color(red: 0.49, green: 0.23, blue: 0.93)
    static let gray = Color(red: 0.45, green: 0.45, blue: 0.48)
}

struct SolidButtonStyle: ButtonStyle {
    let color: Color
    @Environment(\.isEnabled) private var enabled
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .foregroundColor(.white)
            .padding(.horizontal, 8).padding(.vertical, 4)
            .background(RoundedRectangle(cornerRadius: 7).fill(color.opacity(configuration.isPressed ? 0.75 : 1)))
            .opacity(enabled ? 1 : 0.4)
            .contentShape(Rectangle())
    }
}

/// 켜지면 단색, 꺼지면 회색 배경에 기본 글씨색
struct SolidToggleStyle: ToggleStyle {
    let color: Color
    @Environment(\.isEnabled) private var enabled
    func makeBody(configuration: Configuration) -> some View {
        Button { configuration.isOn.toggle() } label: {
            configuration.label
                .foregroundColor(configuration.isOn ? .white : .primary)
                .padding(.horizontal, 8).padding(.vertical, 3)
                .background(RoundedRectangle(cornerRadius: 6).fill(configuration.isOn ? color : Color.secondary.opacity(0.18)))
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .opacity(enabled ? 1 : 0.4)
    }
}

extension ButtonStyle where Self == SolidButtonStyle {
    static func solid(_ c: Color) -> SolidButtonStyle { SolidButtonStyle(color: c) }
}
extension ToggleStyle where Self == SolidToggleStyle {
    static func solid(_ c: Color) -> SolidToggleStyle { SolidToggleStyle(color: c) }
}

// MARK: - 공용 뷰

struct CardView: View {
    let card: Card?
    var small = false
    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 6)
                .fill(card == nil ? Color(red: 0.2, green: 0.3, blue: 0.55) : Color.white)
            RoundedRectangle(cornerRadius: 6)
                .stroke(Color.gray.opacity(0.5), lineWidth: 1)
            if let c = card, let face = c.faceEmoji {
                ZStack(alignment: .topLeading) {
                    RoundedRectangle(cornerRadius: 4)
                        .fill((c.isRed ? Color.red : Color.blue).opacity(0.1))
                        .padding(small ? 3 : 4)
                    Text(face)
                        .font(.system(size: small ? 17 : 28))
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                        .offset(y: small ? 3 : 5)
                    Text(c.label)
                        .font(.system(size: small ? 9 : 11, weight: .heavy, design: .rounded))
                        .foregroundColor(c.isRed ? .red : .black)
                        .padding(.leading, 3).padding(.top, 2)
                }
            } else if let c = card {
                Text(c.label)
                    .font(.system(size: small ? 12 : 16, weight: .bold, design: .rounded))
                    .foregroundColor(c.isRed ? .red : .black)
            }
        }
        .frame(width: small ? 30 : 44, height: small ? 42 : 62)
    }
}

struct BetControl: View {
    @EnvironmentObject var g: GameState
    var disabled = false
    var label: String? = nil
    var body: some View {
        HStack(spacing: 6) {
            Text(label ?? T("베팅", "Bet", "ベット")).foregroundColor(.secondary)
            Text(fmt(g.effectiveBet))
                .font(.body.weight(.semibold).monospacedDigit())
                .foregroundColor(g.allIn ? .red : .primary)
            if g.money > 0 {
                Text(pct(g.effectiveBet / g.money)).font(.caption2.monospacedDigit()).foregroundColor(.secondary)
            }
            Spacer()
            Button("½") { g.setBet(g.effectiveBet / 2) }
            Button("×2") { g.setBet(g.effectiveBet * 2) }
            Button("1%") { g.setBet(g.money / 100) }
            Toggle(T("올인", "All-in", "オールイン"), isOn: $g.allIn).toggleStyle(.solid(Solid.red))
        }
        .controlSize(.small)
        .disabled(disabled)
    }
}

struct ResultText: View {
    let text: String
    let win: Bool?
    var body: some View {
        Text(text.isEmpty ? " " : text)
            .font(.callout.weight(.semibold))
            .foregroundColor(win == nil ? .primary : (win! ? .green : .red))
            .frame(maxWidth: .infinity)
            .multilineTextAlignment(.center)
            .lineLimit(1)
    }
}

// MARK: - 바카라

func baccaratTotal(_ c: [Card]) -> Int { c.reduce(0) { $0 + $1.baccaratValue } % 10 }

/// 드래곤 보너스 총 반환 배수 (mine 쪽에 건 경우)
func dragonBonus(_ mine: [Card], _ other: [Card]) -> Double {
    let m = baccaratTotal(mine), o = baccaratTotal(other)
    let natural = mine.count == 2 && m >= 8
    if natural && m > o { return 2 }                               // 내추럴 승 1:1
    if natural && other.count == 2 && m == o { return 1 }          // 내추럴 타이 반환
    guard !natural, m > o else { return 0 }
    switch m - o {
    case 9: return 31
    case 8: return 11
    case 7: return 7
    case 6: return 5
    case 5: return 3
    case 4: return 2
    default: return 0
    }
}

// MARK: 중국점 (로드맵)

struct BacResult: Codable {
    let winner: Int   // 0 플레이어, 1 뱅커, 2 타이
    let pPair: Bool
    let bPair: Bool
}

enum MarkStyle { case bead, ring, dot, slash }

struct RoadMark {
    var col: Int
    var row: Int
    var color: Color
    var style: MarkStyle
    var text = ""
    var ties = 0
    var pPair = false
    var bPair = false
}

func winnerColor(_ w: Int) -> Color { w == 0 ? .blue : (w == 1 ? .red : .green) }

/// 같은 값이 이어지면 아래로, 6줄을 넘거나 막히면 오른쪽으로 꺾는(드래곤 테일) 대로식 배치
func placeRoad(_ values: [Int]) -> [(col: Int, row: Int)] {
    var pos: [(col: Int, row: Int)] = []
    var occupied = Set<Int>()
    var streakCol = 0
    for (i, v) in values.enumerated() {
        let p: (col: Int, row: Int)
        if i == 0 {
            p = (0, 0)
        } else if v == values[i - 1] {
            let last = pos[i - 1]
            let down = last.row + 1
            if last.col == streakCol && down < 6 && !occupied.contains(last.col * 6 + down) {
                p = (last.col, down)
            } else {
                p = (last.col + 1, last.row)
            }
        } else {
            var c = streakCol + 1
            while occupied.contains(c * 6) { c += 1 }
            streakCol = c
            p = (c, 0)
        }
        if i == 0 { streakCol = 0 }
        pos.append(p)
        occupied.insert(p.col * 6 + p.row)
    }
    return pos
}

struct Roadmap {
    let results: [BacResult]
    var letters = ["P", "B", "T"]

    /// 타이를 뺀 대로 항목 (타이는 직전 항목에 표시)
    var bigRoadEntries: [(winner: Int, ties: Int, pPair: Bool, bPair: Bool)] {
        var out: [(winner: Int, ties: Int, pPair: Bool, bPair: Bool)] = []
        var leadingTies = 0
        for r in results {
            if r.winner == 2 {
                if out.isEmpty { leadingTies += 1 } else { out[out.count - 1].ties += 1 }
            } else {
                out.append((r.winner, out.isEmpty ? leadingTies : 0, r.pPair, r.bPair))
            }
        }
        return out
    }

    var beadMarks: [RoadMark] {
        results.enumerated().map { i, r in
            RoadMark(col: i / 6, row: i % 6, color: winnerColor(r.winner), style: .bead,
                     text: letters[r.winner], pPair: r.pPair, bPair: r.bPair)
        }
    }

    var bigRoadMarks: [RoadMark] {
        let e = bigRoadEntries
        let pos = placeRoad(e.map { $0.winner })
        return zip(e, pos).map { en, p in
            RoadMark(col: p.col, row: p.row, color: winnerColor(en.winner), style: .ring,
                     ties: en.ties, pPair: en.pPair, bPair: en.bPair)
        }
    }

    /// 파생 도로 (k=1 대안로, 2 소로, 3 바퀴벌레). 0 = 빨강(규칙적), 1 = 파랑(불규칙)
    func derived(_ k: Int) -> [Int] {
        let e = bigRoadEntries
        var lens: [Int] = []
        var coords: [(c: Int, r: Int)] = []
        for (i, en) in e.enumerated() {
            if i > 0 && en.winner == e[i - 1].winner { lens[lens.count - 1] += 1 } else { lens.append(1) }
            coords.append((lens.count - 1, lens[lens.count - 1] - 1))
        }
        var out: [Int] = []
        for (c, r) in coords {
            if c < k || (c == k && r == 0) { continue }
            if r == 0 {
                out.append(lens[c - 1] == lens[c - 1 - k] ? 0 : 1)
            } else {
                let l = lens[c - k]
                out.append(l >= r + 1 ? 0 : (l == r ? 1 : 0))
            }
        }
        return out
    }

    func derivedMarks(_ k: Int, style: MarkStyle) -> [RoadMark] {
        let vals = derived(k)
        return zip(vals, placeRoad(vals)).map { v, p in
            RoadMark(col: p.col, row: p.row, color: v == 0 ? .red : .blue, style: style)
        }
    }
}

struct RoadCanvas: View {
    let marks: [RoadMark]
    let cols: Int
    let cell: CGFloat

    var body: some View {
        Canvas { ctx, size in
            var grid = Path()
            for c in 0...cols { grid.move(to: CGPoint(x: CGFloat(c) * cell, y: 0)); grid.addLine(to: CGPoint(x: CGFloat(c) * cell, y: size.height)) }
            for r in 0...6 { grid.move(to: CGPoint(x: 0, y: CGFloat(r) * cell)); grid.addLine(to: CGPoint(x: size.width, y: CGFloat(r) * cell)) }
            ctx.stroke(grid, with: .color(.gray.opacity(0.25)), lineWidth: 0.5)

            // 가장 최근 열이 보이도록 오른쪽 끝에 맞춘다
            let maxCol = marks.map { $0.col }.max() ?? 0
            let offset = max(0, maxCol - cols + 1)
            for m in marks where m.col >= offset {
                let rect = CGRect(x: CGFloat(m.col - offset) * cell, y: CGFloat(m.row) * cell, width: cell, height: cell)
                let inner = rect.insetBy(dx: max(0.8, cell * 0.1), dy: max(0.8, cell * 0.1))
                switch m.style {
                case .bead:
                    ctx.fill(Path(ellipseIn: inner), with: .color(m.color))
                    ctx.draw(Text(m.text).font(.system(size: cell * 0.55, weight: .bold)).foregroundColor(.white),
                             at: CGPoint(x: rect.midX, y: rect.midY))
                case .ring:
                    ctx.stroke(Path(ellipseIn: inner.insetBy(dx: 0.8, dy: 0.8)), with: .color(m.color), lineWidth: max(1.2, cell * 0.15))
                case .dot:
                    ctx.fill(Path(ellipseIn: inner), with: .color(m.color))
                case .slash:
                    var p = Path()
                    p.move(to: CGPoint(x: inner.minX, y: inner.maxY))
                    p.addLine(to: CGPoint(x: inner.maxX, y: inner.minY))
                    ctx.stroke(p, with: .color(m.color), lineWidth: max(1.2, cell * 0.2))
                }
                if m.ties > 0 {
                    var p = Path()
                    p.move(to: CGPoint(x: inner.minX + 1, y: inner.maxY - 1))
                    p.addLine(to: CGPoint(x: inner.maxX - 1, y: inner.minY + 1))
                    ctx.stroke(p, with: .color(.green), lineWidth: 1.5)
                    if m.ties > 1 {
                        ctx.draw(Text("\(m.ties)").font(.system(size: cell * 0.5, weight: .heavy)).foregroundColor(.green),
                                 at: CGPoint(x: rect.midX, y: rect.midY))
                    }
                }
                let d = max(2.5, cell * 0.28)
                if m.bPair { ctx.fill(Path(ellipseIn: CGRect(x: rect.minX, y: rect.minY, width: d, height: d)), with: .color(.red)) }
                if m.pPair { ctx.fill(Path(ellipseIn: CGRect(x: rect.maxX - d, y: rect.maxY - d, width: d, height: d)), with: .color(.blue)) }
            }
        }
        .frame(width: CGFloat(cols) * cell, height: 6 * cell)
        .background(Color.white)
        .clipShape(RoundedRectangle(cornerRadius: 3))
    }
}

struct RoadmapPanel: View {
    let results: [BacResult]
    var letters = ["P", "B", "T"]
    var showPairs = true
    let onNewShoe: () -> Void

    var body: some View {
        let road = Roadmap(results: results, letters: letters)
        let h = results
        VStack(alignment: .leading, spacing: 3) {
            HStack(alignment: .top, spacing: 4) {
                RoadCanvas(marks: road.beadMarks, cols: 8, cell: 12)
                RoadCanvas(marks: road.bigRoadMarks, cols: 22, cell: 12)
            }
            HStack(spacing: 4) {
                RoadCanvas(marks: road.derivedMarks(1, style: .ring), cols: 20, cell: 6)
                RoadCanvas(marks: road.derivedMarks(2, style: .dot), cols: 20, cell: 6)
                RoadCanvas(marks: road.derivedMarks(3, style: .slash), cols: 20, cell: 6)
            }
            HStack(spacing: 8) {
                stat(letters[1], h.filter { $0.winner == 1 }.count, .red)
                stat(letters[0], h.filter { $0.winner == 0 }.count, .blue)
                stat(letters[2], h.filter { $0.winner == 2 }.count, .green)
                if showPairs {
                    stat("BP", h.filter { $0.bPair }.count, .red)
                    stat("PP", h.filter { $0.pPair }.count, .blue)
                }
                Text(T("\(h.count)판", "\(h.count) hands", "\(h.count)回")).font(.system(size: 10)).foregroundColor(.secondary)
                Spacer()
                Button(T("새 슈", "New shoe", "新シュー"), action: onNewShoe)
                    .controlSize(.mini)
                    .disabled(h.isEmpty)
            }
        }
    }

    func stat(_ label: String, _ n: Int, _ color: Color) -> some View {
        HStack(spacing: 2) {
            Text(label).font(.system(size: 9, weight: .heavy)).foregroundColor(.white)
                .padding(.horizontal, 3).background(RoundedRectangle(cornerRadius: 3).fill(color))
            Text("\(n)").font(.system(size: 10, weight: .bold).monospacedDigit())
        }
    }
}

struct BaccaratView: View {
    @EnvironmentObject var g: GameState
    @State private var pCards: [Card] = []
    @State private var bCards: [Card] = []
    @State private var result = T("사이드 베팅을 켜고, 메인 베팅을 누르세요", "Toggle side bets, then pick a main bet", "サイドベットを選んでメインベットを押してください")
    @State private var detail = ""
    @State private var win: Bool? = nil
    @State private var dealing = false
    @State private var sides: Set<Int> = []

    static var sideNames: [String] {
        [T("P 페어", "P Pair", "Pペア"), T("B 페어", "B Pair", "Bペア"),
         T("P 보너스", "P Bonus", "Pボーナス"), T("B 보너스", "B Bonus", "Bボーナス")]
    }
    static var sideInfo: [String] {
        ["11:1", "11:1", T("최대 30:1", "up to 30:1", "最大30:1"), T("최대 30:1", "up to 30:1", "最大30:1")]
    }

    var body: some View {
        VStack(spacing: 6) {
            HStack(spacing: 6) {
                hand(T("플레이어", "Player", "プレイヤー"), pCards, .blue)
                hand(T("뱅커", "Banker", "バンカー"), bCards, .red)
            }
            VStack(spacing: 1) {
                ResultText(text: result, win: win)
                Text(detail.isEmpty ? " " : detail).font(.caption).foregroundColor(.secondary).lineLimit(1)
            }
            RoadmapPanel(results: g.bacHistory) { g.newShoe() }
            BetControl(disabled: dealing)
            HStack(spacing: 6) {
                ForEach(0..<4, id: \.self) { i in
                    Toggle(isOn: Binding(
                        get: { sides.contains(i) },
                        set: { if $0 { sides.insert(i) } else { sides.remove(i) } }
                    )) {
                        VStack(spacing: 0) {
                            Text(Self.sideNames[i]).font(.caption2.bold())
                            Text(Self.sideInfo[i]).font(.system(size: 9))
                        }
                        .frame(maxWidth: .infinity)
                    }
                    .toggleStyle(.solid(i % 2 == 0 ? Solid.blue : Solid.red))
                    .disabled(dealing)
                }
            }
            Text(sides.isEmpty ? T("사이드 베팅 없음 (켜면 메인과 같은 금액이 걸려요)", "No side bets (each costs the same as the main bet)", "サイドベットなし（メインと同額が賭けられます）")
                 : T("사이드", "Side", "サイド") + " \(sides.count) × \(fmt(g.allIn ? g.money / Double(1 + sides.count) : g.effectiveBet)) · \(T("총", "total", "合計")) \(fmt(g.allIn ? g.money : g.effectiveBet * Double(1 + sides.count)))")
                .font(.caption2).foregroundColor(.secondary)
            HStack {
                betButton(T("플레이어", "Player", "プレイヤー"), "1:1", 0, Solid.blue)
                betButton(T("타이", "Tie", "タイ"), "8:1", 2, Solid.green)
                betButton(T("뱅커", "Banker", "バンカー"), "0.95:1", 1, Solid.red)
            }
        }
    }

    func hand(_ name: String, _ cards: [Card], _ color: Color) -> some View {
        HStack(spacing: 4) {
            VStack(alignment: .leading, spacing: 0) {
                Text(name).font(.caption2.bold()).foregroundColor(color).lineLimit(1)
                Text(cards.isEmpty ? "-" : "\(baccaratTotal(cards))").font(.title2.bold().monospacedDigit())
                if cards.count >= 2 && cards[0].rank == cards[1].rank {
                    Text(T("페어!", "Pair!", "ペア！")).font(.system(size: 9, weight: .bold)).foregroundColor(.white)
                        .padding(.horizontal, 4)
                        .background(Capsule().fill(color))
                }
            }
            .frame(width: 52, alignment: .leading)
            HStack(spacing: 2) {
                ForEach(cards) { CardView(card: $0, small: true) }
                if cards.isEmpty { CardView(card: nil, small: true); CardView(card: nil, small: true) }
            }
            Spacer(minLength: 0)
        }
        .padding(6)
        .background(RoundedRectangle(cornerRadius: 8).fill(color.opacity(0.08)))
    }

    func betButton(_ label: String, _ odds: String, _ side: Int, _ color: Color) -> some View {
        Button { play(side) } label: {
            HStack(spacing: 4) {
                Text(label).font(.callout.weight(.semibold))
                Text(odds).font(.caption2).opacity(0.8)
            }
            .lineLimit(1)
            .frame(maxWidth: .infinity, minHeight: 26)
        }
        .buttonStyle(.solid(color))
        .disabled(dealing)
    }

    func play(_ side: Int) {
        let chosen = sides.sorted()
        let b = g.allIn ? g.money / Double(1 + chosen.count) : g.effectiveBet
        let stake = g.allIn ? g.money : b * Double(1 + chosen.count)
        guard g.spend(stake) else { return }
        dealing = true; win = nil; result = T("카드를 돌리는 중...", "Dealing...", "配っています..."); detail = ""
        pCards = []; bCards = []
        var shoe = Card.deck(6)
        Task { @MainActor in
            @MainActor func draw(_ toPlayer: Bool) async {
                try? await Task.sleep(nanoseconds: 350_000_000)
                withAnimation(.spring()) {
                    if toPlayer { pCards.append(shoe.removeLast()) } else { bCards.append(shoe.removeLast()) }
                }
            }
            await draw(true); await draw(false); await draw(true); await draw(false)
            let p = baccaratTotal(pCards), bk = baccaratTotal(bCards)
            if p < 8 && bk < 8 {
                var playerThird: Int? = nil
                if p <= 5 {
                    await draw(true)
                    playerThird = pCards[2].baccaratValue
                }
                let bt = baccaratTotal(bCards)
                let bankerDraws: Bool
                if let t = playerThird {
                    switch bt {
                    case 0...2: bankerDraws = true
                    case 3: bankerDraws = t != 8
                    case 4: bankerDraws = (2...7).contains(t)
                    case 5: bankerDraws = (4...7).contains(t)
                    case 6: bankerDraws = (6...7).contains(t)
                    default: bankerDraws = false
                    }
                } else {
                    bankerDraws = bt <= 5
                }
                if bankerDraws { await draw(false) }
            }
            try? await Task.sleep(nanoseconds: 300_000_000)

            let pf = baccaratTotal(pCards), bf = baccaratTotal(bCards)
            let outcome = pf > bf ? 0 : (bf > pf ? 1 : 2)
            var payout = 0.0
            if outcome == side {
                payout = side == 0 ? b * 2 : (side == 1 ? b * 1.95 : b * 9)
            } else if outcome == 2 {
                payout = b  // 타이면 플레이어/뱅커 베팅은 반환
            }

            // 사이드 베팅 정산
            var notes: [String] = []
            for sb in chosen {
                let m: Double
                switch sb {
                case 0: m = pCards[0].rank == pCards[1].rank ? 12 : 0
                case 1: m = bCards[0].rank == bCards[1].rank ? 12 : 0
                case 2: m = dragonBonus(pCards, bCards)
                default: m = dragonBonus(bCards, pCards)
                }
                payout += b * m
                let name = Self.sideNames[sb]
                notes.append(m > 1 ? "\(name) ✅+\(fmt(b * (m - 1)))" : (m == 1 ? "\(name) " + T("반환", "push", "返却") : "\(name) ❌"))
            }

            g.recordBaccarat(BacResult(winner: outcome,
                                       pPair: pCards[0].rank == pCards[1].rank,
                                       bPair: bCards[0].rank == bCards[1].rank))
            // 하우스 엣지: 플레이어 1.24%, 뱅커 1.06%, 타이 14.36% / 페어 10.36%, 드래곤 P 2.65%, B 9.37%
            let mainEdge = [0.0124, 0.0106, 0.1436][side]
            let sideEdges = [0.1036, 0.1036, 0.0265, 0.0937]
            let expLoss = b * (mainEdge + chosen.reduce(0.0) { $0 + sideEdges[$1] })
            let net = g.settle(.baccarat, bet: stake, payout: payout, expectedLoss: expLoss)
            let who = [T("플레이어 승", "Player wins", "プレイヤーの勝ち"), T("뱅커 승", "Banker wins", "バンカーの勝ち"), T("타이", "Tie", "タイ")][outcome]
            detail = notes.joined(separator: " · ")
            if net > 0 { result = "\(who)! +\(fmt(net)) 🎉"; win = true; NSSound(named: "Hero")?.play() }
            else if net == 0 { result = "\(who) — " + T("본전", "break even", "プラマイゼロ"); win = nil }
            else { result = "\(who)… -\(fmt(-net))"; win = false }
            dealing = false
        }
    }
}

// MARK: - 용호

/// 용호 카드 값: A = 1 … K = 13
func dtValue(_ c: Card) -> Int { c.rank == 14 ? 1 : c.rank }

/// 중국점용 기호 (결과 0 = 호, 1 = 용, 2 = 타이)
var dtLetters: [String] { [T("호", "T", "虎"), T("용", "D", "龍"), T("타", "=", "和")] }

struct DragonTigerView: View {
    @EnvironmentObject var g: GameState
    @State private var dragon: Card? = nil
    @State private var tiger: Card? = nil
    @State private var outcome: Int? = nil
    @State private var result = T("용 · 호 · 타이 중 하나에 베팅하세요", "Bet on Dragon, Tiger or Tie", "龍・虎・タイのいずれかにベット")
    @State private var win: Bool? = nil
    @State private var dealing = false

    var body: some View {
        VStack(spacing: 8) {
            HStack(spacing: 10) {
                side(T("용", "Dragon", "ドラゴン"), dragon, .red, highlighted: outcome == 1)
                Text("VS").font(.caption.bold()).foregroundColor(.secondary)
                side(T("호", "Tiger", "タイガー"), tiger, .blue, highlighted: outcome == 0)
            }

            ResultText(text: result, win: win)

            RoadmapPanel(results: g.dtHistory, letters: dtLetters, showPairs: false) { g.newDTShoe() }

            BetControl(disabled: dealing)

            HStack {
                betButton(T("용", "Dragon", "龍"), "1:1", 1, Solid.red)
                betButton(T("타이", "Tie", "タイ"), "8:1", 2, Solid.green)
                betButton(T("호", "Tiger", "虎"), "1:1", 0, Solid.blue)
            }
            Text(T("타이가 나오면 용·호 베팅은 절반을 돌려받아요 · A는 1, K는 13",
                   "On a tie, Dragon/Tiger bets lose half · A = 1, K = 13",
                   "タイの場合、龍・虎ベットは半額返却 · A=1、K=13"))
                .font(.caption2).foregroundColor(.secondary)
        }
    }

    func side(_ name: String, _ card: Card?, _ color: Color, highlighted: Bool) -> some View {
        HStack(spacing: 10) {
            VStack(alignment: .leading, spacing: 0) {
                Text(name).font(.caption.bold()).foregroundColor(color)
                Text(card.map { "\(dtValue($0))" } ?? "-").font(.title2.bold().monospacedDigit())
            }
            Spacer(minLength: 0)
            CardView(card: card)
        }
        .padding(8)
        .frame(maxWidth: .infinity)
        .background(RoundedRectangle(cornerRadius: 8).fill(color.opacity(highlighted ? 0.22 : 0.08)))
        .overlay(RoundedRectangle(cornerRadius: 8).stroke(highlighted ? color : Color.clear, lineWidth: 2))
    }

    func betButton(_ label: String, _ odds: String, _ bet: Int, _ color: Color) -> some View {
        Button { play(bet) } label: {
            HStack(spacing: 4) {
                Text(label).font(.callout.weight(.semibold))
                Text(odds).font(.caption2).opacity(0.8)
            }
            .lineLimit(1)
            .frame(maxWidth: .infinity, minHeight: 26)
        }
        .buttonStyle(.solid(color))
        .disabled(dealing)
    }

    func play(_ bet: Int) {
        guard let b = g.placeBet() else { return }
        dealing = true; win = nil; outcome = nil
        dragon = nil; tiger = nil
        result = T("카드를 돌리는 중...", "Dealing...", "配っています...")
        var shoe = Card.deck(8)
        Task { @MainActor in
            try? await Task.sleep(nanoseconds: 400_000_000)
            withAnimation(.spring()) { dragon = shoe.removeLast() }
            try? await Task.sleep(nanoseconds: 500_000_000)
            withAnimation(.spring()) { tiger = shoe.removeLast() }
            try? await Task.sleep(nanoseconds: 300_000_000)

            let dv = dtValue(dragon!), tv = dtValue(tiger!)
            let o = dv > tv ? 1 : (tv > dv ? 0 : 2)
            var payout = 0.0
            if bet == o { payout = bet == 2 ? b * 9 : b * 2 }
            else if o == 2 { payout = b / 2 }   // 타이: 용·호 베팅 절반 반환
            outcome = o
            g.recordDT(BacResult(winner: o, pPair: false, bPair: false))
            // 하우스 엣지 (8덱): 용·호 3.73%, 타이 32.77%
            let net = g.settle(.dragonTiger, bet: b, payout: payout, expectedLoss: b * (bet == 2 ? 0.3277 : 0.0373))
            let who = [T("호 승", "Tiger wins", "虎の勝ち"), T("용 승", "Dragon wins", "龍の勝ち"), T("타이", "Tie", "タイ")][o]
            if net > 0 { result = "\(who)! +\(fmt(net))"; win = true; NSSound(named: "Hero")?.play() }
            else { result = "\(who) · −\(fmt(-net))"; win = false }
            dealing = false
        }
    }
}

// MARK: - 룰렛

let redNumbers: Set<Int> = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]

func rouletteColor(_ n: Int) -> Color {
    n == 0 ? .green : (redNumbers.contains(n) ? .red : .black)
}

enum Spot: Hashable {
    case num(Int), red, black, odd, even, low, high, dozen(Int), column(Int)

    /// 총 반환 배수 (원금 포함)
    var multiplier: Double {
        switch self {
        case .num: return 36
        case .dozen, .column: return 3
        default: return 2
        }
    }

    func wins(_ n: Int) -> Bool {
        switch self {
        case .num(let x): return n == x
        case .red: return redNumbers.contains(n)
        case .black: return n != 0 && !redNumbers.contains(n)
        case .odd: return n != 0 && n % 2 == 1
        case .even: return n != 0 && n % 2 == 0
        case .low: return (1...18).contains(n)
        case .high: return (19...36).contains(n)
        case .dozen(let d): return n != 0 && (n - 1) / 12 == d - 1
        case .column(let c): return n != 0 && n % 3 == c % 3
        }
    }

    var label: String {
        switch self {
        case .num(let x): return "\(x)"
        case .red: return T("빨강", "Red", "赤")
        case .black: return T("검정", "Black", "黒")
        case .odd: return T("홀", "Odd", "奇数")
        case .even: return T("짝", "Even", "偶数")
        case .low: return "1-18"
        case .high: return "19-36"
        case .dozen(let d): return ["1st", "2nd", "3rd"][d - 1] + " 12"
        case .column(let c): return T("\(c)열", "Col \(c)", "\(c)列")
        }
    }
}

/// 룰렛 기록 요약: 색·홀짝·구간 비율, 많이 나온 번호와 오래 안 나온 번호
struct RouletteStats: View {
    let history: [Int]

    var body: some View {
        let h = history
        let total = Double(max(h.count, 1))
        let share = { (k: Int) in h.isEmpty ? "—" : String(format: "%.0f%%", Double(k) / total * 100) }
        let red = h.filter { redNumbers.contains($0) }.count
        let zero = h.filter { $0 == 0 }.count
        var counts = [Int](repeating: 0, count: 37)
        for n in h { counts[n] += 1 }
        let hot = (0...36).filter { counts[$0] > 1 }.sorted { counts[$0] > counts[$1] }.prefix(4)
        // 가장 오래 안 나온 번호: 최근 기록에서 처음 나오는 위치가 가장 먼(또는 아예 없는) 번호
        let gap = { (n: Int) in h.firstIndex(of: n) ?? h.count + 1 }
        let cold = h.count < 20 ? [] : Array((0...36).sorted { gap($0) > gap($1) }.prefix(4))
        return VStack(alignment: .leading, spacing: 4) {
            HStack(spacing: 10) {
                pair(T("빨강", "Red", "赤"), share(red), Color.red)
                pair(T("검정", "Black", "黒"), share(h.count - red - zero), Color.primary)
                pair("0", share(zero), Color.green)
                Divider().frame(height: 12)
                pair(T("홀", "Odd", "奇"), share(h.filter { $0 != 0 && $0 % 2 == 1 }.count), Color.secondary)
                pair(T("짝", "Even", "偶"), share(h.filter { $0 != 0 && $0 % 2 == 0 }.count), Color.secondary)
            }
            HStack(spacing: 10) {
                pair("1-18", share(h.filter { (1...18).contains($0) }.count), Color.secondary)
                pair("19-36", share(h.filter { (19...36).contains($0) }.count), Color.secondary)
                Divider().frame(height: 12)
                ForEach(1...3, id: \.self) { d in
                    pair(["1st", "2nd", "3rd"][d - 1], share(h.filter { $0 != 0 && ($0 - 1) / 12 == d - 1 }.count), Color.secondary)
                }
            }
            HStack(spacing: 14) {
                balls(T("많이 나온 번호", "Hot", "よく出る"), Array(hot))
                balls(T("오래 안 나온 번호", "Cold", "出ていない"), cold)
            }
        }
        .font(.caption2.monospacedDigit())
        .padding(.horizontal, 8).padding(.vertical, 5)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: 8).fill(Color.secondary.opacity(0.08)))
    }

    func pair(_ label: String, _ value: String, _ color: Color) -> some View {
        HStack(spacing: 3) {
            Text(label).foregroundColor(color == .secondary ? .secondary : color).fontWeight(.semibold)
            Text(value)
        }
    }

    func balls(_ label: String, _ nums: [Int]) -> some View {
        HStack(spacing: 2) {
            Text(label).foregroundColor(.secondary).fontWeight(.semibold).fixedSize()
            if nums.isEmpty { Text("—") }
            ForEach(nums, id: \.self) { n in
                Text("\(n)").font(.system(size: 8, weight: .bold).monospacedDigit()).foregroundColor(.white)
                    .frame(width: 15, height: 15).background(Circle().fill(rouletteColor(n)))
            }
        }
    }
}

struct RouletteView: View {
    @EnvironmentObject var g: GameState
    @State private var selected: Set<Spot> = []
    @State private var number: Int? = nil
    @State private var spinning = false
    @State private var result = T("숫자·구역을 눌러 칩을 놓고 스핀하세요", "Click numbers/areas to place chips, then spin", "数字やエリアをクリックしてチップを置き、スピン")
    @State private var detail = ""
    @State private var win: Bool? = nil

    let cellW: CGFloat = 24, cellH: CGFloat = 22, zeroW: CGFloat = 26, colW: CGFloat = 30

    var perSpot: Double {
        selected.isEmpty ? g.effectiveBet : (g.allIn ? g.money / Double(selected.count) : g.effectiveBet)
    }
    var totalStake: Double { g.allIn ? g.money : g.effectiveBet * Double(selected.count) }

    var body: some View {
        VStack(spacing: 8) {
            HStack(spacing: 14) {
                ZStack {
                    Circle().fill(number.map(rouletteColor) ?? Color.gray.opacity(0.3)).frame(width: 60, height: 60)
                    Circle().stroke(Color.yellow, lineWidth: 3).frame(width: 60, height: 60)
                    Text(number.map(String.init) ?? "?")
                        .font(.system(size: 26, weight: .heavy, design: .rounded).monospacedDigit())
                        .foregroundColor(.white)
                }
                .rotationEffect(.degrees(spinning ? 360 : 0))
                .animation(spinning ? .linear(duration: 0.4).repeatForever(autoreverses: false) : .default, value: spinning)
                VStack(alignment: .leading, spacing: 4) {
                    HStack {
                        Text(T("최근 결과", "Recent", "最近の結果") + (g.rouHistory.isEmpty ? "" : " · " + T("\(g.rouHistory.count)판", "\(g.rouHistory.count) spins", "\(g.rouHistory.count)回")))
                            .font(.caption).foregroundColor(.secondary)
                        Spacer()
                        if !g.rouHistory.isEmpty {
                            Button(T("지우기", "Clear", "クリア")) { g.clearRoulette() }
                                .buttonStyle(.plain).font(.caption2).foregroundColor(.secondary)
                                .disabled(spinning)
                        }
                    }
                    LazyVGrid(columns: Array(repeating: GridItem(.fixed(20), spacing: 2), count: 9), alignment: .leading, spacing: 2) {
                        ForEach(Array(g.rouHistory.prefix(18).enumerated()), id: \.offset) { _, n in
                            Text("\(n)").font(.system(size: 9, weight: .bold).monospacedDigit()).foregroundColor(.white)
                                .frame(width: 20, height: 20).background(Circle().fill(rouletteColor(n)))
                        }
                    }
                    .frame(height: 42, alignment: .top)
                }
                Spacer()
            }

            RouletteStats(history: g.rouHistory)

            VStack(spacing: 2) {
                ResultText(text: result, win: win)
                Text(detail.isEmpty ? " " : detail).font(.caption).foregroundColor(.secondary).lineLimit(1)
            }

            board.disabled(spinning)

            BetControl(disabled: spinning, label: T("칩당", "Per chip", "チップ毎"))

            HStack {
                Text(selected.isEmpty ? T("칩 없음", "No chips", "チップなし")
                     : "\(selected.count) × \(fmt(perSpot)) = \(fmt(totalStake))")
                    .font(.caption.monospacedDigit()).foregroundColor(.secondary)
                Spacer()
                Button(T("지우기", "Clear", "クリア")) { selected.removeAll() }
                    .controlSize(.small)
                    .disabled(spinning || selected.isEmpty)
                Button { spin() } label: { Text("🎡 " + T("스핀", "Spin", "スピン")).bold().frame(minWidth: 70) }
                    .buttonStyle(.solid(Solid.green))
                    .disabled(spinning || selected.isEmpty)
            }
        }
    }

    // 실제 룰렛 테이블 배치: 위 3,6,…,36 / 가운데 2,5,… / 아래 1,4,…
    var board: some View {
        VStack(alignment: .leading, spacing: 1) {
            HStack(spacing: 1) {
                cell(.num(0), "0", .green, zeroW, cellH * 3 + 2)
                VStack(spacing: 1) {
                    ForEach([3, 2, 1], id: \.self) { row in
                        HStack(spacing: 1) {
                            ForEach(0..<12, id: \.self) { col in
                                let n = col * 3 + row
                                cell(.num(n), "\(n)", rouletteColor(n), cellW, cellH)
                            }
                            cell(.column(row), "2:1", .gray, colW, cellH)
                        }
                    }
                }
            }
            HStack(spacing: 1) {
                Color.clear.frame(width: zeroW, height: cellH)
                ForEach(1...3, id: \.self) { d in
                    cell(.dozen(d), Spot.dozen(d).label, .gray, cellW * 4 + 3, cellH)
                }
            }
            HStack(spacing: 1) {
                Color.clear.frame(width: zeroW, height: cellH)
                ForEach([Spot.low, .even, .red, .black, .odd, .high], id: \.self) { s in
                    cell(s, s.label, s == .red ? .red : (s == .black ? .black : .gray), cellW * 2 + 1, cellH)
                }
            }
        }
    }

    func cell(_ spot: Spot, _ text: String, _ color: Color, _ w: CGFloat, _ h: CGFloat) -> some View {
        let on = selected.contains(spot)
        let hit = !spinning && number != nil && spot == .num(number!)
        return Button {
            if on { selected.remove(spot) } else { selected.insert(spot) }
        } label: {
            ZStack {
                Rectangle().fill(color.opacity(0.85))
                Text(text).font(.system(size: 10, weight: .bold)).foregroundColor(.white)
                if on {
                    Circle().fill(Color.yellow).frame(width: 14, height: 14)
                        .overlay(Circle().stroke(Color.orange, lineWidth: 2))
                        .shadow(radius: 1)
                        .offset(x: w / 2 - 8, y: -h / 2 + 8)
                }
            }
            .frame(width: w, height: h)
            .overlay(Rectangle().stroke(hit ? Color.yellow : Color.white.opacity(0.25), lineWidth: hit ? 3 : 0.5))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    func spin() {
        let spots = Array(selected)
        guard !spots.isEmpty else { return }
        let per = perSpot
        let stake = totalStake
        guard g.spend(stake) else { return }
        spinning = true; win = nil; detail = ""
        result = T("\(spots.count)곳에 \(fmt(stake)) — 휠이 돌아갑니다...", "\(fmt(stake)) on \(spots.count) spots — spinning...", "\(spots.count)か所に \(fmt(stake)) — 回転中...")
        Task { @MainActor in
            for i in 0..<18 {
                number = Int.random(in: 0...36)
                try? await Task.sleep(nanoseconds: UInt64(50_000_000 + i * 12_000_000))
            }
            let n = Int.random(in: 0...36)
            number = n
            g.recordRoulette(n)
            spinning = false
            let hits = spots.filter { $0.wins(n) }
            let payout = hits.reduce(0.0) { $0 + per * $1.multiplier }
            let net = g.settle(.roulette, bet: stake, payout: payout, expectedLoss: stake * 0.027)  // 유럽식 2.7%
            detail = hits.isEmpty ? T("적중 없음", "No hits", "当たりなし") : T("적중: ", "Hits: ", "当たり: ") + hits.map { $0.label }.joined(separator: ", ")
            if net > 0 { result = "\(n)! +\(fmt(net)) 🎉"; win = true; NSSound(named: "Hero")?.play() }
            else if net == 0 { result = "\(n) — " + T("본전", "break even", "プラマイゼロ"); win = nil }
            else { result = "\(n)… -\(fmt(-net))"; win = false }
        }
    }
}

// MARK: - 텍사스 홀덤 (리밋, AI 3명)

let handNameTable: [[String]] = [
    ["하이카드", "원페어", "투페어", "트리플", "스트레이트", "플러시", "풀하우스", "포카드", "스트레이트 플러시"],
    ["High Card", "One Pair", "Two Pair", "Three of a Kind", "Straight", "Flush", "Full House", "Four of a Kind", "Straight Flush"],
    ["ハイカード", "ワンペア", "ツーペア", "スリーカード", "ストレート", "フラッシュ", "フルハウス", "フォーカード", "ストレートフラッシュ"],
]
let scoreBase = 759_375  // 15^5

/// 5장 점수: 족보 * 15^5 + 타이브레이커
func score5(_ c: [Card]) -> Int {
    var counts: [Int: Int] = [:]
    for x in c { counts[x.rank, default: 0] += 1 }
    let groups = counts.sorted { $0.value != $1.value ? $0.value > $1.value : $0.key > $1.key }
    let flush = c.allSatisfy { $0.suit == c[0].suit }
    let ranks = c.map { $0.rank }.sorted(by: >)
    var straightHigh = 0
    if counts.count == 5 {
        if ranks[0] - ranks[4] == 4 { straightHigh = ranks[0] }
        else if ranks == [14, 5, 4, 3, 2] { straightHigh = 5 }
    }
    let cat: Int
    var tb = groups.map { $0.key }
    if straightHigh > 0 && flush { cat = 8; tb = [straightHigh] }
    else if groups[0].value == 4 { cat = 7 }
    else if groups[0].value == 3 && groups[1].value == 2 { cat = 6 }
    else if flush { cat = 5; tb = ranks }
    else if straightHigh > 0 { cat = 4; tb = [straightHigh] }
    else if groups[0].value == 3 { cat = 3 }
    else if groups[0].value == 2 && groups[1].value == 2 { cat = 2 }
    else if groups[0].value == 2 { cat = 1 }
    else { cat = 0; tb = ranks }
    var s = cat
    for i in 0..<5 { s = s * 15 + (i < tb.count ? tb[i] : 0) }
    return s
}

let combos7: [[Int]] = {
    var r: [[Int]] = []
    for a in 0..<7 { for b in (a + 1)..<7 { r.append((0..<7).filter { $0 != a && $0 != b }) } }
    return r
}()

/// 5~7장 중 최고 점수
func bestScore(_ c: [Card]) -> Int {
    if c.count == 5 { return score5(c) }
    if c.count == 7 { return combos7.map { idx in score5(idx.map { c[$0] }) }.max()! }
    return (0..<c.count).map { i in
        bestScore(c.enumerated().filter { $0.offset != i }.map { $0.element })
    }.max()!
}

func handName(_ score: Int) -> String {
    let cat = score / scoreBase
    if cat == 8 && (score / 50_625) % 15 == 14 { return T("로열 플러시", "Royal Flush", "ロイヤルフラッシュ") }
    return handNameTable[currentLang.index][cat]
}

/// 몬테카를로 승률 추정
func equity(_ hole: [Card], _ board: [Card], opponents: Int, iters: Int = 200) -> Double {
    guard opponents > 0 else { return 1 }
    let known = Set((hole + board).map { $0.rank * 4 + $0.suit })
    var rest: [Card] = []
    for s in 0..<4 { for r in 2...14 where !known.contains(r * 4 + s) { rest.append(Card(rank: r, suit: s)) } }
    var total = 0.0
    for _ in 0..<iters {
        var d = rest.shuffled()
        var b = board
        while b.count < 5 { b.append(d.removeLast()) }
        let mine = bestScore(hole + b)
        var best = true
        var ties = 1
        for _ in 0..<opponents {
            let o = bestScore([d.removeLast(), d.removeLast()] + b)
            if o > mine { best = false; break }
            if o == mine { ties += 1 }
        }
        if best { total += 1 / Double(ties) }
    }
    return total / Double(iters)
}

struct Seat {
    let names: [String]   // 한국어, 영어, 일본어
    var name: String { names[currentLang.index] }
    let emoji: String
    let isHuman: Bool
    let aggression: Double   // 높을수록 레이즈를 자주
    let tightness: Double    // 높을수록 콜을 까다롭게
    let bluff: Double        // 블러핑 확률
    var cards: [Card] = []
    var folded = false
    var allIn = false
    var roundBet: Double = 0
    var totalIn: Double = 0
    var action = ""
}

@MainActor
final class HoldemGame: ObservableObject {
    weak var g: GameState?

    @Published var seats: [Seat] = [
        Seat(names: ["나", "Me", "自分"], emoji: "😎", isHuman: true, aggression: 0, tightness: 0, bluff: 0),
        Seat(names: ["블러퍼 박", "Bluffer Park", "ブラッファー朴"], emoji: "🤡", isHuman: false, aggression: 0.8, tightness: 0.8, bluff: 0.15),
        Seat(names: ["바위 김", "Rock Kim", "岩のキム"], emoji: "🗿", isHuman: false, aggression: 0.2, tightness: 1.3, bluff: 0.02),
        Seat(names: ["샤크 최", "Shark Choi", "シャーク崔"], emoji: "🦈", isHuman: false, aggression: 0.6, tightness: 1.0, bluff: 0.07),
    ]
    @Published var board: [Card] = []
    @Published var street = 0
    @Published var inHand = false
    @Published var humanTurn = false
    @Published var showdown = false
    static var introMessage: String {
        T("빅블라인드를 정하고 딜을 누르세요 · 리밋 홀덤", "Set the big blind and deal · Limit Hold'em", "ビッグブラインドを決めてディール · リミットホールデム")
    }
    @Published var message = HoldemGame.introMessage
    @Published var win: Bool? = nil
    @Published var winners: Set<Int> = []
    @Published var currentBet: Double = 0
    @Published var turn = 0
    @Published var dealer = 0
    @Published var bb: Double = 0
    @Published var coachEquity: Double? = nil
    @Published var feedback = ""
    var deck: [Card] = []
    var raises = 0
    var needsToAct: Set<Int> = []
    var humanSettled = false

    var pot: Double { seats.reduce(0) { $0 + $1.totalIn } }
    var betSize: Double { street < 2 ? bb : bb * 2 }
    var active: [Int] { seats.indices.filter { !seats[$0].folded } }
    var toCall: Double { max(0, currentBet - seats[0].roundBet) }
    var canRaise: Bool { raises < 4 }
    var humanHandName: String {
        let all = seats[0].cards + board
        if all.count >= 5 { return handName(bestScore(all)) }
        if all.count == 2 && all[0].rank == all[1].rank { return T("포켓 페어", "Pocket Pair", "ポケットペア") }
        return ""
    }

    /// 언어가 바뀌면 대기 중 안내문을 새 언어로
    func languageChanged() {
        if !inHand { message = HoldemGame.introMessage; win = nil; winners = [] }
        objectWillChange.send()
    }

    var streetNames: [String] {
        [T("프리플랍", "Preflop", "プリフロップ"), T("플랍", "Flop", "フロップ"),
         T("턴", "Turn", "ターン"), T("리버", "River", "リバー")]
    }

    func startHand() {
        guard let g, !inHand else { return }
        bb = g.effectiveBet.rounded()
        guard g.money >= bb else { g.show(T("💸 빅블라인드(\(fmt(bb)))만큼의 돈이 필요해요", "💸 You need at least the big blind (\(fmt(bb)))", "💸 ビッグブラインド(\(fmt(bb)))分のお金が必要です")); return }
        deck = Card.deck()
        board = []; street = 0; showdown = false; win = nil; winners = []; humanSettled = false
        feedback = ""; coachEquity = nil
        for i in seats.indices {
            seats[i].cards = [deck.removeLast(), deck.removeLast()]
            seats[i].folded = false; seats[i].allIn = false
            seats[i].roundBet = 0; seats[i].totalIn = 0; seats[i].action = ""
        }
        dealer = (dealer + 1) % 4
        inHand = true
        let sb = (dealer + 1) % 4, bbi = (dealer + 2) % 4
        put(sb, bb / 2); seats[sb].action = "SB \(fmt(bb / 2))"
        put(bbi, bb); seats[bbi].action = "BB \(fmt(bb))"
        currentBet = bb; raises = 1
        needsToAct = Set(seats.indices.filter { !seats[$0].allIn })
        turn = (dealer + 3) % 4
        message = streetNames[0]
        Task { await run() }
    }

    /// 칩을 팟에 넣는다. 사람은 실제 소지금에서 차감
    func put(_ i: Int, _ amount: Double) {
        var a = amount
        if seats[i].isHuman, let g {
            a = g.debit(a)
            if g.money <= 0 { seats[i].allIn = true }
        }
        seats[i].roundBet += a
        seats[i].totalIn += a
    }

    func run() async {
        while inHand {
            if active.count == 1 { finishUncontested(); return }
            if needsToAct.isEmpty {
                if street == 3 { doShowdown(); return }
                await nextStreet()
                continue
            }
            if !needsToAct.contains(turn) { turn = (turn + 1) % 4; continue }
            if seats[turn].isHuman {
                coachEquity = equity(seats[0].cards, board, opponents: active.count - 1, iters: 500)
                humanTurn = true
                return
            }
            try? await Task.sleep(nanoseconds: seats[0].folded ? 250_000_000 : 700_000_000)
            aiAct(turn)
            turn = (turn + 1) % 4
        }
    }

    func nextStreet() async {
        street += 1
        for i in seats.indices where !seats[i].folded {
            seats[i].roundBet = 0
            if !seats[i].allIn { seats[i].action = "" }
        }
        currentBet = 0; raises = 0
        try? await Task.sleep(nanoseconds: 500_000_000)
        withAnimation(.spring()) {
            if street == 1 { board += [deck.removeLast(), deck.removeLast(), deck.removeLast()] }
            else { board.append(deck.removeLast()) }
        }
        message = streetNames[street]
        let actors = seats.indices.filter { !seats[$0].folded && !seats[$0].allIn }
        needsToAct = actors.count >= 2 ? Set(actors) : []
        turn = (dealer + 1) % 4
    }

    func raise(_ i: Int) {
        let target = currentBet + betSize
        put(i, target - seats[i].roundBet)
        currentBet = target
        raises += 1
        seats[i].action = seats[i].allIn ? T("올인", "All-in", "オールイン") : T("레이즈", "Raise", "レイズ") + " \(fmt(target))"
        needsToAct = Set(seats.indices.filter { $0 != i && !seats[$0].folded && !seats[$0].allIn })
    }

    // MARK: 코치

    var potOdds: Double { toCall > 0 ? toCall / (pot + toCall) : 0 }
    /// 1.0 = 이 인원수에서 평균적인 핸드
    var strength: Double { (coachEquity ?? 0) * Double(active.count) }

    var advice: (text: String, color: Color) {
        guard let eq = coachEquity else { return ("", .gray) }
        if toCall == 0 {
            return strength > 1.4 ? (T("벳 추천", "Bet", "ベット推奨"), .orange) : (T("체크 추천", "Check", "チェック推奨"), .blue)
        }
        if eq < potOdds { return (T("폴드 추천", "Fold", "フォールド推奨"), .red) }
        if strength > 1.5 && canRaise { return (T("레이즈 추천", "Raise", "レイズ推奨"), .orange) }
        return (T("콜 추천", "Call", "コール推奨"), .blue)
    }

    /// 행동 직전에 승률 기준으로 판단을 채점한다 (0 폴드, 1 콜/체크, 2 레이즈, 3 올인)
    func grade(_ action: Int) {
        guard let eq = coachEquity, let g else { return }
        let po = potOdds
        let good: Bool
        let why: String
        switch action {
        case 0:
            good = toCall > 0 && eq < po
            why = toCall == 0 ? T("공짜로 체크할 수 있었어요", "You could have checked for free", "無料でチェックできました")
                : T("승률 \(pct(eq)) ≥ 팟 오즈 \(pct(po)) — 콜이 이득", "Equity \(pct(eq)) ≥ pot odds \(pct(po)) — calling was +EV", "勝率 \(pct(eq)) ≥ ポットオッズ \(pct(po)) — コールが有利")
        case 1:
            good = toCall == 0 || eq >= po - 0.02
            why = T("승률 \(pct(eq)) < 팟 오즈 \(pct(po)) — 폴드가 나았어요", "Equity \(pct(eq)) < pot odds \(pct(po)) — folding was better", "勝率 \(pct(eq)) < ポットオッズ \(pct(po)) — フォールドが良かった")
        case 2:
            good = strength >= 1.1
            why = T("승률 \(pct(eq)) — 레이즈하기엔 약한 핸드", "Equity \(pct(eq)) — too weak to raise", "勝率 \(pct(eq)) — レイズには弱い")
        default:
            good = strength >= 1.5
            why = T("승률 \(pct(eq)) — 올인하기엔 위험한 핸드", "Equity \(pct(eq)) — too risky to shove", "勝率 \(pct(eq)) — オールインは危険")
        }
        g.recordDecision(good: good)
        feedback = good ? "👍 " + T("좋은 판단", "Good decision", "良い判断") + " · " + T("승률", "equity", "勝率") + " \(pct(eq))"
                        : "⚠️ " + why
    }

    // MARK: 사람 행동

    private func humanDone() {
        humanTurn = false
        turn = (turn + 1) % 4
        Task { await run() }
    }

    func humanFold() {
        guard humanTurn else { return }
        grade(0)
        seats[0].folded = true
        seats[0].action = T("폴드", "Fold", "フォールド")
        needsToAct.remove(0)
        settleHuman(payout: 0)
        message = T("폴드 — AI들끼리 마무리 중...", "Folded — AIs finishing the hand...", "フォールド — AI同士で続行中...")
        humanDone()
    }

    func humanCall() {
        guard humanTurn else { return }
        grade(1)
        let c = toCall
        put(0, c)
        seats[0].action = c == 0 ? T("체크", "Check", "チェック") : (seats[0].allIn ? T("올인", "All-in", "オールイン") : T("콜", "Call", "コール") + " \(fmt(c))")
        needsToAct.remove(0)
        humanDone()
    }

    /// 가진 돈 전부를 팟에 넣는다
    func humanAllIn() {
        guard humanTurn, let g, g.money > 0 else { return }
        grade(3)
        let amount = g.money
        let target = seats[0].roundBet + amount
        put(0, amount)
        seats[0].action = T("올인", "All-in", "オールイン") + " \(fmt(amount))"
        if target > currentBet {
            currentBet = target
            raises += 1
            needsToAct = Set(seats.indices.filter { $0 != 0 && !seats[$0].folded && !seats[$0].allIn })
        } else {
            needsToAct.remove(0)
        }
        humanDone()
    }

    func humanRaise() {
        guard humanTurn, canRaise else { return }
        grade(2)
        raise(0)
        humanDone()
    }

    // MARK: AI

    func aiAct(_ i: Int) {
        let s = seats[i]
        let opp = active.count - 1
        let eq = equity(s.cards, board, opponents: opp)
        let strength = eq * Double(opp + 1)          // 1.0 = 평균적인 핸드
        let call = max(0, currentBet - s.roundBet)
        let potOdds = call / (pot + call)
        let r = Double.random(in: 0..<1)
        let othersCanAct = seats.indices.contains { $0 != i && !seats[$0].folded && !seats[$0].allIn }

        if canRaise && othersCanAct &&
            ((strength > 1.6 - s.aggression * 0.4 && r < 0.55 + s.aggression * 0.4) || r < s.bluff) {
            raise(i)
        } else if call == 0 {
            seats[i].action = T("체크", "Check", "チェック")
        } else if eq >= potOdds * s.tightness + 0.03 || r < s.bluff / 2 {
            put(i, call)
            seats[i].action = T("콜", "Call", "コール") + " \(fmt(call))"
        } else {
            seats[i].folded = true
            seats[i].action = T("폴드", "Fold", "フォールド")
        }
        needsToAct.remove(i)
    }

    // MARK: 정산

    /// 사람이 올인했을 때 받을 수 있는 몫(메인 팟)
    func eligiblePot() -> Double {
        let h = seats[0].totalIn
        return seats.reduce(0) { $0 + min($1.totalIn, h) }
    }

    func finishUncontested() {
        let w = active[0]
        winners = [w]
        if w == 0 {
            let net = settleHuman(payout: eligiblePot())
            message = T("모두 폴드! 팟 획득", "Everyone folded! Pot won", "全員フォールド！ポット獲得") + " +\(fmt(net)) 🎉"
        } else {
            message = "\(seats[w].emoji) \(seats[w].name) " + T("승리 (모두 폴드)", "wins (all folded)", "の勝ち（全員フォールド）")
        }
        endHand()
    }

    func doShowdown() {
        showdown = true
        let scores = active.map { ($0, bestScore(seats[$0].cards + board)) }
        let top = scores.map { $0.1 }.max()!
        let ws = scores.filter { $0.1 == top }.map { $0.0 }
        winners = Set(ws)
        let name = handName(top)
        if ws.contains(0) {
            let net = settleHuman(payout: eligiblePot() / Double(ws.count))
            message = ws.count > 1
                ? T("무승부", "Split", "引き分け") + " (\(name)) \(net >= 0 ? "+" : "-")\(fmt(abs(net)))"
                : T("승리!", "You win!", "勝利！") + " \(name) +\(fmt(net)) 🎉"
        } else {
            let net = settleHuman(payout: 0)
            let names = ws.map { "\(seats[$0].emoji) \(seats[$0].name)" }.joined(separator: ", ")
            message = "\(names) " + T("승리", "wins", "の勝ち") + " — \(name)" + (net < 0 ? " (-\(fmt(-net)))" : "")
        }
        endHand()
    }

    func endHand() {
        inHand = false
        humanTurn = false
    }

    @discardableResult
    func settleHuman(payout: Double) -> Double {
        guard !humanSettled, let g else { return 0 }
        humanSettled = true
        let staked = seats[0].totalIn
        if staked == 0 && payout == 0 { win = nil; return 0 }
        let net = g.settle(.holdem, bet: staked, payout: payout, expectedLoss: 0)
        win = net > 0 ? true : (net < 0 ? false : nil)
        if net > 0 { NSSound(named: "Hero")?.play() }
        return net
    }
}

struct HoldemView: View {
    @EnvironmentObject var g: GameState
    @ObservedObject var h: HoldemGame

    var body: some View {
        VStack(spacing: 8) {
            HStack(spacing: 6) {
                ForEach(1..<4, id: \.self) { aiSeat($0) }
            }

            VStack(spacing: 4) {
                HStack(spacing: 4) {
                    ForEach(0..<5, id: \.self) { i in
                        CardView(card: i < h.board.count ? h.board[i] : nil, small: true)
                            .opacity(i < h.board.count ? 1 : 0.2)
                    }
                }
                Text(T("팟", "Pot", "ポット") + " \(fmt(h.pot))").font(.caption.weight(.semibold).monospacedDigit())
            }
            .padding(6)
            .frame(maxWidth: .infinity)
            .background(RoundedRectangle(cornerRadius: 10).fill(Color.green.opacity(0.12)))

            // 내 자리
            HStack(spacing: 6) {
                ForEach(0..<2, id: \.self) { i in
                    CardView(card: i < h.seats[0].cards.count ? h.seats[0].cards[i] : nil)
                }
                .opacity(h.seats[0].folded ? 0.35 : 1)
                VStack(alignment: .leading, spacing: 2) {
                    HStack(spacing: 4) {
                        Text(h.seats[0].name).font(.callout.bold())
                        if h.dealer == 0 { dealerChip }
                    }
                    Text(h.humanHandName).font(.caption.bold()).foregroundColor(.orange)
                    Text(h.seats[0].action).font(.caption).foregroundColor(.secondary)
                }
                Spacer()
            }
            .padding(6)
            .background(RoundedRectangle(cornerRadius: 8).fill(
                h.winners.contains(0) ? Color.yellow.opacity(0.25)
                : (h.humanTurn ? Color.orange.opacity(0.12) : Color.secondary.opacity(0.06))))

            if g.showCoach { coachBar }

            ResultText(text: h.message, win: h.win)

            if !h.inHand {
                BetControl(label: T("빅블라인드", "Big blind", "BB"))
                Button { h.startHand() } label: {
                    Text(T("딜", "Deal", "ディール") + " · BB \(fmt(g.effectiveBet))").bold().frame(maxWidth: .infinity, minHeight: 24)
                }
                .buttonStyle(.solid(Solid.green))
            } else if h.humanTurn {
                HStack {
                    Button { h.humanFold() } label: { Text(T("폴드", "Fold", "フォールド")).frame(maxWidth: .infinity, minHeight: 24) }
                        .buttonStyle(.solid(Solid.red))
                    Button { h.humanCall() } label: {
                        Text(h.toCall == 0 ? T("체크", "Check", "チェック")
                             : (g.money <= h.toCall ? T("올인", "All-in", "オールイン") + " \(fmt(g.money))"
                                                    : T("콜", "Call", "コール") + " \(fmt(h.toCall))"))
                            .frame(maxWidth: .infinity, minHeight: 24)
                    }
                    .buttonStyle(.solid(Solid.blue))
                    Button { h.humanRaise() } label: {
                        Text(h.currentBet == 0 ? T("벳", "Bet", "ベット") + " \(fmt(h.betSize))"
                                               : T("레이즈", "Raise", "レイズ") + " \(fmt(h.currentBet + h.betSize))")
                            .frame(maxWidth: .infinity, minHeight: 24)
                    }
                    .buttonStyle(.solid(Solid.orange))
                    .disabled(!h.canRaise || g.money < h.toCall + h.betSize)
                    Button { h.humanAllIn() } label: {
                        Text(T("올인", "All-in", "オールイン")).frame(maxWidth: .infinity, minHeight: 24)
                    }
                    .buttonStyle(.solid(Solid.purple))
                    .disabled(g.money <= 0)
                }
                .font(.callout.weight(.semibold))
            } else {
                HStack(spacing: 6) {
                    ProgressView().controlSize(.small)
                    Text(T("상대 차례...", "Opponents acting...", "相手の番...")).font(.caption).foregroundColor(.secondary)
                }
                .frame(minHeight: 24)
            }
        }
    }

    /// 승률·팟 오즈·추천 액션과 직전 판단 피드백
    var coachBar: some View {
        HStack(spacing: 10) {
            if h.humanTurn, let eq = h.coachEquity {
                metric(T("내 승률", "Equity", "勝率"), pct(eq))
                metric(T("팟 오즈", "Pot odds", "ポットオッズ"), h.toCall > 0 ? pct(h.potOdds) : "—")
                Spacer()
                let a = h.advice
                Text(a.text).font(.caption.bold()).foregroundColor(.white)
                    .padding(.horizontal, 8).padding(.vertical, 3)
                    .background(Capsule().fill(a.color))
            } else {
                Text(h.feedback.isEmpty ? T("내 차례에 승률과 추천 액션이 표시돼요", "Equity and advice appear on your turn", "自分の番に勝率と推奨アクションを表示")
                                        : h.feedback)
                    .font(.caption)
                    .foregroundColor(h.feedback.isEmpty ? .secondary : .primary)
                    .lineLimit(1)
                Spacer()
            }
        }
        .padding(.horizontal, 8)
        .frame(height: 30)
        .background(RoundedRectangle(cornerRadius: 8).stroke(Color.secondary.opacity(0.25)))
    }

    func metric(_ label: String, _ value: String) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(label).font(.system(size: 9)).foregroundColor(.secondary)
            Text(value).font(.caption.bold().monospacedDigit())
        }
    }

    var dealerChip: some View {
        Text("D").font(.system(size: 9, weight: .heavy)).foregroundColor(.black)
            .frame(width: 14, height: 14).background(Circle().fill(Color.white)).overlay(Circle().stroke(Color.gray))
    }

    func aiSeat(_ i: Int) -> some View {
        let s = h.seats[i]
        let reveal = h.showdown && !s.folded
        return VStack(spacing: 3) {
            HStack(spacing: 3) {
                Text(s.name).font(.caption2.bold()).lineLimit(1)
                if h.dealer == i { dealerChip }
            }
            HStack(spacing: 2) {
                ForEach(0..<2, id: \.self) { c in
                    CardView(card: reveal && c < s.cards.count ? s.cards[c] : nil, small: true)
                }
            }
            .opacity(s.folded ? 0.3 : 1)
            Text(s.action.isEmpty ? " " : s.action).font(.caption2)
                .foregroundColor(s.folded ? .secondary : .primary).lineLimit(1)
        }
        .padding(5)
        .frame(maxWidth: .infinity)
        .background(RoundedRectangle(cornerRadius: 8).fill(
            h.winners.contains(i) ? Color.yellow.opacity(0.25)
            : (h.inHand && h.turn == i && !h.humanTurn ? Color.orange.opacity(0.12) : Color.secondary.opacity(0.06))))
    }
}

// MARK: - 슬롯머신

struct SlotSymbol {
    let emoji: String
    let weight: Int
    let triple: Double   // 3개 일치 시 총 반환 배수
}

// 이론 환수율 약 97.5% (체리 2개 = 2배 포함)
let slotSymbols: [SlotSymbol] = [
    SlotSymbol(emoji: "🍒", weight: 30, triple: 6),
    SlotSymbol(emoji: "🍋", weight: 25, triple: 10),
    SlotSymbol(emoji: "🍉", weight: 20, triple: 20),
    SlotSymbol(emoji: "🔔", weight: 12, triple: 40),
    SlotSymbol(emoji: "⭐️", weight: 7, triple: 80),
    SlotSymbol(emoji: "💎", weight: 4, triple: 250),
    SlotSymbol(emoji: "7️⃣", weight: 2, triple: 777),
]

func randomSlotSymbol() -> Int {
    var r = Int.random(in: 0..<slotSymbols.reduce(0) { $0 + $1.weight })
    for (i, s) in slotSymbols.enumerated() {
        if r < s.weight { return i }
        r -= s.weight
    }
    return 0
}

/// (총 반환 배수, 설명)
func slotPayout(_ reels: [Int]) -> (Double, String) {
    if reels[0] == reels[1] && reels[1] == reels[2] {
        let s = slotSymbols[reels[0]]
        return (s.triple, "\(s.emoji)\(s.emoji)\(s.emoji)")
    }
    if reels.filter({ $0 == 0 }).count == 2 { return (2, "🍒🍒") }
    return (0, "")
}

struct SlotsView: View {
    @EnvironmentObject var g: GameState
    @State private var reels = [6, 6, 6]
    @State private var stopped = [true, true, true]
    @State private var spinning = false
    @State private var result = T("레버를 당겨보세요!", "Pull the lever!", "レバーを引いてみよう！")
    @State private var win: Bool? = nil
    @State private var autoLeft = 0
    @State private var autoTask: Task<Void, Never>? = nil
    @State private var flash = false

    var body: some View {
        VStack(spacing: 10) {
            // 기계
            VStack(spacing: 6) {
                HStack(spacing: 8) {
                    ForEach(0..<3, id: \.self) { i in
                        ZStack {
                            RoundedRectangle(cornerRadius: 8).fill(Color.white)
                            Text(slotSymbols[reels[i]].emoji)
                                .font(.system(size: 46))
                                .blur(radius: stopped[i] ? 0 : 1.5)
                                .scaleEffect(stopped[i] ? 1 : 0.9)
                        }
                        .frame(width: 84, height: 88)
                        .overlay(RoundedRectangle(cornerRadius: 8).stroke(flash ? Color.yellow : Color.gray.opacity(0.5), lineWidth: flash ? 4 : 1))
                    }
                }
                .overlay(Rectangle().fill(Color.red.opacity(0.6)).frame(height: 2))
            }
            .padding(10)
            .frame(maxWidth: .infinity)
            .background(RoundedRectangle(cornerRadius: 14).fill(
                Color.secondary.opacity(0.12)))

            ResultText(text: result, win: win)

            // 배당표
            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 4), count: 4), spacing: 3) {
                ForEach(slotSymbols.indices.reversed(), id: \.self) { i in
                    payRow(String(repeating: slotSymbols[i].emoji, count: 3), slotSymbols[i].triple)
                }
                payRow("🍒🍒", 2)
            }
            .padding(6)
            .background(RoundedRectangle(cornerRadius: 6).fill(Color.secondary.opacity(0.1)))

            BetControl(disabled: spinning || autoLeft > 0)

            HStack {
                Button { autoLeft = 0; spinOnce() } label: {
                    Text("🎰 " + T("스핀", "Spin", "スピン")).bold().frame(maxWidth: .infinity, minHeight: 28)
                }
                .buttonStyle(.solid(Solid.red))
                .disabled(spinning || autoLeft > 0)

                Button {
                    if autoLeft > 0 { stopAuto() } else { startAuto(10) }
                } label: {
                    Text(autoLeft > 0 ? T("정지", "Stop", "停止") + " (\(autoLeft))" : T("자동 ×10", "Auto ×10", "オート×10"))
                        .frame(minWidth: 90, minHeight: 28)
                }
                .buttonStyle(.solid(autoLeft > 0 ? Solid.gray : Solid.orange))
                .disabled(spinning && autoLeft == 0)
            }
        }
        .onDisappear { stopAuto() }
    }

    func payRow(_ symbols: String, _ mult: Double) -> some View {
        HStack(spacing: 2) {
            Text(symbols).font(.system(size: 10))
            Spacer(minLength: 0)
            Text("×\(Int(mult))").font(.system(size: 10, weight: .bold).monospacedDigit())
        }
    }

    func startAuto(_ n: Int) {
        autoLeft = n
        autoTask = Task { @MainActor in
            while autoLeft > 0 && !Task.isCancelled {
                guard await spin() else { autoLeft = 0; break }
                autoLeft -= 1
                try? await Task.sleep(nanoseconds: 350_000_000)
            }
            autoLeft = 0
        }
    }

    func stopAuto() {
        autoTask?.cancel()
        autoTask = nil
        autoLeft = 0
    }

    func spinOnce() {
        Task { @MainActor in _ = await spin() }
    }

    /// 한 번 돌린다. 돈이 부족하면 false
    func spin() async -> Bool {
        guard !spinning, let b = g.placeBet() else { return false }
        spinning = true; win = nil; flash = false
        result = T("돌아가는 중...", "Spinning...", "回転中...")
        stopped = [false, false, false]
        let final = (0..<3).map { _ in randomSlotSymbol() }
        let stopAt = [9, 14, 19]   // 릴마다 멈추는 시점
        for tick in 0..<20 {
            for i in 0..<3 where tick < stopAt[i] { reels[i] = Int.random(in: 0..<slotSymbols.count) }
            for i in 0..<3 where tick == stopAt[i] {
                reels[i] = final[i]
                withAnimation(.spring(response: 0.25, dampingFraction: 0.5)) { stopped[i] = true }
            }
            try? await Task.sleep(nanoseconds: 60_000_000)
        }
        reels = final
        stopped = [true, true, true]
        let (mult, combo) = slotPayout(final)
        let net = g.settle(.slots, bet: b, payout: b * mult, expectedLoss: b * 0.025)  // 환수율 97.5%
        if net > 0 {
            win = true
            result = "\(combo) +\(fmt(net)) 🎉"
            withAnimation(.easeInOut(duration: 0.3).repeatCount(4)) { flash = true }
            if mult >= 80 {
                g.show(T("🎰 잭팟! \(combo) ×\(Int(mult))", "🎰 JACKPOT! \(combo) ×\(Int(mult))", "🎰 ジャックポット！\(combo) ×\(Int(mult))"))
                NSSound(named: "Glass")?.play()
            } else {
                NSSound(named: "Hero")?.play()
            }
        } else {
            win = false
            result = T("꽝", "No win", "ハズレ") + " -\(fmt(-net))"
        }
        spinning = false
        return true
    }
}

// MARK: - 통계

struct StatsView: View {
    @EnvironmentObject var g: GameState

    var all: GameStats {
        Game.allCases.map { g.stats($0) }.reduce(into: GameStats()) { a, s in
            a.rounds += s.rounds; a.wins += s.wins; a.losses += s.losses; a.pushes += s.pushes
            a.wagered += s.wagered; a.net += s.net; a.expected += s.expected
            a.bestStreak = max(a.bestStreak, s.bestStreak); a.worstStreak = min(a.worstStreak, s.worstStreak)
        }
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                HStack(spacing: 8) {
                    tile(T("전체 승률", "Win rate", "勝率"), all.winRate.map(pct) ?? "—", nil)
                    tile(T("시작 대비", "vs. start", "開始比"), signed(g.totalNet), g.totalNet)
                    tile(T("운 지수", "Luck", "運指数"), all.rounds > 0 ? signed(all.luck) : "—", all.rounds > 0 ? all.luck : nil)
                }

                VStack(alignment: .leading, spacing: 4) {
                    HStack {
                        Text(T("뱅크롤 추이", "Bankroll", "残高推移")).font(.caption.bold()).foregroundColor(.secondary)
                        Spacer()
                        if g.s.curve.count >= 2 {
                            Text(T("최고", "High", "最高") + " \(fmt(g.s.curve.max()!)) · " + T("최저", "Low", "最低") + " \(fmt(g.s.curve.min()!))")
                                .font(.caption2.monospacedDigit()).foregroundColor(.secondary)
                        }
                    }
                    if g.s.curve.count >= 2 {
                        Chart {
                            ForEach(Array(g.s.curve.enumerated()), id: \.offset) { i, v in
                                LineMark(x: .value("#", i), y: .value("₩", v))
                                    .foregroundStyle(Color.accentColor)
                            }
                            RuleMark(y: .value("start", g.s.startBankroll))
                                .lineStyle(StrokeStyle(lineWidth: 1, dash: [3, 3]))
                                .foregroundStyle(.secondary)
                        }
                        .chartXAxis(.hidden)
                        .chartYScale(domain: chartDomain)
                        .chartYAxis {
                            AxisMarks(values: .automatic(desiredCount: 3)) { _ in AxisGridLine() }
                        }
                        .frame(height: 90)
                    } else {
                        Text(T("아직 기록이 없어요", "No data yet", "まだ記録がありません"))
                            .font(.caption).foregroundColor(.secondary).frame(maxWidth: .infinity, minHeight: 50)
                    }
                }

                Grid(alignment: .trailing, horizontalSpacing: 10, verticalSpacing: 6) {
                    GridRow {
                        Text(T("게임", "Game", "ゲーム")).frame(maxWidth: .infinity, alignment: .leading).gridColumnAlignment(.leading)
                        Text(T("판수", "Hands", "回数"))
                        Text(T("승률", "Win %", "勝率"))
                        Text(T("손익", "Net", "損益"))
                        Text(T("운", "Luck", "運"))
                    }
                    .font(.caption2.bold()).foregroundColor(.secondary)
                    Divider().gridCellUnsizedAxes(.horizontal)
                    ForEach(Game.allCases) { game in
                        let st = g.stats(game)
                        GridRow {
                            Text(game.name).font(.caption.weight(.medium))
                            Text("\(st.rounds)")
                            Text(st.winRate.map(pct) ?? "—")
                            Text(st.rounds > 0 ? signed(st.net) : "—").foregroundColor(color(st.net, st.rounds))
                            Text(game == .holdem ? "—" : (st.rounds > 0 ? signed(st.luck) : "—"))
                                .foregroundColor(game == .holdem ? .secondary : color(st.luck, st.rounds))
                        }
                        .font(.caption.monospacedDigit())
                    }
                }

                let hs = g.stats(.holdem)
                VStack(alignment: .leading, spacing: 4) {
                    Text(T("실력", "Skill", "実力")).font(.caption.bold()).foregroundColor(.secondary)
                    row(T("홀덤 판단 정확도", "Hold'em decision accuracy", "ホールデム判断の正確さ"),
                        hs.accuracy.map { "\(pct($0)) (\(hs.goodDecisions)/\(hs.decisions))" } ?? "—")
                    row(T("최장 연승 / 연패", "Longest win / loss streak", "最長連勝 / 連敗"),
                        "\(all.bestStreak) / \(-all.worstStreak)")
                    row(T("총 베팅액 / ROI", "Total wagered / ROI", "総ベット額 / ROI"),
                        "\(fmt(all.wagered)) / \(all.roi.map(pct) ?? "—")")
                }

                Text(T("운 지수 = 실제 손익 − 기대 손익(하우스 엣지 기준). +면 평균보다 운이 좋았고, −면 나빴다는 뜻이에요. 홀덤은 상대가 AI라 하우스 엣지가 없어서 대신 판단 정확도로 실력을 봐요.",
                       "Luck = actual result − expected result (from the house edge). Positive means you ran above average. Hold'em has no house edge here, so skill is measured by decision accuracy instead.",
                       "運指数 = 実際の損益 − 期待損益（ハウスエッジ基準）。＋なら平均より運が良かったことを意味します。ホールデムはハウスエッジがないため、判断の正確さで実力を測ります。"))
                    .font(.caption2).foregroundColor(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .padding(.trailing, 6)
        }
    }

    /// 시작 뱅크롤과 기록 전체가 보이도록 여유를 둔 y축 범위
    var chartDomain: ClosedRange<Double> {
        let vals = g.s.curve + [g.s.startBankroll]
        let lo = vals.min()!, hi = vals.max()!
        let pad = max((hi - lo) * 0.15, g.s.startBankroll * 0.01)
        return (lo - pad)...(hi + pad)
    }

    func color(_ v: Double, _ rounds: Int) -> Color {
        rounds == 0 || v == 0 ? .secondary : (v > 0 ? .green : .red)
    }

    func tile(_ label: String, _ value: String, _ sign: Double?) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label).font(.caption2).foregroundColor(.secondary)
            Text(value).font(.callout.weight(.semibold).monospacedDigit())
                .foregroundColor(sign.map { $0 > 0 ? .green : ($0 < 0 ? .red : .primary) } ?? .primary)
                .lineLimit(1).minimumScaleFactor(0.6)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(8)
        .background(RoundedRectangle(cornerRadius: 8).fill(Color.secondary.opacity(0.08)))
    }

    func row(_ label: String, _ value: String) -> some View {
        HStack {
            Text(label).font(.caption)
            Spacer()
            Text(value).font(.caption.monospacedDigit().weight(.medium))
        }
    }
}

// MARK: - 온라인 (랭크 모드 계정 · 순위표)

enum OnlineConfig {
    static let url = "https://vyjaipiomptfrjxtwnvb.supabase.co"
    // 공개용(publishable) 키: 앱에 들어가도 되는 값. 데이터는 DB 함수와 권한으로 보호된다(server/schema.sql).
    static let key = "sb_publishable_HTMiQwD-qtNqOSs4aJ6nFA_Bel7On6G"
}

struct OnlineProfile: Codable, Equatable {
    let username: String
    let nickname: String
    let balance: Double
    let peak: Double
    let rounds: Int
    let rank: Int?
    let relief: Bool
}

struct LeaderRow: Codable, Identifiable {
    let nickname: String
    let balance: Double
    let rounds: Int
    let rank: Int
    var id: String { nickname }
}

private struct RPCReply: Decodable {
    let error: String?
    let token: String?
    let profile: OnlineProfile?
}

func onlineErrorText(_ code: String) -> String {
    switch code {
    case "invalid_username": return T("아이디는 영문 소문자, 숫자, _ 로 3~16자예요", "Username: 3–16 lowercase letters, digits or _", "IDは英小文字・数字・_で3〜16文字です")
    case "invalid_nickname": return T("닉네임은 2~12자, 한글·영문·숫자·_만 쓸 수 있어요", "Nickname: 2–12 letters, digits or _", "ニックネームは2〜12文字です")
    case "invalid_password": return T("비밀번호는 6자 이상이어야 해요", "Password must be at least 6 characters", "パスワードは6文字以上です")
    case "username_taken": return T("이미 있는 아이디예요", "That username is taken", "そのIDは使われています")
    case "nickname_taken": return T("이미 있는 닉네임이에요", "That nickname is taken", "そのニックネームは使われています")
    case "invalid_login": return T("아이디 또는 비밀번호가 틀렸어요", "Wrong username or password", "IDまたはパスワードが違います")
    case "locked": return T("비밀번호를 너무 많이 틀렸어요. 10분 뒤에 다시 해 주세요", "Too many attempts. Try again in 10 minutes", "失敗が多すぎます。10分後にお試しください")
    case "session_expired": return T("로그인이 만료됐어요. 다시 로그인해 주세요", "Your session expired. Please sign in again", "ログインの有効期限が切れました")
    case "too_soon", "invalid_round", "insufficient":
        return T("이번 판이 서버에 반영되지 않아 잔액을 서버 기준으로 맞췄어요", "This round wasn't accepted, so your chips were synced with the server", "今回の結果は反映されず、残高をサーバーに合わせました")
    case "relief_unavailable": return T("파산 지원은 칩이 100 미만일 때 하루 한 번만 받을 수 있어요", "Relief is only available once a day when you have under 100 chips", "救済は100チップ未満のとき1日1回だけです")
    case "network": return T("서버에 연결할 수 없어요", "Can't reach the server", "サーバーに接続できません")
    default: return T("오류가 났어요", "Something went wrong", "エラーが発生しました") + " (\(code))"
    }
}

@MainActor
final class OnlineAccount: ObservableObject {
    weak var g: GameState?
    @Published private(set) var profile: OnlineProfile?
    @Published var leaderboard: [LeaderRow] = []
    @Published var busy = false
    @Published var error = ""
    private var token: String?
    /// 마지막 서버 오류 내용 (연결은 됐지만 서버가 거절한 경우)
    private var serverMessage = ""
    /// 라운드 결과를 순서대로, 서버 제한(0.5초)에 걸리지 않게 보낸다
    private var roundQueue: Task<Void, Never>?
    private var lastRoundSent = Date.distantPast

    init() {
        token = UserDefaults.standard.string(forKey: "kasino-session")
        if let d = UserDefaults.standard.data(forKey: "kasino-profile") {
            profile = try? JSONDecoder().decode(OnlineProfile.self, from: d)
        }
    }

    var signedIn: Bool { token != nil && profile != nil }

    private func post(_ name: String, _ params: [String: Any]) async -> Data? {
        var req = URLRequest(url: URL(string: "\(OnlineConfig.url)/rest/v1/rpc/\(name)")!)
        req.httpMethod = "POST"
        req.timeoutInterval = 15
        req.setValue(OnlineConfig.key, forHTTPHeaderField: "apikey")
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = try? JSONSerialization.data(withJSONObject: params)
        serverMessage = ""
        guard let (data, resp) = try? await URLSession.shared.data(for: req),
              let http = resp as? HTTPURLResponse else { return nil }
        guard http.statusCode < 300 else {
            let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
            serverMessage = (obj?["message"] as? String) ?? "HTTP \(http.statusCode)"
            return nil
        }
        return data
    }

    /// 서버 함수 호출. 성공하면 true, 실패하면 error에 문구를 넣고 false
    @discardableResult
    private func call(_ name: String, _ params: [String: Any], showBusy: Bool = true) async -> Bool {
        if showBusy { busy = true }
        defer { if showBusy { busy = false } }
        guard let data = await post(name, params),
              let reply = try? JSONDecoder().decode(RPCReply.self, from: data) else {
            error = serverMessage.isEmpty ? onlineErrorText("network")
                                          : T("서버 오류", "Server error", "サーバーエラー") + ": " + serverMessage
            return false
        }
        if let p = reply.profile { setProfile(p) }
        if let e = reply.error {
            if e == "session_expired" { clear() }
            error = onlineErrorText(e)
            return false
        }
        error = ""
        if let t = reply.token {
            token = t
            UserDefaults.standard.set(t, forKey: "kasino-session")
        }
        return true
    }

    private func setProfile(_ p: OnlineProfile) {
        profile = p
        UserDefaults.standard.set(try? JSONEncoder().encode(p), forKey: "kasino-profile")
        g?.syncBalance(p.balance)
    }

    private func clear() {
        token = nil
        profile = nil
        UserDefaults.standard.removeObject(forKey: "kasino-session")
        UserDefaults.standard.removeObject(forKey: "kasino-profile")
        g?.resetRankLedger()
        g?.syncBalance(0)
    }

    func signIn(_ username: String, _ password: String) async {
        await call("sign_in", ["p_username": username, "p_password": password])
    }

    func signUp(_ username: String, _ password: String, _ nickname: String) async {
        await call("sign_up", ["p_username": username, "p_password": password, "p_nickname": nickname])
    }

    /// 앱 시작 시, 순위 화면을 열 때: 서버의 최신 잔액과 순위를 받아온다
    func refresh() async {
        guard let t = token else { return }
        await call("me", ["p_token": t], showBusy: false)
    }

    func signOut() async {
        if let t = token { _ = await post("sign_out", ["p_token": t]) }
        clear()
        error = ""
    }

    func deleteAccount(_ password: String) async -> Bool {
        guard let t = token else { return false }
        let ok = await call("delete_account", ["p_token": t, "p_password": password])
        if ok { clear() }
        return ok
    }

    func claimRelief() async {
        guard let t = token else { return }
        if await call("claim_relief", ["p_token": t]) {
            g?.show(T("1,000칩을 받았어요", "You received 1,000 chips", "1,000チップを受け取りました"))
        }
    }

    /// 한 판 결과를 서버에 보낸다. 거절되면 그 판은 버리고 서버 잔액으로 맞춘다
    func submitRound(id: Int, _ game: Game, bet: Double, payout: Double) {
        guard let t = token else { g?.roundAcknowledged(id); return }
        let previous = roundQueue
        roundQueue = Task { @MainActor in
            await previous?.value
            let wait = 0.55 - Date().timeIntervalSince(lastRoundSent)
            if wait > 0 { try? await Task.sleep(nanoseconds: UInt64(wait * 1_000_000_000)) }
            lastRoundSent = Date()
            let params: [String: Any] = ["p_token": t, "p_game": game.rawValue,
                                         "p_bet": (bet * 100).rounded() / 100, "p_payout": (payout * 100).rounded() / 100]
            let data = await post("submit_round", params)
            g?.roundAcknowledged(id)          // 응답의 잔액에 이 판이 들어 있거나(성공) 버려졌다(실패)
            let reply = data.flatMap { try? JSONDecoder().decode(RPCReply.self, from: $0) }
            if let p = reply?.profile { setProfile(p) }
            if reply == nil || reply?.error != nil {
                if reply?.error == "session_expired" { clear() }
                error = onlineErrorText(reply?.error ?? "network")
                g?.show(error)
                if reply == nil { await refresh() }
            }
        }
    }

    func loadLeaderboard() async {
        guard let data = await post("leaderboard", ["p_limit": 50]),
              let rows = try? JSONDecoder().decode([LeaderRow].self, from: data) else {
            error = onlineErrorText("network")
            return
        }
        leaderboard = rows
    }
}

/// 로그인 / 가입 폼
struct AuthForm: View {
    @ObservedObject var online: OnlineAccount
    @State private var signUp = true
    @State private var username = ""
    @State private var password = ""
    @State private var nickname = ""

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Picker("", selection: $signUp) {
                Text(T("가입", "Sign up", "新規登録")).tag(true)
                Text(T("로그인", "Sign in", "ログイン")).tag(false)
            }
            .pickerStyle(.segmented)
            .labelsHidden()
            .frame(width: 180)

            TextField(T("아이디", "Username", "ID"), text: $username)
            SecureField(T("비밀번호", "Password", "パスワード"), text: $password)
            if signUp {
                TextField(T("닉네임 (순위표에 보여요)", "Nickname (shown on the leaderboard)", "ニックネーム（ランキングに表示）"), text: $nickname)
            }
            HStack {
                Button {
                    Task {
                        if signUp { await online.signUp(username, password, nickname) }
                        else { await online.signIn(username, password) }
                        if online.signedIn { password = ""; await online.loadLeaderboard() }
                    }
                } label: {
                    Text(signUp ? T("가입하고 1,000칩 받기", "Sign up and get 1,000 chips", "登録して1,000チップ獲得") : T("로그인", "Sign in", "ログイン"))
                        .bold().frame(minWidth: 90)
                }
                .buttonStyle(.solid(Solid.blue))
                .disabled(online.busy || username.isEmpty || password.isEmpty || (signUp && nickname.isEmpty))
                if online.busy { ProgressView().controlSize(.small) }
                Spacer()
            }
            if !online.error.isEmpty {
                Text(online.error).font(.caption).foregroundColor(.red).fixedSize(horizontal: false, vertical: true)
            }
            Text(T("이메일은 필요 없어요. 비밀번호를 잊으면 찾을 방법이 없으니 꼭 기억해 두세요.",
                   "No email needed. There's no password reset, so keep your password somewhere safe.",
                   "メール不要です。パスワードの再設定はできないので忘れないでください。"))
                .font(.caption2).foregroundColor(.secondary)
                .fixedSize(horizontal: false, vertical: true)
        }
        .textFieldStyle(.roundedBorder)
        .padding(10)
        .background(RoundedRectangle(cornerRadius: 10).fill(Color.secondary.opacity(0.08)))
    }
}

/// 랭크 모드에서 로그인하지 않았을 때 게임 탭 대신 보여주는 화면
struct RankedGate: View {
    @ObservedObject var online: OnlineAccount
    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(T("랭크 모드", "Ranked mode", "ランクモード")).font(.title3.bold())
            Text(T("가입하면 1,000칩을 받아요. 모든 게임을 이 칩으로 하고, 가진 칩이 많은 순서로 전체 순위가 매겨져요. 연습 모드 뱅크롤과는 따로예요.",
                   "Sign up and you get 1,000 chips. Every game uses these chips, and everyone is ranked by how many they hold. Separate from your practice bankroll.",
                   "登録すると1,000チップがもらえます。全ゲームでこのチップを使い、所持チップ数で順位が決まります。練習モードの残高とは別です。"))
                .font(.callout).foregroundColor(.secondary)
                .fixedSize(horizontal: false, vertical: true)
            AuthForm(online: online)
            Spacer(minLength: 0)
        }
    }
}

/// 랭크 모드의 순위 탭: 내 정보 + 전체 순위표
struct RankBoardView: View {
    @EnvironmentObject var g: GameState
    @ObservedObject var online: OnlineAccount

    var body: some View {
        VStack(spacing: 8) {
            if let p = online.profile, online.signedIn {
                HStack(spacing: 10) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(p.nickname).font(.headline)
                        Text(T("\(p.rounds)판", "\(p.rounds) rounds", "\(p.rounds)回") + " · " + T("최고", "Peak", "最高") + " \(fmt(p.peak))")
                            .font(.caption.monospacedDigit()).foregroundColor(.secondary)
                    }
                    Spacer()
                    VStack(alignment: .trailing, spacing: 2) {
                        Text(p.rank.map { T("전체 \($0)위", "#\($0)", "全体\($0)位") } ?? "—").font(.headline.monospacedDigit())
                        Text(fmt(p.balance)).font(.caption.monospacedDigit()).foregroundColor(.secondary)
                    }
                }
                .padding(10)
                .background(RoundedRectangle(cornerRadius: 10).fill(Color.secondary.opacity(0.08)))

                if p.relief {
                    Button { Task { await online.claimRelief() } } label: {
                        Text(T("파산 지원 받기 · 1,000칩 (하루 한 번)", "Claim relief · 1,000 chips (once a day)", "救済を受け取る · 1,000チップ（1日1回）"))
                            .bold().frame(maxWidth: .infinity, minHeight: 24)
                    }
                    .buttonStyle(.solid(Solid.orange))
                }
            } else {
                RankedGate(online: online)
            }

            HStack {
                Text(T("전체 순위", "Leaderboard", "ランキング")).font(.caption.bold()).foregroundColor(.secondary)
                Spacer()
                Button { Task { await online.refresh(); await online.loadLeaderboard() } } label: { Image(systemName: "arrow.clockwise") }
                    .buttonStyle(.plain)
            }
            if online.leaderboard.isEmpty {
                Text(T("아직 순위표가 비어 있어요", "The leaderboard is empty so far", "ランキングはまだ空です"))
                    .font(.caption).foregroundColor(.secondary).frame(maxWidth: .infinity, minHeight: 40)
            } else {
                ScrollView {
                    VStack(spacing: 2) {
                        ForEach(online.leaderboard) { row in
                            let me = row.nickname == online.profile?.nickname
                            HStack(spacing: 8) {
                                Text("\(row.rank)").font(.caption.bold().monospacedDigit()).frame(width: 26, alignment: .trailing)
                                Text(row.nickname).font(.callout.weight(me ? .bold : .regular)).lineLimit(1)
                                Spacer()
                                Text(fmt(row.balance)).font(.callout.weight(.semibold).monospacedDigit())
                            }
                            .padding(.horizontal, 8).padding(.vertical, 4)
                            .background(RoundedRectangle(cornerRadius: 6).fill(me ? Color.accentColor.opacity(0.15) : Color.clear))
                        }
                    }
                }
            }
        }
        .task { await online.refresh(); await online.loadLeaderboard() }
    }
}

/// 설정 탭의 계정 섹션
struct AccountSettings: View {
    @ObservedObject var online: OnlineAccount
    @State private var deleting = false
    @State private var password = ""

    var body: some View {
        if let p = online.profile, online.signedIn {
            VStack(alignment: .leading, spacing: 6) {
                Text(T("\(p.nickname) (\(p.username))으로 로그인됨", "Signed in as \(p.nickname) (\(p.username))", "\(p.nickname)（\(p.username)）でログイン中"))
                    .font(.callout)
                if deleting {
                    HStack {
                        SecureField(T("비밀번호 확인", "Confirm password", "パスワード確認"), text: $password)
                            .textFieldStyle(.roundedBorder).frame(width: 150)
                        Button(T("계정 삭제", "Delete", "削除")) {
                            Task { if await online.deleteAccount(password) { deleting = false; password = "" } }
                        }
                        .buttonStyle(.solid(Solid.red))
                        .disabled(password.isEmpty || online.busy)
                        Button(T("취소", "Cancel", "キャンセル")) { deleting = false; password = "" }
                    }
                    Text(T("계정과 칩, 순위표 기록이 영구히 지워져요.", "Your account, chips and leaderboard entry are deleted for good.", "アカウント、チップ、ランキング記録が完全に削除されます。"))
                        .font(.caption2).foregroundColor(.secondary)
                } else {
                    HStack {
                        Button(T("로그아웃", "Sign out", "ログアウト")) { Task { await online.signOut() } }
                        Button(T("계정 삭제", "Delete account", "アカウント削除")) { deleting = true }
                    }
                }
                if !online.error.isEmpty { Text(online.error).font(.caption).foregroundColor(.red) }
            }
        } else {
            Text(T("위쪽에서 랭크 모드로 바꾸면 가입하거나 로그인할 수 있어요.", "Switch to Ranked at the top to sign up or sign in.", "上でランクモードに切り替えると登録・ログインできます。"))
                .font(.caption).foregroundColor(.secondary)
        }
    }
}

// MARK: - 설정

struct SettingsView: View {
    @EnvironmentObject var g: GameState
    @State private var confirmStats = false
    let presets: [Double] = [100_000, 1_000_000, 10_000_000, 100_000_000]

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            section(T("언어", "Language", "言語")) {
                Picker("", selection: $g.lang) {
                    ForEach(Lang.allCases) { Text($0.display).tag($0) }
                }
                .pickerStyle(.segmented)
                .labelsHidden()
            }

            section(T("연습 뱅크롤", "Practice bankroll", "練習用残高")) {
                Picker("", selection: Binding(get: { g.s.startBankroll }, set: { g.setStartBankroll($0) })) {
                    ForEach(Array(presets.enumerated()), id: \.offset) { i, v in
                        Text([T("10만", "100K", "10万"), T("100만", "1M", "100万"),
                              T("1000만", "10M", "1000万"), T("1억", "100M", "1億")][i]).tag(v)
                    }
                }
                .pickerStyle(.segmented)
                .labelsHidden()
                Text(T("실제로 카지노에 가져갈 금액으로 맞추면 연습 효과가 좋아요.",
                       "Match what you'd actually bring to the casino for realistic practice.",
                       "実際にカジノへ持って行く金額に合わせると効果的です。"))
                    .font(.caption).foregroundColor(.secondary)
                Button(T("뱅크롤 리셋", "Reset bankroll", "残高をリセット")) { g.resetBankroll() }
            }

            section(T("화면", "Appearance", "表示")) {
                Picker("", selection: $g.theme) {
                    ForEach(Theme.allCases) { Text($0.label).tag($0) }
                }
                .pickerStyle(.segmented)
                .labelsHidden()
            }

            section(T("홀덤", "Hold'em", "ホールデム")) {
                Toggle(T("코치 표시 (승률 · 팟 오즈 · 추천 액션)", "Show coach (equity · pot odds · advice)", "コーチ表示（勝率・ポットオッズ・推奨）"),
                       isOn: $g.showCoach)
            }

            section(T("랭크 계정", "Ranked account", "ランクアカウント")) {
                AccountSettings(online: g.online)
            }

            section(T("데이터", "Data", "データ")) {
                HStack {
                    // 메뉴바 창에서는 확인 대화상자를 누르면 창이 포커스를 잃어 클릭이 안 먹히므로, 같은 자리에서 확인한다
                    if confirmStats {
                        Text(T("정말 초기화할까요?", "Clear all stats?", "本当にリセット？")).font(.caption)
                        Button(T("초기화", "Clear", "リセット")) { g.resetStats(); confirmStats = false }
                            .buttonStyle(.solid(Solid.red))
                        Button(T("취소", "Cancel", "キャンセル")) { confirmStats = false }
                    } else {
                        Button(T("통계 초기화", "Clear stats", "統計をリセット")) { confirmStats = true }
                    }
                    Spacer()
                    Button(T("앱 종료", "Quit", "終了")) { g.save(); NSApp.terminate(nil) }
                }
            }
            Spacer()
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    func section<C: View>(_ title: String, @ViewBuilder _ content: () -> C) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title).font(.caption.bold()).foregroundColor(.secondary)
            content()
        }
    }
}

// MARK: - 메인 화면

struct ContentView: View {
    @EnvironmentObject var g: GameState
    @ObservedObject var online: OnlineAccount
    @AppStorage("casino-practice-tab") private var tab = 0

    var body: some View {
        VStack(spacing: 10) {
            HStack(alignment: .center) {
                VStack(alignment: .leading, spacing: 0) {
                    Text(g.ranked ? T("랭크 칩", "Ranked chips", "ランクチップ") : T("뱅크롤", "Bankroll", "残高"))
                        .font(.caption).foregroundColor(.secondary)
                    Text(g.ranked && !online.signedIn ? "—" : fmt(g.money)).font(.title2.weight(.semibold).monospacedDigit())
                    if g.ranked {
                        Text(online.profile.flatMap { p in p.rank.map { T("전체 \($0)위", "Rank #\($0)", "全体\($0)位") + " · " + p.nickname } }
                             ?? T("로그인 필요", "Not signed in", "未ログイン"))
                            .font(.caption.monospacedDigit()).foregroundColor(.secondary)
                    } else {
                        Text(T("이번 세션", "This session", "今回のセッション") + " " + signed(g.sessionNet))
                            .font(.caption.monospacedDigit())
                            .foregroundColor(g.sessionNet > 0 ? .green : (g.sessionNet < 0 ? .red : .secondary))
                    }
                }
                Spacer()
                Picker("", selection: $g.ranked) {
                    Text(T("연습", "Practice", "練習")).tag(false)
                    Text(T("랭크", "Ranked", "ランク")).tag(true)
                }
                .pickerStyle(.segmented)
                .labelsHidden()
                .frame(width: 140)
                .disabled(!g.canSwitchMode)
            }

            Picker("", selection: $tab) {
                Text(T("바카라", "Baccarat", "バカラ")).tag(0)
                Text(T("용호", "D·T", "龍虎")).tag(6)
                Text(T("룰렛", "Roulette", "ルーレット")).tag(1)
                Text(T("홀덤", "Hold'em", "ホールデム")).tag(2)
                Text(T("슬롯", "Slots", "スロット")).tag(3)
                Text(g.ranked ? T("순위", "Ranking", "順位") : T("통계", "Stats", "統計")).tag(4)
                Image(systemName: "gearshape").tag(5)
            }
            .pickerStyle(.segmented)
            .labelsHidden()

            Group {
                if g.ranked && !online.signedIn && [0, 1, 2, 3, 6].contains(tab) {
                    RankedGate(online: online)
                } else {
                switch tab {
                case 0: BaccaratView()
                case 1: RouletteView()
                case 2: HoldemView(h: g.holdem)
                case 3: SlotsView()
                case 4:
                    if g.ranked { RankBoardView(online: online) } else { StatsView() }
                case 6: DragonTigerView()
                default: SettingsView()
                }
                }
            }
            .frame(height: 410, alignment: .top)

            Text(g.toast.isEmpty ? " " : g.toast)
                .font(.caption)
                .foregroundColor(.orange)
                .lineLimit(1)
                .frame(maxWidth: .infinity)
        }
        .padding(14)
        .frame(width: 420)
        // 메뉴바 창은 반투명이라, 뒤 배경이 밝으면 다크 모드의 흰 글씨가 묻힌다 → 불투명 배경
        .background(Color(nsColor: .windowBackgroundColor))
    }
}

#if !RENDER_PREVIEW
@main
struct CasinoApp: App {
    @StateObject private var game = GameState()

    var body: some Scene {
        MenuBarExtra {
            ContentView(online: game.online).environmentObject(game)
        } label: {
            Text("♠︎ " + fmtShort(game.money))
        }
        .menuBarExtraStyle(.window)
    }
}
#endif
