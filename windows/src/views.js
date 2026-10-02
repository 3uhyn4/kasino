'use strict';
// 화면: 탭별 뷰와 전체 렌더링. 상태가 바뀌면 render()로 현재 탭을 다시 그린다.

// ================= 공용 컴포넌트 =================

function cardEl(c, small = false) {
  const cls = 'card' + (small ? ' small' : '') + (c ? '' : ' back');
  if (!c) return h('div', { class: cls });
  const color = isRed(c) ? 'red' : '';
  if (FACES[c.rank]) {
    return h('div', { class: cls + ' face' },
      h('span', { class: 'corner ' + color }, cardLabel(c)),
      h('span', { class: 'fig' }, FACES[c.rank]));
  }
  return h('div', { class: cls }, h('span', { class: color }, cardLabel(c)));
}

function resultText(text, win) {
  return h('div', { class: 'result ' + (win === true ? 'pos' : win === false ? 'neg' : '') }, text || ' ');
}

function betControl(disabled, label) {
  const b = effectiveBet();
  return h('div', { class: 'betctl' },
    h('span', { class: 'muted' }, label || T('베팅', 'Bet', 'ベット')),
    h('b', { class: 'mono' + (allIn ? ' neg' : '') }, fmt(b)),
    S.bankroll > 0 ? h('small', { class: 'muted mono' }, pct(b / S.bankroll)) : null,
    h('span', { class: 'spacer' }),
    h('button', { class: 'btn sm', disabled, onclick: () => setBet(effectiveBet() / 2) }, '½'),
    h('button', { class: 'btn sm', disabled, onclick: () => setBet(effectiveBet() * 2) }, '×2'),
    h('button', { class: 'btn sm', disabled, onclick: () => setBet(S.bankroll / 100) }, '1%'),
    h('button', { class: 'btn sm' + (allIn ? ' on red' : ''), disabled, onclick: () => { allIn = !allIn; render(); } }, T('올인', 'All-in', 'オールイン')));
}

function mainBetButton(label, odds, color, disabled, onclick) {
  return h('button', { class: `btn big ${color}`, disabled, onclick }, h('b', {}, label), ' ', h('small', {}, odds));
}

function roadmapPanel(results, letters, showPairs, onNewShoe) {
  const stat = (label, n, color) => h('span', { class: 'stat' }, h('i', { style: { background: color } }, label), h('b', { class: 'mono' }, n));
  const count = w => results.filter(r => r.w === w).length;
  return h('div', { class: 'roadmap' },
    h('div', { class: 'row gap4' },
      roadCanvas(beadMarks(results, letters), 8, 12),
      roadCanvas(bigRoadMarks(results), 23, 12)),
    h('div', { class: 'row gap4' },
      roadCanvas(derivedMarks(results, 1, 'ring'), 21, 6),
      roadCanvas(derivedMarks(results, 2, 'dot'), 21, 6),
      roadCanvas(derivedMarks(results, 3, 'slash'), 21, 6)),
    h('div', { class: 'row gap8 center' },
      stat(letters[1], count(1), WIN_COLORS[1]),
      stat(letters[0], count(0), WIN_COLORS[0]),
      stat(letters[2], count(2), WIN_COLORS[2]),
      showPairs ? stat('BP', results.filter(r => r.bp).length, WIN_COLORS[1]) : null,
      showPairs ? stat('PP', results.filter(r => r.pp).length, WIN_COLORS[0]) : null,
      h('small', { class: 'muted' }, T(`${results.length}판`, `${results.length} hands`, `${results.length}回`)),
      h('span', { class: 'spacer' }),
      h('button', { class: 'btn xs', disabled: results.length === 0, onclick: onNewShoe }, T('새 슈', 'New shoe', '新シュー'))));
}

// ================= 바카라 =================

const baccaratTotal = cards => cards.reduce((a, c) => a + baccaratValue(c), 0) % 10;

/** 드래곤 보너스 총 반환 배수 (mine 쪽에 건 경우) */
function dragonBonus(mine, other) {
  const m = baccaratTotal(mine), o = baccaratTotal(other);
  const natural = mine.length === 2 && m >= 8;
  if (natural && m > o) return 2;
  if (natural && other.length === 2 && m === o) return 1;
  if (natural || m <= o) return 0;
  return { 9: 31, 8: 11, 7: 7, 6: 5, 5: 3, 4: 2 }[m - o] || 0;
}

const bac = { p: [], b: [], result: '', detail: '', win: null, dealing: false, sides: new Set() };
const sideNames = () => [T('P 페어', 'P Pair', 'Pペア'), T('B 페어', 'B Pair', 'Bペア'), T('P 보너스', 'P Bonus', 'Pボーナス'), T('B 보너스', 'B Bonus', 'Bボーナス')];

