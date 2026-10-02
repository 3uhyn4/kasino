'use strict';
// Kasino 윈도우 버전: 작업표시줄 트레이 아이콘을 누르면 창이 뜨는 앱
const { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage, screen } = require('electron');
const path = require('path');

let tray = null;
let win = null;

// 캡처 모드는 실제 기록을 건드리지 않도록 임시 저장소 사용
if (process.env.KASINO_CAPTURE) app.setPath('userData', path.join(process.env.KASINO_CAPTURE, 'userdata'));
// 두 개가 동시에 실행되면 같은 저장 파일을 덮어쓰므로, 두 번째 실행은 즉시 종료
// (app.quit()은 비동기라 아래 코드가 계속 실행되므로 process.exit 사용)
if (!app.requestSingleInstanceLock()) process.exit(0);

function createWindow() {
  win = new BrowserWindow({
    width: 448,
    height: 560,
    show: false,
    frame: false,
    resizable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    backgroundColor: '#1e1e1e',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: true },
  });
  win.loadFile(path.join(__dirname, 'src', 'index.html'));
  win.on('blur', () => { if (!process.env.KASINO_CAPTURE) win.hide(); });
}

/** 트레이 아이콘 근처(작업표시줄 위쪽)에 창을 띄운다 */
function showWindow() {
  const tb = tray.getBounds();
  const wb = win.getBounds();
  const area = screen.getDisplayNearestPoint({ x: tb.x, y: tb.y }).workArea;
  let x = Math.round(tb.x + tb.width / 2 - wb.width / 2);
  let y = tb.y > area.y + area.height / 2 ? Math.round(tb.y - wb.height - 6) : Math.round(tb.y + tb.height + 6);
  x = Math.max(area.x + 6, Math.min(x, area.x + area.width - wb.width - 6));
  y = Math.max(area.y + 6, Math.min(y, area.y + area.height - wb.height - 6));
  win.setPosition(x, y, false);
  win.show();
  win.focus();
}

function toggle() {
  if (win.isVisible()) win.hide();
  else showWindow();
}

app.whenReady().then(async () => {
  if (process.platform === 'darwin') app.dock?.hide();
  createWindow();

  // 스크린샷 모드 (개발용): 탭마다 화면을 캡처하고 종료
  if (process.env.KASINO_CAPTURE) return capture(process.env.KASINO_CAPTURE);

  tray = new Tray(nativeImage.createFromPath(path.join(__dirname, 'assets', 'tray.png')));
  tray.setToolTip('Kasino');
  tray.on('click', toggle);
  tray.on('right-click', () => tray.popUpContextMenu(Menu.buildFromTemplate([
    { label: 'Kasino 열기 / Open', click: showWindow },
    { type: 'separator' },
    { label: '종료 / Quit', click: () => app.quit() },
  ])));
});

app.on('second-instance', () => win && showWindow());
app.on('window-all-closed', () => { /* 트레이 앱이라 창이 없어도 계속 실행 */ });

ipcMain.on('quit', () => app.quit());
ipcMain.on('tooltip', (_e, text) => tray?.setToolTip(String(text).slice(0, 120)));

async function capture(outDir) {
  const fs = require('fs');
  await new Promise(r => win.webContents.once('did-finish-load', r));
  win.show();
  // 예시 기록으로 채운다
  await win.webContents.executeJavaScript(`for (let i = 0; i < 40; i++) {
    pushHistory('bacHistory', { w: [0, 1, 1, 0, 2, 1][i % 6], pp: i % 7 === 0, bp: i % 9 === 0 });
    pushHistory('dtHistory', { w: [1, 1, 0, 2, 0, 1, 1][i % 7], pp: false, bp: false });
    spend(10000); settle(GAMES[i % 5], 10000, Math.random() < 0.5 ? 20000 : 0, 200);
  } render();`);
  if (process.env.KASINO_SELFTEST) {
    // 자체 테스트: 모든 게임을 실제로 한 판씩 진행하고 장부가 맞는지 확인
    const r = await win.webContents.executeJavaScript(`(async () => {
      await playBaccarat(1); bac.sides.add(0); bac.sides.add(3); await playBaccarat(0);
      await playDT(0); await playDT(2);
      rou.selected.add('red'); rou.selected.add('n:17'); rou.selected.add('d:2'); await spinRoulette();
      await spinSlot();
      for (let hand = 0; hand < 2; hand++) {
        holdem.startHand();
        for (let k = 0; k < 400 && holdem.inHand; k++) { if (holdem.humanTurn) (hand ? holdem.raiseHuman() : holdem.call()); await sleep(50); }
      }
      const sumNet = GAMES.reduce((a, g) => a + stats(g).net, 0);
      return { bankroll: S.bankroll, start: S.startBankroll, sumNet, balanced: Math.abs(S.bankroll - S.startBankroll - sumNet) < 1e-6,
               rounds: GAMES.map(g => g + ':' + stats(g).rounds).join(' '), holdemMsg: holdem.message, decisions: stats('holdem').decisions };
    })()`);
    console.log('SELFTEST ' + JSON.stringify(r));
  }
  const tabs = ['baccarat', 'dragonTiger', 'roulette', 'holdem', 'slots', 'stats', 'settings'];
  for (const theme of ['light', 'dark']) {
    for (const tab of tabs) {
      await win.webContents.executeJavaScript(`prefs.theme='${theme}'; prefs.tab='${tab}'; applyTheme(); render();`);
      await new Promise(r => setTimeout(r, 300));
      const img = await win.webContents.capturePage();
      fs.writeFileSync(path.join(outDir, `${theme}-${tab}.png`), img.toPNG());
    }
  }
  app.quit();
}
