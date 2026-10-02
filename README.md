<p align="center"><img src="assets/icon.png" width="112" alt="Kasino"></p>

<h1 align="center">Kasino</h1>

<p align="center">A small casino practice app for the macOS menu bar and the Windows tray.<br>
English · <a href="README.ko.md">한국어</a></p>

Kasino lets you play baccarat, dragon tiger, roulette, hold'em and slots with a practice bankroll, and keeps track of how you're actually doing: win rate, how much of it was luck, and whether your hold'em decisions were sound.

It's for practice only. There's no real money involved, nothing to buy, and nothing to cash out.

## What's in it

- Baccarat with pair and dragon bonus side bets, plus the full roadmap (bead plate, big road, big eye boy, small road, cockroach pig)
- Dragon tiger with its own roadmap
- European roulette. Click as many numbers or areas as you like, then spin once
- Limit hold'em against three AI players. An optional coach shows your equity and the pot odds on your turn, suggests an action, and tells you afterwards whether your call was a good one
- Slots
- A stats page with win rate and results per game, a bankroll chart, and a luck index (your actual result minus what the house edge says you should expect)
- Korean, English and Japanese, light and dark mode

## Download

Grab the latest version from [Releases](../../releases/latest).

**Mac** (macOS 13 or later): open `Kasino-x.y.z.dmg` and drag Kasino into Applications. The app isn't notarized by Apple, so the first time you open it macOS will block it. Go to System Settings > Privacy & Security, scroll down and click Open Anyway. After that it lives in your menu bar.

**Windows** (10 or 11): run `Kasino-Setup-x.y.z.exe` to install, or `Kasino-x.y.z-portable.exe` to run it without installing. If SmartScreen shows up, click More info > Run anyway. Kasino sits in the system tray next to the clock. Click to open, right-click to quit.

## Building from source

Mac: run `mac/build.sh`. You'll get `Kasino.app` and a DMG in `mac/build`. Needs the Xcode command line tools.

Windows: `cd windows`, `npm install`, then `npm run dist`. The installers end up in `windows/dist`. Use `npm start` if you just want to run it.

Pushing a tag like `v1.0.1` builds both versions on GitHub Actions and attaches them to a new release.

## Privacy

Kasino doesn't collect or send anything. All data stays on your computer.