function baccaratView() {
  const hand = (name, cards, color) => h('div', { class: `panel tint-${color} row gap4` },
    h('div', { class: 'handinfo' },
      h('small', { class: `b ${color}` }, name),
      h('div', { class: 'total mono' }, cards.length ? baccaratTotal(cards) : '-'),
      cards.length >= 2 && cards[0].rank === cards[1].rank ? h('span', { class: `pill ${color}` }, T('페어!', 'Pair!', 'ペア！')) : null),
    h('div', { class: 'row gap2' }, cards.length ? cards.map(c => cardEl(c, true)) : [cardEl(null, true), cardEl(null, true)]));

  const nSides = bac.sides.size;
  const per = allIn ? S.bankroll / (1 + nSides) : effectiveBet();
  const info = ['11:1', '11:1', T('최대 30:1', 'up to 30:1', '最大30:1'), T('최대 30:1', 'up to 30:1', '最大30:1')];

  return h('div', { class: 'stack' },
    h('div', { class: 'row gap6' },
      hand(T('플레이어', 'Player', 'プレイヤー'), bac.p, 'blue'),
      hand(T('뱅커', 'Banker', 'バンカー'), bac.b, 'red')),
    h('div', {}, resultText(bac.result || T('사이드 베팅을 켜고, 메인 베팅을 누르세요', 'Toggle side bets, then pick a main bet', 'サイドベットを選んでメインベットを押してください'), bac.win),
      h('div', { class: 'detail' }, bac.detail || ' ')),
    roadmapPanel(S.bacHistory, ['P', 'B', 'T'], true, () => { S.bacHistory = []; save(); render(); }),
    betControl(bac.dealing),
    h('div', { class: 'row gap6' }, [0, 1, 2, 3].map(i =>
      h('button', { class: 'btn toggle' + (bac.sides.has(i) ? ' on ' + (i % 2 ? 'red' : 'blue') : ''), disabled: bac.dealing,
                    onclick: () => { bac.sides.has(i) ? bac.sides.delete(i) : bac.sides.add(i); render(); } },
        h('b', {}, sideNames()[i]), h('small', {}, info[i])))),
    h('div', { class: 'caption center' }, nSides === 0
      ? T('사이드 베팅 없음 (켜면 메인과 같은 금액이 걸려요)', 'No side bets (each costs the same as the main bet)', 'サイドベットなし（メインと同額が賭けられます）')
      : `${T('사이드', 'Side', 'サイド')} ${nSides} × ${fmt(per)} · ${T('총', 'total', '合計')} ${fmt(allIn ? S.bankroll : per * (1 + nSides))}`),
    h('div', { class: 'row gap6' },
      mainBetButton(T('플레이어', 'Player', 'プレイヤー'), '1:1', 'blue', bac.dealing, () => playBaccarat(0)),
      mainBetButton(T('타이', 'Tie', 'タイ'), '8:1', 'green', bac.dealing, () => playBaccarat(2)),
      mainBetButton(T('뱅커', 'Banker', 'バンカー'), '0.95:1', 'red', bac.dealing, () => playBaccarat(1))));
}

async function playBaccarat(side) {
  const chosen = [...bac.sides].sort();
  const b = allIn ? S.bankroll / (1 + chosen.length) : effectiveBet();
  const stake = allIn ? S.bankroll : b * (1 + chosen.length);
  if (!spend(stake)) return;
  Object.assign(bac, { dealing: true, win: null, result: T('카드를 돌리는 중...', 'Dealing...', '配っています...'), detail: '', p: [], b: [] });
  render();
  const shoe = makeDeck(6);
  const draw = async toPlayer => { await sleep(350); (toPlayer ? bac.p : bac.b).push(shoe.pop()); render(); };
  await draw(true); await draw(false); await draw(true); await draw(false);
  const p = baccaratTotal(bac.p), bk = baccaratTotal(bac.b);
  if (p < 8 && bk < 8) {
    let third = null;
    if (p <= 5) { await draw(true); third = baccaratValue(bac.p[2]); }
    const bt = baccaratTotal(bac.b);
    let bankerDraws;
    if (third === null) bankerDraws = bt <= 5;
    else if (bt <= 2) bankerDraws = true;
    else if (bt === 3) bankerDraws = third !== 8;
    else if (bt === 4) bankerDraws = third >= 2 && third <= 7;
    else if (bt === 5) bankerDraws = third >= 4 && third <= 7;
    else if (bt === 6) bankerDraws = third >= 6 && third <= 7;
    else bankerDraws = false;
    if (bankerDraws) await draw(false);
  }
  await sleep(300);

  const pf = baccaratTotal(bac.p), bf = baccaratTotal(bac.b);
  const outcome = pf > bf ? 0 : bf > pf ? 1 : 2;
  let payout = 0;
  if (outcome === side) payout = side === 0 ? b * 2 : side === 1 ? b * 1.95 : b * 9;
  else if (outcome === 2) payout = b; // 타이면 플레이어/뱅커 베팅은 반환

  const notes = [];
  for (const sb of chosen) {
    const m = sb === 0 ? (bac.p[0].rank === bac.p[1].rank ? 12 : 0)
      : sb === 1 ? (bac.b[0].rank === bac.b[1].rank ? 12 : 0)
      : sb === 2 ? dragonBonus(bac.p, bac.b) : dragonBonus(bac.b, bac.p);
    payout += b * m;
    const name = sideNames()[sb];
    notes.push(m > 1 ? `${name} ✅+${fmt(b * (m - 1))}` : m === 1 ? `${name} ${T('반환', 'push', '返却')}` : `${name} ❌`);
  }
  pushHistory('bacHistory', { w: outcome, pp: bac.p[0].rank === bac.p[1].rank, bp: bac.b[0].rank === bac.b[1].rank });
  // 하우스 엣지: 플레이어 1.24%, 뱅커 1.06%, 타이 14.36% / 페어 10.36%, 드래곤 P 2.65%, B 9.37%
  const sideEdges = [0.1036, 0.1036, 0.0265, 0.0937];
  const expLoss = b * ([0.0124, 0.0106, 0.1436][side] + chosen.reduce((a, i) => a + sideEdges[i], 0));
  const net = settle('baccarat', stake, payout, expLoss);
  const who = [T('플레이어 승', 'Player wins', 'プレイヤーの勝ち'), T('뱅커 승', 'Banker wins', 'バンカーの勝ち'), T('타이', 'Tie', 'タイ')][outcome];
  bac.detail = notes.join(' · ');
  if (net > 0) { bac.result = `${who}! +${fmt(net)}`; bac.win = true; playSound(true); }
  else if (net === 0) { bac.result = `${who} — ${T('본전', 'break even', 'プラマイゼロ')}`; bac.win = null; }
  else { bac.result = `${who}… −${fmt(-net)}`; bac.win = false; }
  bac.dealing = false;
  render();
}

// ================= 용호 =================

const dtValue = c => (c.rank === 14 ? 1 : c.rank);
const dtLetters = () => [T('호', 'T', '虎'), T('용', 'D', '龍'), T('타', '=', '和')];
const dt = { dragon: null, tiger: null, outcome: null, result: '', win: null, dealing: false };

