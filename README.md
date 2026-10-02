<p align="center"><img src="assets/icon.png" width="128" alt="Kasino icon"></p>

<h1 align="center">Kasino</h1>

<p align="center">
카지노 게임 연습 · 확률 학습 도구 — 메뉴바(맥) / 트레이(윈도우) 앱<br>
Casino game practice & odds trainer for the macOS menu bar and Windows tray
</p>

> ⚠️ **Kasino는 연습·학습용이에요. 실제 돈을 걸거나 받을 수 없고, 게임 머니를 사거나 현금으로 바꾸는 기능도 없어요.**
> Kasino is for practice and learning only. No real money can be wagered, won, bought or cashed out.

---

## 한국어

### 기능
- **바카라**: 플레이어 / 뱅커 / 타이, 사이드 베팅(페어, 드래곤 보너스), **그림장(본매·대로·대안로·소로·바퀴벌레)**
- **용호**: 용 / 호 / 타이, 그림장
- **룰렛**: 유럽식 테이블. 숫자·구역을 눌러 여러 곳에 동시에 베팅
- **텍사스 홀덤**: AI 3명과 리밋 홀덤. **코치**가 내 승률·팟 오즈·추천 액션을 보여주고 판단을 채점
- **슬롯머신**: 3릴, 자동 스핀
- **통계**: 게임별 승률·손익, 뱅크롤 그래프, **운 지수**(실제 손익 − 하우스 엣지 기준 기대 손익), 홀덤 판단 정확도
- 뱅크롤 관리 연습(베팅액이 뱅크롤의 몇 %인지 표시), 한국어 / English / 日本語, 라이트·다크 모드

### 설치

[**Releases**](../../releases/latest) 페이지에서 내려받으세요.

**맥 (macOS 13 이상)** — `Kasino-x.y.z.dmg`
1. DMG를 열고 `Kasino`를 옆의 응용 프로그램 폴더로 끌어다 놓아요.
2. 처음 실행하면 "확인할 수 없는 개발자" 경고가 떠요(애플 유료 인증을 받지 않은 무료 앱이라서예요).
   **시스템 설정 → 개인정보 보호 및 보안** 아래쪽의 **"그래도 열기"**를 누르면 실행돼요.
3. 메뉴바에 `♠︎ 1M` 같은 아이콘이 생겨요. 클릭하면 창이 열려요.

**윈도우 (10 / 11)** — `Kasino-Setup-x.y.z.exe`(설치형) 또는 `Kasino-x.y.z-portable.exe`(설치 없이 실행)
1. 실행하면 "Windows의 PC 보호" 창이 뜰 수 있어요. **추가 정보 → 실행**을 누르세요.
2. 작업표시줄 오른쪽 트레이(시계 옆, 안 보이면 ^ 버튼 안)에 ♠ 아이콘이 생겨요. 클릭하면 창이 열리고, 우클릭하면 종료할 수 있어요.

### 직접 빌드
- 맥: `mac/build.sh` → `mac/build/Kasino.app` (Xcode 명령줄 도구 필요)
- 윈도우: `cd windows && npm install && npm run dist` → `windows/dist/`
- 실행만 해 보기: `cd windows && npm install && npm start`

### 릴리스 만들기
`v1.0.0` 같은 태그를 푸시하면 GitHub Actions가 맥·윈도우 버전을 빌드해서 릴리스에 자동으로 올려요.

---

## English

### Features
- **Baccarat** with side bets (pairs, Dragon Bonus) and the full **Chinese roadmap** (bead plate, big road, big eye boy, small road, cockroach pig)
- **Dragon Tiger** with roadmap
- **European roulette** — click numbers/areas to place multiple chips at once
- **Limit Texas Hold'em** vs 3 AI players, with a **coach** that shows your equity, pot odds and a recommended action, then grades your decision
- **Slots** with auto-spin
- **Stats**: win rate and net per game, bankroll chart, **luck index** (actual result − expected result from the house edge), Hold'em decision accuracy
- Bankroll-management practice, Korean / English / Japanese, light & dark themes

### Install
Download from [**Releases**](../../releases/latest).

**macOS 13+** — open the DMG and drag `Kasino` into Applications. The app isn't notarized, so on first launch go to **System Settings → Privacy & Security → Open Anyway**.

**Windows 10/11** — run the installer or the portable exe. If SmartScreen appears, click **More info → Run anyway**. Kasino lives in the system tray (click to open, right-click to quit).

---

Kasino does not collect or send any data. Everything is stored locally on your computer.