function dragonTigerView() {
  const side = (name, card, color, hi) => h('div', { class: `panel tint-${color} row dtside` + (hi ? ` hi-${color}` : '') },
    h('div', {}, h('small', { class: `b ${color}` }, name), h('div', { class: 'total mono' }, card ? dtValue(card) : '-')),
    h('span', { class: 'spacer' }),
    cardEl(card));
  return h('div', { class: 'stack' },
    h('div', { class: 'row gap10 center' },
      side(T('용', 'Dragon', 'ドラゴン'), dt.dragon, 'red', dt.outcome === 1),
      h('small', { class: 'muted b' }, 'VS'),
      side(T('호', 'Tiger', 'タイガー'), dt.tiger, 'blue', dt.outcome === 0)),
    resultText(dt.result || T('용 · 호 · 타이 중 하나에 베팅하세요', 'Bet on Dragon, Tiger or Tie', '龍・虎・タイのいずれかにベット'), dt.win),
    roadmapPanel(S.dtHistory, dtLetters(), false, () => { S.dtHistory = []; save(); render(); }),
    betControl(dt.dealing),
    h('div', { class: 'row gap6' },
      mainBetButton(T('용', 'Dragon', '龍'), '1:1', 'red', dt.dealing, () => playDT(1)),
      mainBetButton(T('타이', 'Tie', 'タイ'), '8:1', 'green', dt.dealing, () => playDT(2)),
      mainBetButton(T('호', 'Tiger', '虎'), '1:1', 'blue', dt.dealing, () => playDT(0))),
    h('div', { class: 'caption center' }, T('타이가 나오면 용·호 베팅은 절반을 돌려받아요 · A는 1, K는 13', 'On a tie, Dragon/Tiger bets lose half · A = 1, K = 13', 'タイの場合、龍・虎ベットは半額返却 · A=1、K=13')));
}

async function playDT(betOn) {
  const b = effectiveBet();
  if (!spend(b)) return;
  Object.assign(dt, { dealing: true, win: null, outcome: null, dragon: null, tiger: null, result: T('카드를 돌리는 중...', 'Dealing...', '配っています...') });
  render();
  const shoe = makeDeck(8);
  await sleep(400); dt.dragon = shoe.pop(); render();
  await sleep(500); dt.tiger = shoe.pop(); render();
  await sleep(300);
  const dv = dtValue(dt.dragon), tv = dtValue(dt.tiger);
  const o = dv > tv ? 1 : tv > dv ? 0 : 2;
  let payout = 0;
  if (betOn === o) payout = betOn === 2 ? b * 9 : b * 2;
  else if (o === 2) payout = b / 2; // 타이: 용·호 베팅 절반 반환
  dt.outcome = o;
  pushHistory('dtHistory', { w: o, pp: false, bp: false });
  // 하우스 엣지 (8덱): 용·호 3.73%, 타이 32.77%
  const net = settle('dragonTiger', b, payout, b * (betOn === 2 ? 0.3277 : 0.0373));
  const who = [T('호 승', 'Tiger wins', '虎の勝ち'), T('용 승', 'Dragon wins', '龍の勝ち'), T('타이', 'Tie', 'タイ')][o];
  if (net > 0) { dt.result = `${who}! +${fmt(net)}`; dt.win = true; playSound(true); }
  else { dt.result = `${who} · −${fmt(-net)}`; dt.win = false; }
  dt.dealing = false;
  render();
}

// ================= 룰렛 =================

const RED = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
const rouletteColor = n => (n === 0 ? 'green' : RED.has(n) ? 'red' : 'black');

// 스팟: 'n:17', 'red', 'black', 'odd', 'even', 'low', 'high', 'd:1', 'c:2'
function spotMultiplier(s) { return s.startsWith('n:') ? 36 : s.startsWith('d:') || s.startsWith('c:') ? 3 : 2; }
function spotWins(s, n) {
  const [k, v] = s.split(':');
  const x = Number(v);
  switch (k) {
    case 'n': return n === x;
    case 'red': return RED.has(n);
    case 'black': return n !== 0 && !RED.has(n);
    case 'odd': return n !== 0 && n % 2 === 1;
    case 'even': return n !== 0 && n % 2 === 0;
    case 'low': return n >= 1 && n <= 18;
    case 'high': return n >= 19 && n <= 36;
    case 'd': return n !== 0 && Math.floor((n - 1) / 12) === x - 1;
    case 'c': return n !== 0 && n % 3 === x % 3;
  }
  return false;
}
function spotLabel(s) {
  const [k, v] = s.split(':');
  return {
    n: v, red: T('빨강', 'Red', '赤'), black: T('검정', 'Black', '黒'), odd: T('홀', 'Odd', '奇数'), even: T('짝', 'Even', '偶数'),
    low: '1-18', high: '19-36', d: ['1st', '2nd', '3rd'][Number(v) - 1] + ' 12', c: T(`${v}열`, `Col ${v}`, `${v}列`),
  }[k];
}

const rou = { selected: new Set(), number: null, spinning: false, result: '', detail: '', win: null, history: [] };

function rouletteView() {
  const n = rou.selected.size;
  const per = n === 0 ? effectiveBet() : allIn ? S.bankroll / n : effectiveBet();
  const total = allIn ? S.bankroll : effectiveBet() * n;
  const cell = (spot, text, color, cls = '') => h('button', {
    class: `rcell ${color} ${cls}` + (rou.selected.has(spot) ? ' chip' : '') + (!rou.spinning && rou.number !== null && spot === 'n:' + rou.number ? ' hit' : ''),
    disabled: rou.spinning,
    onclick: () => { rou.selected.has(spot) ? rou.selected.delete(spot) : rou.selected.add(spot); render(); },
  }, text);

  const grid = h('div', { class: 'rgrid' }, cell('n:0', '0', 'green', 'zero'));
  for (const row of [3, 2, 1]) {
    for (let col = 0; col < 12; col++) {
      const num = col * 3 + row;
      grid.append(cell('n:' + num, num, rouletteColor(num)));
    }
    grid.append(cell('c:' + row, '2:1', 'gray'));
  }
  for (const d of [1, 2, 3]) grid.append(cell('d:' + d, spotLabel('d:' + d), 'gray', 'dozen'));
  for (const s of ['low', 'even', 'red', 'black', 'odd', 'high'])
    grid.append(cell(s, spotLabel(s), s === 'red' ? 'red' : s === 'black' ? 'black' : 'gray', 'outside'));

  return h('div', { class: 'stack' },
    h('div', { class: 'row gap14' },
      h('div', { class: 'wheel ' + (rou.number === null ? 'none' : rouletteColor(rou.number)) + (rou.spinning ? ' spin' : '') }, rou.number === null ? '?' : rou.number),
      h('div', {},
        h('small', { class: 'muted' }, T('최근 결과', 'Recent', '最近の結果')),
        h('div', { class: 'row gap3 hist' }, rou.history.slice(0, 9).map(x => h('span', { class: 'ball ' + rouletteColor(x) }, x))))),
    h('div', {}, resultText(rou.result || T('숫자·구역을 눌러 칩을 놓고 스핀하세요', 'Click numbers/areas to place chips, then spin', '数字やエリアをクリックしてチップを置き、スピン'), rou.win),
      h('div', { class: 'detail' }, rou.detail || ' ')),
    grid,
    betControl(rou.spinning, T('칩당', 'Per chip', 'チップ毎')),
    h('div', { class: 'row gap6 center' },
      h('small', { class: 'muted mono' }, n === 0 ? T('칩 없음', 'No chips', 'チップなし') : `${n} × ${fmt(per)} = ${fmt(total)}`),
      h('span', { class: 'spacer' }),
      h('button', { class: 'btn sm', disabled: rou.spinning || n === 0, onclick: () => { rou.selected.clear(); render(); } }, T('지우기', 'Clear', 'クリア')),
      h('button', { class: 'btn green wide', disabled: rou.spinning || n === 0, onclick: spinRoulette }, T('스핀', 'Spin', 'スピン'))));
}

async function spinRoulette() {
  const spots = [...rou.selected];
  if (!spots.length) return;
  const per = allIn ? S.bankroll / spots.length : effectiveBet();
  const stake = allIn ? S.bankroll : per * spots.length;
  if (!spend(stake)) return;
  Object.assign(rou, { spinning: true, win: null, detail: '',
    result: T(`${spots.length}곳에 ${fmt(stake)} — 휠이 돌아갑니다...`, `${fmt(stake)} on ${spots.length} spots — spinning...`, `${spots.length}か所に ${fmt(stake)} — 回転中...`) });
  for (let i = 0; i < 18; i++) { rou.number = randInt(37); render(); await sleep(50 + i * 12); }
  const n = randInt(37);
  rou.number = n;
  rou.history.unshift(n);
  rou.spinning = false;
  const hits = spots.filter(s => spotWins(s, n));
  const payout = hits.reduce((a, s) => a + per * spotMultiplier(s), 0);
  const net = settle('roulette', stake, payout, stake * 0.027); // 유럽식 2.7%
  rou.detail = hits.length ? T('적중: ', 'Hits: ', '当たり: ') + hits.map(spotLabel).join(', ') : T('적중 없음', 'No hits', '当たりなし');
  if (net > 0) { rou.result = `${n}! +${fmt(net)}`; rou.win = true; playSound(true); }
  else if (net === 0) { rou.result = `${n} — ${T('본전', 'break even', 'プラマイゼロ')}`; rou.win = null; }
  else { rou.result = `${n}… −${fmt(-net)}`; rou.win = false; }
  render();
}

// ================= 홀덤 =================

const holdem = new Holdem(() => { if (prefs.tab === 'holdem') render(); else renderHeader(); });

function holdemView() {
  const hd = holdem;
  const me = hd.seats[0];
  const dealerChip = i => (hd.dealer === i ? h('span', { class: 'dchip' }, 'D') : null);
  const seatBg = i => (hd.winners.has(i) ? 'win' : hd.inHand && hd.turn === i && !hd.humanTurn && i !== 0 ? 'acting' : '');

  const ai = i => {
    const s = hd.seats[i];
    const reveal = hd.showdown && !s.folded;
    return h('div', { class: 'panel seat ' + seatBg(i) },
      h('div', { class: 'row gap3 center' }, h('small', { class: 'b' }, hd.name(i)), dealerChip(i)),
      h('div', { class: 'row gap2' + (s.folded ? ' faded' : '') }, [0, 1].map(c => cardEl(reveal ? s.cards[c] : null, true))),
      h('small', { class: s.folded ? 'muted' : '' }, s.action || ' '));
  };

  let controls;
  if (!hd.inHand && hd.ranked) {
    controls = [h('button', { class: 'btn green full', onclick: () => hd.startHand() }, T('다음 핸드', 'Next hand', '次のハンド'))];
  } else if (!hd.inHand) {
    controls = [
      betControl(false, T('빅블라인드', 'Big blind', 'BB')),
      h('button', { class: 'btn green full', onclick: () => hd.startHand() }, `${T('딜', 'Deal', 'ディール')} · BB ${fmt(effectiveBet())}`),
    ];
  } else if (hd.humanTurn) {
    controls = [h('div', { class: 'row gap6' },
      h('button', { class: 'btn red grow', onclick: () => hd.fold() }, T('폴드', 'Fold', 'フォールド')),
      h('button', { class: 'btn blue grow', onclick: () => hd.call() },
        hd.toCall === 0 ? T('체크', 'Check', 'チェック')
          : hd.available <= hd.toCall ? `${T('올인', 'All-in', 'オールイン')} ${fmt(hd.available)}` : `${T('콜', 'Call', 'コール')} ${fmt(hd.toCall)}`),
      h('button', { class: 'btn orange grow', disabled: !hd.canRaise || hd.available < hd.toCall + hd.betSize, onclick: () => hd.raiseHuman() },
        hd.currentBet === 0 ? `${T('벳', 'Bet', 'ベット')} ${fmt(hd.betSize)}` : `${T('레이즈', 'Raise', 'レイズ')} ${fmt(hd.currentBet + hd.betSize)}`),
      h('button', { class: 'btn purple grow', disabled: hd.available <= 0, onclick: () => hd.shove() }, T('올인', 'All-in', 'オールイン')))];
  } else {
    controls = [h('div', { class: 'row gap6 center waiting' }, h('span', { class: 'spinner' }), h('small', { class: 'muted' }, T('상대 차례...', 'Opponents acting...', '相手の番...')))];
  }

  let coach = null;
  if (hd.ranked && hd.match) {
    const m = hd.match;
    coach = h('div', { class: 'coach row gap6 center' },
      h('small', { class: 'b' }, `${T('랭크전', 'Ranked', 'ランク戦')} · ${T('핸드', 'Hand', 'ハンド')} ${Math.min(m.hand + 1, RANK.hands)}/${RANK.hands}`),
      h('span', { class: 'spacer' }),
      h('small', { class: 'mono b' }, `${T('칩', 'Chips', 'チップ')} ${fmt(m.stack / RANK.bb)} BB`),
      h('small', { class: 'mono ' + (m.net > 0 ? 'pos' : m.net < 0 ? 'neg' : 'muted') }, `(${m.net >= 0 ? '+' : '−'}${fmt(Math.abs(m.net) / RANK.bb)})`));
  } else if (prefs.coach && !hd.ranked) {
    if (hd.humanTurn && hd.coachEquity !== null) {
      const [txt, color] = hd.advice();
      coach = h('div', { class: 'coach row gap10 center' },
        h('div', {}, h('small', { class: 'muted tiny' }, T('내 승률', 'Equity', '勝率')), h('div', { class: 'b mono' }, pct(hd.coachEquity))),
        h('div', {}, h('small', { class: 'muted tiny' }, T('팟 오즈', 'Pot odds', 'ポットオッズ')), h('div', { class: 'b mono' }, hd.toCall > 0 ? pct(hd.potOdds) : '—')),
        h('span', { class: 'spacer' }),
        h('span', { class: `pill ${color}` }, txt));
    } else {
      coach = h('div', { class: 'coach row center' }, h('small', { class: hd.feedback ? '' : 'muted' },
        hd.feedback || T('내 차례에 승률과 추천 액션이 표시돼요', 'Equity and advice appear on your turn', '自分の番に勝率と推奨アクションを表示')));
    }
  }

  const modeSwitch = h('div', { class: 'seg mode' + (hd.inHand || hd.matchActive ? ' locked' : '') },
    [[false, T('연습', 'Practice', '練習')], [true, T('랭크', 'Ranked', 'ランク')]].map(([v, label]) =>
      h('button', { class: hd.ranked === v ? 'on' : '', disabled: hd.inHand || hd.matchActive, onclick: () => { hd.ranked = v; render(); } }, label)));

  if (hd.ranked && !hd.matchActive && !hd.inHand) return h('div', { class: 'stack' }, modeSwitch, rankLobby());

  return h('div', { class: 'stack' },
    modeSwitch,
    h('div', { class: 'row gap6' }, [1, 2, 3].map(ai)),
    h('div', { class: 'panel felt' },
      h('div', { class: 'row gap4 center' }, [0, 1, 2, 3, 4].map(i => (i < hd.board.length ? cardEl(hd.board[i], true) : h('div', { class: 'card small slot' })))),
      h('small', { class: 'b mono' }, `${T('팟', 'Pot', 'ポット')} ${fmt(hd.pot)}`)),
    h('div', { class: 'panel row gap6 me ' + (hd.winners.has(0) ? 'win' : hd.humanTurn ? 'acting' : '') },
      h('div', { class: 'row gap6' + (me.folded ? ' faded' : '') }, [0, 1].map(c => cardEl(me.cards[c] || null))),
      h('div', {},
        h('div', { class: 'row gap4 center' }, h('b', {}, hd.name(0)), dealerChip(0)),
        h('small', { class: 'b orange-text' }, hd.humanHandName || ' '), h('br'),
        h('small', { class: 'muted' }, me.action || ' '))),
    coach,
    resultText(hd.message || hd.intro(), hd.win),
    ...controls);
}

/** 랭크 모드 대기 화면: 티어, 레이팅, 직전 결과, 시작 버튼 */
function rankLobby() {
  const r = S.rank;
  const t = tierInfo(r.rating);
  const stat = (label, value) => h('div', { class: 'panel tile' }, h('small', { class: 'muted' }, label), h('div', { class: 'b mono' }, value));
  const res = holdem.match && holdem.match.result;
  return h('div', { class: 'stack lobby' },
    h('div', { class: 'panel row gap14 center rankcard' },
      h('div', { class: 'badge', style: { color: t.color, borderColor: t.color, background: t.color + '2e' } }, tierNames()[t.index][0]),
      h('div', { class: 'grow1' },
        h('div', { class: 'tier', style: { color: t.color } }, t.label),
        h('div', { class: 'rating mono' }, fmt(r.rating)),
        t.next === null ? null : h('div', { class: 'bar' }, h('i', { style: { width: (t.progress * 100) + '%', background: t.color } })),
        t.next === null ? null : h('small', { class: 'muted' }, T(`다음 단계까지 ${Math.max(0, t.next - r.rating)}점`, `${Math.max(0, t.next - r.rating)} pts to next`, `次まで${Math.max(0, t.next - r.rating)}点`)))),
    h('div', { class: 'row gap8' },
      stat(T('랭크전', 'Matches', '試合数'), r.matches),
      stat(T('최고', 'Peak', '最高'), r.peak),
      stat(T('최근', 'Recent', '最近'), r.recent.length ? r.recent.slice(-5).map(d => (d >= 0 ? '+' : '') + d).join(' ') : '—')),
    res ? h('div', { class: 'coach lastres' },
      h('small', { class: 'muted b' }, T('지난 판 결과', 'Last match', '前回の結果')),
      h('div', { class: 'delta mono ' + (res.delta > 0 ? 'pos' : res.delta < 0 ? 'neg' : 'muted') }, (res.delta >= 0 ? '+' : '') + res.delta),
      h('small', { class: 'mono' }, `${T('칩', 'Chips', 'チップ')} ${res.netBB >= 0 ? '+' : '−'}${fmt(Math.abs(res.netBB))} BB · ${T('판단 정확도', 'Accuracy', '判断精度')} ${res.accuracy === null ? '—' : pct(res.accuracy)}`),
      res.placement ? h('small', { class: 'muted' }, T('배치고사 (변동 2배)', 'Placement match (double change)', '配置戦（変動2倍）')) : null) : null,
    h('button', { class: 'btn green full', onclick: () => holdem.startMatch() }, T('랭크전 시작 · 20핸드', 'Start ranked match · 20 hands', 'ランク戦開始 · 20ハンド')),
    h('div', { class: 'caption' }, T(
      '100BB로 20핸드를 칩니다. 칩 손익과 판단 정확도로 점수가 바뀌고, 코치는 꺼져요. 뱅크롤에는 영향이 없어요. 티어가 오를수록 AI가 정확해집니다.',
      'You play 20 hands with 100 BB. Your rating moves with chips won and decision accuracy. No coach, and your bankroll isn\'t touched. AI opponents get sharper as you climb.',
      '100BBで20ハンドをプレイします。チップ損益と判断の正確さでレートが変動し、コーチはオフ。残高には影響しません。ティアが上がるほどAIが正確になります。')));
}

// ================= 슬롯 =================

// 이론 환수율 약 97.5% (체리 2개 = 2배 포함)
const SLOT_SYMBOLS = [
  ['🍒', 30, 6], ['🍋', 25, 10], ['🍉', 20, 20], ['🔔', 12, 40], ['⭐️', 7, 80], ['💎', 4, 250], ['7️⃣', 2, 777],
];
const SLOT_WEIGHT = SLOT_SYMBOLS.reduce((a, s) => a + s[1], 0);
function randomSymbol() {
  let r = randInt(SLOT_WEIGHT);
  for (let i = 0; i < SLOT_SYMBOLS.length; i++) { if (r < SLOT_SYMBOLS[i][1]) return i; r -= SLOT_SYMBOLS[i][1]; }
  return 0;
}
function slotPayout(r) {
  if (r[0] === r[1] && r[1] === r[2]) return [SLOT_SYMBOLS[r[0]][2], SLOT_SYMBOLS[r[0]][0].repeat(3)];
  if (r.filter(x => x === 0).length === 2) return [2, '🍒🍒'];
  return [0, ''];
}

const slot = { reels: [6, 6, 6], stopped: [true, true, true], spinning: false, result: '', win: null, autoLeft: 0, flash: false };

function slotsView() {
  const busy = slot.spinning || slot.autoLeft > 0;
  return h('div', { class: 'stack' },
    h('div', { class: 'panel machine row gap8 center' + (slot.flash ? ' flash' : '') },
      slot.reels.map((r, i) => h('div', { class: 'reel' + (slot.stopped[i] ? '' : ' blur') }, SLOT_SYMBOLS[r][0])),
      h('div', { class: 'payline' })),
    resultText(slot.result || T('레버를 당겨보세요!', 'Pull the lever!', 'レバーを引いてみよう！'), slot.win),
    h('div', { class: 'panel paytable' },
      [...SLOT_SYMBOLS.keys()].reverse().map(i => h('div', { class: 'payrow' }, h('span', {}, SLOT_SYMBOLS[i][0].repeat(3)), h('b', { class: 'mono' }, '×' + SLOT_SYMBOLS[i][2]))),
      h('div', { class: 'payrow' }, h('span', {}, '🍒🍒'), h('b', { class: 'mono' }, '×2'))),
    betControl(busy),
    h('div', { class: 'row gap6' },
      h('button', { class: 'btn red grow', disabled: busy, onclick: () => spinSlot() }, T('스핀', 'Spin', 'スピン')),
      h('button', { class: 'btn ' + (slot.autoLeft > 0 ? 'gray' : 'orange'), disabled: slot.spinning && slot.autoLeft === 0,
                    onclick: () => (slot.autoLeft > 0 ? (slot.autoLeft = 0) : autoSlot(10)) },
        slot.autoLeft > 0 ? `${T('정지', 'Stop', '停止')} (${slot.autoLeft})` : T('자동 ×10', 'Auto ×10', 'オート×10'))));
}

async function autoSlot(n) {
  slot.autoLeft = n;
  render();
  while (slot.autoLeft > 0) {
    if (!(await spinSlot())) break;
    if (slot.autoLeft > 0) slot.autoLeft--;
    await sleep(350);
  }
  slot.autoLeft = 0;
  render();
}

/** 한 번 돌린다. 돈이 부족하면 false */
async function spinSlot() {
  if (slot.spinning) return false;
  const b = effectiveBet();
  if (!spend(b)) return false;
  Object.assign(slot, { spinning: true, win: null, flash: false, result: T('돌아가는 중...', 'Spinning...', '回転中...'), stopped: [false, false, false] });
  const final = [randomSymbol(), randomSymbol(), randomSymbol()];
  const stopAt = [9, 14, 19];
  for (let t = 0; t < 20; t++) {
    for (let i = 0; i < 3; i++) {
      if (t < stopAt[i]) slot.reels[i] = randInt(SLOT_SYMBOLS.length);
      if (t === stopAt[i]) { slot.reels[i] = final[i]; slot.stopped[i] = true; }
    }
    if (prefs.tab === 'slots') render();
    await sleep(60);
  }
  slot.reels = final;
  slot.stopped = [true, true, true];
  const [mult, combo] = slotPayout(final);
  const net = settle('slots', b, b * mult, b * 0.025); // 환수율 97.5%
  if (net > 0) {
    slot.win = true; slot.flash = true;
    slot.result = `${combo} +${fmt(net)}`;
    if (mult >= 80) toast(T(`🎰 잭팟! ${combo} ×${mult}`, `🎰 JACKPOT! ${combo} ×${mult}`, `🎰 ジャックポット！${combo} ×${mult}`));
    playSound(true);
  } else {
    slot.win = false;
    slot.result = `${T('꽝', 'No win', 'ハズレ')} −${fmt(-net)}`;
  }
  slot.spinning = false;
  render();
  return true;
}

// ================= 통계 =================

function statsView() {
  const all = GAMES.map(stats).reduce((a, s) => {
    for (const k of ['rounds', 'wins', 'losses', 'pushes', 'wagered', 'net', 'expected']) a[k] += s[k];
    a.bestStreak = Math.max(a.bestStreak, s.bestStreak);
    a.worstStreak = Math.min(a.worstStreak, s.worstStreak);
    return a;
  }, newStats());
  const totalNet = S.bankroll - S.startBankroll;
  const cls = v => (v > 0 ? 'pos' : v < 0 ? 'neg' : 'muted');
  const tile = (label, value, v) => h('div', { class: 'panel tile' }, h('small', { class: 'muted' }, label), h('div', { class: 'b mono big ' + (v === null ? '' : cls(v)) }, value));
  const hs = stats('holdem');
  const acc = accuracy(hs);
  const row = (label, value) => h('div', { class: 'row kv' }, h('small', {}, label), h('span', { class: 'spacer' }), h('small', { class: 'mono b' }, value));

  const curve = S.curve;
  return h('div', { class: 'stack scroll' },
    h('div', { class: 'row gap8' },
      tile(T('전체 승률', 'Win rate', '勝率'), winRate(all) === null ? '—' : pct(winRate(all)), null),
      tile(T('시작 대비', 'vs. start', '開始比'), signed(totalNet), totalNet),
      tile(T('운 지수', 'Luck', '運指数'), all.rounds ? signed(luck(all)) : '—', all.rounds ? luck(all) : null)),
    h('div', {},
      h('div', { class: 'row' }, h('small', { class: 'muted b' }, T('뱅크롤 추이', 'Bankroll', '残高推移')), h('span', { class: 'spacer' }),
        curve.length >= 2 ? h('small', { class: 'muted mono' }, `${T('최고', 'High', '最高')} ${fmt(Math.max(...curve))} · ${T('최저', 'Low', '最低')} ${fmt(Math.min(...curve))}`) : null),
      curve.length >= 2 ? lineChart(curve, S.startBankroll) : h('div', { class: 'empty muted' }, T('아직 기록이 없어요', 'No data yet', 'まだ記録がありません'))),
    h('table', { class: 'stats' },
      h('thead', {}, h('tr', {}, h('th', { class: 'l' }, T('게임', 'Game', 'ゲーム')), h('th', {}, T('판수', 'Hands', '回数')), h('th', {}, T('승률', 'Win %', '勝率')), h('th', {}, T('손익', 'Net', '損益')), h('th', {}, T('운', 'Luck', '運')))),
      h('tbody', {}, GAMES.map(g => {
        const st = stats(g);
        return h('tr', {},
          h('td', { class: 'l' }, gameName(g)),
          h('td', {}, st.rounds),
          h('td', {}, winRate(st) === null ? '—' : pct(winRate(st))),
          h('td', { class: st.rounds ? cls(st.net) : 'muted' }, st.rounds ? signed(st.net) : '—'),
          h('td', { class: g === 'holdem' || !st.rounds ? 'muted' : cls(luck(st)) }, g === 'holdem' || !st.rounds ? '—' : signed(luck(st))));
      }))),
    h('div', {},
      h('small', { class: 'muted b' }, T('실력', 'Skill', '実力')),
      row(T('홀덤 랭크', "Hold'em rank", 'ホールデムランク'), S.rank.matches === 0 ? '—' : `${tierInfo(S.rank.rating).label} · ${fmt(S.rank.rating)} (${T('최고', 'peak', '最高')} ${fmt(S.rank.peak)})`),
      row(T('홀덤 판단 정확도', "Hold'em decision accuracy", 'ホールデム判断の正確さ'), acc === null ? '—' : `${pct(acc)} (${hs.goodDecisions}/${hs.decisions})`),
      row(T('최장 연승 / 연패', 'Longest win / loss streak', '最長連勝 / 連敗'), `${all.bestStreak} / ${-all.worstStreak}`),
      row(T('총 베팅액 / ROI', 'Total wagered / ROI', '総ベット額 / ROI'), `${fmt(all.wagered)} / ${roi(all) === null ? '—' : pct(roi(all))}`)),
    h('div', { class: 'caption' }, T(
      '운 지수 = 실제 손익 − 기대 손익(하우스 엣지 기준). +면 평균보다 운이 좋았고, −면 나빴다는 뜻이에요. 홀덤은 상대가 AI라 하우스 엣지가 없어서 대신 판단 정확도로 실력을 봐요.',
      'Luck = actual result − expected result (from the house edge). Positive means you ran above average. Hold\'em has no house edge here, so skill is measured by decision accuracy instead.',
      '運指数 = 実際の損益 − 期待損益（ハウスエッジ基準）。＋なら平均より運が良かったことを意味します。ホールデムはハウスエッジがないため、判断の正確さで実力を測ります。')));
}

function lineChart(values, baseline) {
  const W = 392, H = 96;
  const dpr = window.devicePixelRatio || 1;
  const cv = h('canvas', { width: W * dpr, height: H * dpr, style: { width: W + 'px', height: H + 'px' } });
  const g = cv.getContext('2d');
  g.scale(dpr, dpr);
  const lo0 = Math.min(...values, baseline), hi0 = Math.max(...values, baseline);
  const pad = Math.max((hi0 - lo0) * 0.15, baseline * 0.01);
  const lo = lo0 - pad, hi = hi0 + pad;
  const y = v => H - ((v - lo) / (hi - lo)) * H;
  const x = i => (i / (values.length - 1)) * W;
  const muted = getComputedStyle(document.documentElement).getPropertyValue('--line').trim();
  g.strokeStyle = muted; g.lineWidth = 0.5;
  for (const f of [0.25, 0.5, 0.75]) { g.beginPath(); g.moveTo(0, H * f); g.lineTo(W, H * f); g.stroke(); }
  g.setLineDash([3, 3]); g.strokeStyle = '#3b82f6'; g.globalAlpha = 0.6;
  g.beginPath(); g.moveTo(0, y(baseline)); g.lineTo(W, y(baseline)); g.stroke();
  g.setLineDash([]); g.globalAlpha = 1; g.lineWidth = 2;
  g.beginPath();
  values.forEach((v, i) => (i ? g.lineTo(x(i), y(v)) : g.moveTo(x(i), y(v))));
  g.stroke();
  return cv;
}

// ================= 설정 =================

let confirmingStats = false;

function settingsView() {
  const seg = (options, current, onPick) => h('div', { class: 'seg' },
    options.map(([value, label]) => h('button', { class: value === current ? 'on' : '', onclick: () => onPick(value) }, label)));
  const section = (title, ...content) => h('div', { class: 'section' }, h('small', { class: 'muted b' }, title), ...content);
  const presets = [[1e5, T('10만', '100K', '10万')], [1e6, T('100만', '1M', '100万')], [1e7, T('1000만', '10M', '1000万')], [1e8, T('1억', '100M', '1億')]];

  return h('div', { class: 'stack settings' },
    section(T('언어', 'Language', '言語'),
      seg([['ko', '한국어'], ['en', 'English'], ['ja', '日本語']], prefs.lang, v => { prefs.lang = v; savePrefs(); render(); })),
    section(T('시작 뱅크롤', 'Starting bankroll', '開始残高'),
      seg(presets, S.startBankroll, v => { S.startBankroll = v; resetBankroll(); render(); }),
      h('small', { class: 'muted' }, T('실제로 카지노에 가져갈 금액으로 맞추면 연습 효과가 좋아요.', "Match what you'd actually bring to the casino for realistic practice.", '実際にカジノへ持って行く金額に合わせると効果的です。')),
      h('div', {}, h('button', { class: 'btn sm', onclick: () => { resetBankroll(); render(); } }, T('뱅크롤 리셋', 'Reset bankroll', '残高をリセット')))),
    section(T('화면', 'Appearance', '表示'),
      seg([['system', T('시스템', 'System', 'システム')], ['light', T('라이트', 'Light', 'ライト')], ['dark', T('다크', 'Dark', 'ダーク')]], prefs.theme,
        v => { prefs.theme = v; savePrefs(); applyTheme(); render(); })),
    section(T('홀덤', "Hold'em", 'ホールデム'),
      h('label', { class: 'check' },
        h('input', { type: 'checkbox', checked: prefs.coach, onchange: e => { prefs.coach = e.target.checked; savePrefs(); } }),
        T('코치 표시 (승률 · 팟 오즈 · 추천 액션)', 'Show coach (equity · pot odds · advice)', 'コーチ表示（勝率・ポットオッズ・推奨）'))),
    section(T('데이터', 'Data', 'データ'),
      // 확인 대화상자를 띄우면 창이 포커스를 잃고 숨겨지므로, 같은 자리에서 확인한다
      h('div', { class: 'row gap6 center' },
        confirmingStats
          ? [h('small', {}, T('정말 초기화할까요?', 'Clear all stats?', '本当にリセット？')),
             h('button', { class: 'btn sm red', onclick: () => { confirmingStats = false; resetStats(); render(); } }, T('초기화', 'Clear', 'リセット')),
             h('button', { class: 'btn sm', onclick: () => { confirmingStats = false; render(); } }, T('취소', 'Cancel', 'キャンセル'))]
          : h('button', { class: 'btn sm', onclick: () => { confirmingStats = true; render(); } }, T('통계 초기화', 'Clear stats', '統計をリセット')),
        h('span', { class: 'spacer' }),
        h('button', { class: 'btn sm', onclick: () => window.kasino?.quit() }, T('앱 종료', 'Quit', '終了')))),
    h('small', { class: 'muted caption' }, T('Kasino는 연습·학습용이에요. 실제 돈을 걸거나 받을 수 없어요.', 'Kasino is for practice and learning only. No real money can be wagered or won.', 'Kasinoは練習・学習用です。実際のお金を賭けたり受け取ったりすることはできません。')));
}

// ================= 전체 렌더링 =================

const TABS = [
  ['baccarat', () => T('바카라', 'Baccarat', 'バカラ'), baccaratView],
  ['dragonTiger', () => T('용호', 'D·T', '龍虎'), dragonTigerView],
  ['roulette', () => T('룰렛', 'Roulette', 'ルーレット'), rouletteView],
  ['holdem', () => T('홀덤', "Hold'em", 'ホールデム'), holdemView],
  ['slots', () => T('슬롯', 'Slots', 'スロット'), slotsView],
  ['stats', () => T('통계', 'Stats', '統計'), statsView],
  ['settings', () => '⚙︎', settingsView],
];

function applyTheme() {
  document.documentElement.dataset.theme = prefs.theme;
}

function renderHeader() {
  const net = S.bankroll - sessionStart;
  document.getElementById('bankroll-label').textContent = T('뱅크롤', 'Bankroll', '残高');
  document.getElementById('bankroll').textContent = fmt(S.bankroll);
  document.getElementById('session-label').textContent = T('이번 세션', 'This session', '今回のセッション');
  const sn = document.getElementById('session');
  sn.textContent = signed(net);
  sn.className = 'mono ' + (net > 0 ? 'pos' : net < 0 ? 'neg' : 'muted');
  document.getElementById('toast').textContent = toastText || ' ';
  window.kasino?.setTooltip(`Kasino · ${fmt(S.bankroll)}`);
}

function render() {
  renderHeader();
  const tabs = document.getElementById('tabs');
  tabs.replaceChildren(...TABS.map(([id, label]) =>
    h('button', { class: prefs.tab === id ? 'on' : '', onclick: () => { prefs.tab = id; savePrefs(); render(); } }, label())));
  const view = document.getElementById('view');
  const scrollTop = view.firstChild?.scrollTop || 0;
  const tab = TABS.find(t => t[0] === prefs.tab) || TABS[0];
  view.replaceChildren(tab[2]());
  if (view.firstChild && scrollTop) view.firstChild.scrollTop = scrollTop;
}

applyTheme();
render();
