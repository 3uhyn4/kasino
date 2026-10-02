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
    money() > 0 ? h('small', { class: 'muted mono' }, pct(b / money())) : null,
    h('span', { class: 'spacer' }),
    h('button', { class: 'btn sm', disabled, onclick: () => setBet(effectiveBet() / 2) }, '½'),
    h('button', { class: 'btn sm', disabled, onclick: () => setBet(effectiveBet() * 2) }, '×2'),
    h('button', { class: 'btn sm', disabled, onclick: () => setBet(money() / 100) }, '1%'),
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
  const per = allIn ? money() / (1 + nSides) : effectiveBet();
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
      : `${T('사이드', 'Side', 'サイド')} ${nSides} × ${fmt(per)} · ${T('총', 'total', '合計')} ${fmt(allIn ? money() : per * (1 + nSides))}`),
    h('div', { class: 'row gap6' },
      mainBetButton(T('플레이어', 'Player', 'プレイヤー'), '1:1', 'blue', bac.dealing, () => playBaccarat(0)),
      mainBetButton(T('타이', 'Tie', 'タイ'), '8:1', 'green', bac.dealing, () => playBaccarat(2)),
      mainBetButton(T('뱅커', 'Banker', 'バンカー'), '0.95:1', 'red', bac.dealing, () => playBaccarat(1))));
}

async function playBaccarat(side) {
  const chosen = [...bac.sides].sort();
  const b = allIn ? money() / (1 + chosen.length) : effectiveBet();
  const stake = allIn ? money() : b * (1 + chosen.length);
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

const rou = { selected: new Set(), number: null, spinning: false, result: '', detail: '', win: null };

/** 룰렛 기록 요약: 색·홀짝·구간 비율, 많이 나온 번호와 오래 안 나온 번호 */
function rouletteStats(hist) {
  const total = Math.max(hist.length, 1);
  const share = k => (hist.length ? `${Math.round((k / total) * 100)}%` : '—');
  const count = f => hist.filter(f).length;
  const red = count(n => RED.has(n)), zero = count(n => n === 0);
  const counts = Array(37).fill(0);
  hist.forEach(n => counts[n]++);
  const hot = [...Array(37).keys()].filter(n => counts[n] > 1).sort((a, b) => counts[b] - counts[a]).slice(0, 4);
  // 가장 오래 안 나온 번호: 최근 기록에서 처음 나오는 위치가 가장 먼(또는 아예 없는) 번호
  const gap = n => { const i = hist.indexOf(n); return i < 0 ? hist.length + 1 : i; };
  const cold = hist.length < 20 ? [] : [...Array(37).keys()].sort((a, b) => gap(b) - gap(a)).slice(0, 4);
  const pair = (label, value, cls = 'muted') => h('span', { class: 'pair' }, h('b', { class: cls }, label), ' ', value);
  const sep = () => h('span', { class: 'sep' });
  const balls = (label, nums) => h('span', { class: 'pair' }, h('b', { class: 'muted' }, label), ' ',
    nums.length ? nums.map(n => h('span', { class: 'ball tiny ' + rouletteColor(n) }, n)) : '—');
  return h('div', { class: 'panel rstats' },
    h('div', {}, pair(T('빨강', 'Red', '赤'), share(red), 'red'), pair(T('검정', 'Black', '黒'), share(hist.length - red - zero), ''),
      pair('0', share(zero), 'pos'), sep(),
      pair(T('홀', 'Odd', '奇'), share(count(n => n !== 0 && n % 2 === 1))), pair(T('짝', 'Even', '偶'), share(count(n => n !== 0 && n % 2 === 0)))),
    h('div', {}, pair('1-18', share(count(n => n >= 1 && n <= 18))), pair('19-36', share(count(n => n >= 19))), sep(),
      ...[1, 2, 3].map(d => pair(['1st', '2nd', '3rd'][d - 1], share(count(n => n !== 0 && Math.floor((n - 1) / 12) === d - 1))))),
    h('div', {}, balls(T('많이 나온 번호', 'Hot', 'よく出る'), hot), balls(T('오래 안 나온 번호', 'Cold', '出ていない'), cold)));
}

function rouletteView() {
  const n = rou.selected.size;
  const per = n === 0 ? effectiveBet() : allIn ? money() / n : effectiveBet();
  const total = allIn ? money() : effectiveBet() * n;
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
      h('div', { class: 'grow1' },
        h('div', { class: 'row center' },
          h('small', { class: 'muted' }, T('최근 결과', 'Recent', '最近の結果') + (S.rouHistory.length ? ` · ${T(`${S.rouHistory.length}판`, `${S.rouHistory.length} spins`, `${S.rouHistory.length}回`)}` : '')),
          h('span', { class: 'spacer' }),
          S.rouHistory.length ? h('button', { class: 'linkbtn', disabled: rou.spinning, onclick: () => { S.rouHistory = []; save(); render(); } }, T('지우기', 'Clear', 'クリア')) : null),
        h('div', { class: 'hist' }, S.rouHistory.slice(0, 18).map(x => h('span', { class: 'ball ' + rouletteColor(x) }, x))))),
    rouletteStats(S.rouHistory),
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
  const per = allIn ? money() / spots.length : effectiveBet();
  const stake = allIn ? money() : per * spots.length;
  if (!spend(stake)) return;
  Object.assign(rou, { spinning: true, win: null, detail: '',
    result: T(`${spots.length}곳에 ${fmt(stake)} — 휠이 돌아갑니다...`, `${fmt(stake)} on ${spots.length} spots — spinning...`, `${spots.length}か所に ${fmt(stake)} — 回転中...`) });
  for (let i = 0; i < 18; i++) { rou.number = randInt(37); render(); await sleep(50 + i * 12); }
  const n = randInt(37);
  rou.number = n;
  S.rouHistory.unshift(n);
  if (S.rouHistory.length > 100) S.rouHistory.length = 100;
  save();
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
  if (!hd.inHand) {
    controls = [
      betControl(false, T('빅블라인드', 'Big blind', 'BB')),
      h('button', { class: 'btn green full', onclick: () => hd.startHand() }, `${T('딜', 'Deal', 'ディール')} · BB ${fmt(effectiveBet())}`),
    ];
  } else if (hd.humanTurn) {
    controls = [h('div', { class: 'row gap6' },
      h('button', { class: 'btn red grow', onclick: () => hd.fold() }, T('폴드', 'Fold', 'フォールド')),
      h('button', { class: 'btn blue grow', onclick: () => hd.call() },
        hd.toCall === 0 ? T('체크', 'Check', 'チェック')
          : money() <= hd.toCall ? `${T('올인', 'All-in', 'オールイン')} ${fmt(money())}` : `${T('콜', 'Call', 'コール')} ${fmt(hd.toCall)}`),
      h('button', { class: 'btn orange grow', disabled: !hd.canRaise || money() < hd.toCall + hd.betSize, onclick: () => hd.raiseHuman() },
        hd.currentBet === 0 ? `${T('벳', 'Bet', 'ベット')} ${fmt(hd.betSize)}` : `${T('레이즈', 'Raise', 'レイズ')} ${fmt(hd.currentBet + hd.betSize)}`),
      h('button', { class: 'btn purple grow', disabled: money() <= 0, onclick: () => hd.shove() }, T('올인', 'All-in', 'オールイン')))];
  } else {
    controls = [h('div', { class: 'row gap6 center waiting' }, h('span', { class: 'spinner' }), h('small', { class: 'muted' }, T('상대 차례...', 'Opponents acting...', '相手の番...')))];
  }

  let coach = null;
  if (prefs.coach) {
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

  return h('div', { class: 'stack' },
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

// ================= 랭크: 로그인 · 순위 =================

const authForm = { signUp: true, username: '', password: '', nickname: '' };

function authFormView() {
  const f = authForm;
  const field = (id, key, placeholder, type = 'text') => h('input', {
    id, type, placeholder, value: f[key], autocomplete: 'off', spellcheck: 'false',
    oninput: e => { f[key] = e.target.value; },
    onkeydown: e => { if (e.key === 'Enter') submitAuth(); },
  });
  return h('div', { class: 'panel authform' },
    h('div', { class: 'seg small' },
      [[true, T('가입', 'Sign up', '新規登録')], [false, T('로그인', 'Sign in', 'ログイン')]].map(([v, label]) =>
        h('button', { class: f.signUp === v ? 'on' : '', onclick: () => { f.signUp = v; online.error = ''; render(); } }, label))),
    field('auth-user', 'username', T('아이디', 'Username', 'ID')),
    field('auth-pass', 'password', T('비밀번호', 'Password', 'パスワード'), 'password'),
    f.signUp ? field('auth-nick', 'nickname', T('닉네임 (순위표에 보여요)', 'Nickname (shown on the leaderboard)', 'ニックネーム（ランキングに表示）')) : null,
    h('div', { class: 'row gap6 center' },
      h('button', { class: 'btn blue', disabled: online.busy, onclick: submitAuth },
        f.signUp ? T('가입하고 1,000칩 받기', 'Sign up and get 1,000 chips', '登録して1,000チップ獲得') : T('로그인', 'Sign in', 'ログイン')),
      online.busy ? h('span', { class: 'spinner' }) : null),
    online.error ? h('small', { class: 'neg' }, online.error) : null,
    h('small', { class: 'muted' }, T('이메일은 필요 없어요. 비밀번호를 잊으면 찾을 방법이 없으니 꼭 기억해 두세요.', "No email needed. There's no password reset, so keep your password somewhere safe.", 'メール不要です。パスワードの再設定はできないので忘れないでください。')));
}

async function submitAuth() {
  const f = authForm;
  if (!f.username || !f.password || (f.signUp && !f.nickname)) return;
  const ok = f.signUp ? await onlineSignUp(f.username, f.password, f.nickname) : await onlineSignIn(f.username, f.password);
  if (ok) { f.password = ''; onlineLoadLeaderboard(); }
}

/** 랭크 모드에서 로그인하지 않았을 때 게임 탭 대신 보여주는 화면 */
function rankedGate() {
  return h('div', { class: 'stack' },
    h('div', { class: 'gate-title' }, T('랭크 모드', 'Ranked mode', 'ランクモード')),
    h('div', { class: 'muted' }, T('가입하면 1,000칩을 받아요. 모든 게임을 이 칩으로 하고, 가진 칩이 많은 순서로 전체 순위가 매겨져요. 연습 모드 뱅크롤과는 따로예요.',
      'Sign up and you get 1,000 chips. Every game uses these chips, and everyone is ranked by how many they hold. Separate from your practice bankroll.',
      '登録すると1,000チップがもらえます。全ゲームでこのチップを使い、所持チップ数で順位が決まります。練習モードの残高とは別です。')),
    authFormView());
}

/** 랭크 모드의 순위 탭: 내 정보 + 전체 순위표 */
function rankBoardView() {
  const p = online.profile;
  const top = online.signedIn
    ? [h('div', { class: 'panel row center mine' },
         h('div', {}, h('b', {}, p.nickname), h('br'),
           h('small', { class: 'muted mono' }, `${T(`${p.rounds}판`, `${p.rounds} rounds`, `${p.rounds}回`)} · ${T('최고', 'Peak', '最高')} ${fmt(Number(p.peak))}`)),
         h('span', { class: 'spacer' }),
         h('div', { class: 'right' }, h('b', { class: 'mono' }, p.rank ? T(`전체 ${p.rank}위`, `#${p.rank}`, `全体${p.rank}位`) : '—'), h('br'),
           h('small', { class: 'muted mono' }, fmt(Number(p.balance))))),
       p.relief ? h('button', { class: 'btn orange full', onclick: onlineClaimRelief }, T('파산 지원 받기 · 1,000칩 (하루 한 번)', 'Claim relief · 1,000 chips (once a day)', '救済を受け取る · 1,000チップ（1日1回）')) : null]
    : [rankedGate()];
  const rows = online.leaderboard.map(r => {
    const me = p && r.nickname === p.nickname;
    return h('div', { class: 'lrow' + (me ? ' me' : '') },
      h('span', { class: 'mono b rk' }, r.rank),
      h('span', { class: 'nm' + (me ? ' b' : '') }, r.nickname),
      h('span', { class: 'spacer' }),
      h('span', { class: 'mono b' }, fmt(Number(r.balance))));
  });
  return h('div', { class: 'stack board' }, ...top,
    h('div', { class: 'row center' }, h('small', { class: 'muted b' }, T('전체 순위', 'Leaderboard', 'ランキング')), h('span', { class: 'spacer' }),
      h('button', { class: 'btn xs', onclick: async () => { await onlineRefresh(); onlineLoadLeaderboard(); } }, '↻')),
    rows.length ? h('div', { class: 'lrows' }, rows) : h('div', { class: 'empty muted' }, T('아직 순위표가 비어 있어요', 'The leaderboard is empty so far', 'ランキングはまだ空です')));
}

// ================= 설정 =================

let deletingAccount = false;
let deletePassword = '';

function accountSettings() {
  if (!online.signedIn) {
    return [h('small', { class: 'muted' }, T('위쪽에서 랭크 모드로 바꾸면 가입하거나 로그인할 수 있어요.', 'Switch to Ranked at the top to sign up or sign in.', '上でランクモードに切り替えると登録・ログインできます。'))];
  }
  const p = online.profile;
  const out = [h('div', {}, T(`${p.nickname} (${p.username})으로 로그인됨`, `Signed in as ${p.nickname} (${p.username})`, `${p.nickname}（${p.username}）でログイン中`))];
  if (deletingAccount) {
    out.push(h('div', { class: 'row gap6 center' },
      h('input', { id: 'del-pass', type: 'password', placeholder: T('비밀번호 확인', 'Confirm password', 'パスワード確認'), value: deletePassword,
                   oninput: e => { deletePassword = e.target.value; } }),
      h('button', { class: 'btn sm red', disabled: online.busy, onclick: async () => {
        if (deletePassword && await onlineDeleteAccount(deletePassword)) { deletingAccount = false; deletePassword = ''; render(); }
      } }, T('계정 삭제', 'Delete', '削除')),
      h('button', { class: 'btn sm', onclick: () => { deletingAccount = false; deletePassword = ''; render(); } }, T('취소', 'Cancel', 'キャンセル'))),
      h('small', { class: 'muted' }, T('계정과 칩, 순위표 기록이 영구히 지워져요.', 'Your account, chips and leaderboard entry are deleted for good.', 'アカウント、チップ、ランキング記録が完全に削除されます。')));
  } else {
    out.push(h('div', { class: 'row gap6' },
      h('button', { class: 'btn sm', onclick: onlineSignOut }, T('로그아웃', 'Sign out', 'ログアウト')),
      h('button', { class: 'btn sm', onclick: () => { deletingAccount = true; render(); } }, T('계정 삭제', 'Delete account', 'アカウント削除'))));
  }
  if (online.error) out.push(h('small', { class: 'neg' }, online.error));
  return out;
}

let confirmingStats = false;

function settingsView() {
  const seg = (options, current, onPick) => h('div', { class: 'seg' },
    options.map(([value, label]) => h('button', { class: value === current ? 'on' : '', onclick: () => onPick(value) }, label)));
  const section = (title, ...content) => h('div', { class: 'section' }, h('small', { class: 'muted b' }, title), ...content);
  const presets = [[1e5, T('10만', '100K', '10万')], [1e6, T('100만', '1M', '100万')], [1e7, T('1000만', '10M', '1000万')], [1e8, T('1억', '100M', '1億')]];

  return h('div', { class: 'stack settings' },
    section(T('언어', 'Language', '言語'),
      seg([['ko', '한국어'], ['en', 'English'], ['ja', '日本語']], prefs.lang, v => { prefs.lang = v; savePrefs(); render(); })),
    section(T('연습 뱅크롤', 'Practice bankroll', '練習用残高'),
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
    section(T('랭크 계정', 'Ranked account', 'ランクアカウント'), ...accountSettings()),
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
  ['stats', () => (ranked ? T('순위', 'Ranking', '順位') : T('통계', 'Stats', '統計')), () => (ranked ? rankBoardView() : statsView())],
  ['settings', () => '⚙︎', settingsView],
];

function applyTheme() {
  document.documentElement.dataset.theme = prefs.theme;
}

function renderHeader() {
  const net = S.bankroll - sessionStart;
  document.getElementById('bankroll-label').textContent = ranked ? T('랭크 칩', 'Ranked chips', 'ランクチップ') : T('뱅크롤', 'Bankroll', '残高');
  document.getElementById('bankroll').textContent = ranked && !online.signedIn ? '—' : fmt(money());
  const sn = document.getElementById('session');
  if (ranked) {
    const p = online.profile;
    sn.textContent = online.signedIn && p.rank ? `${T(`전체 ${p.rank}위`, `Rank #${p.rank}`, `全体${p.rank}位`)} · ${p.nickname}` : T('로그인 필요', 'Not signed in', '未ログイン');
    sn.className = 'muted';
  } else {
    sn.textContent = `${T('이번 세션', 'This session', '今回のセッション')} ${signed(net)}`;
    sn.className = 'mono ' + (net > 0 ? 'pos' : net < 0 ? 'neg' : 'muted');
  }
  document.getElementById('mode').replaceChildren(...[[false, T('연습', 'Practice', '練習')], [true, T('랭크', 'Ranked', 'ランク')]].map(([v, label]) =>
    h('button', { class: ranked === v ? 'on' : '', disabled: !canSwitchMode(), onclick: () => setRanked(v) }, label)));
  document.getElementById('toast').textContent = toastText || ' ';
  window.kasino?.setTooltip(`Kasino · ${fmt(money())}`);
}

function render() {
  renderHeader();
  const tabs = document.getElementById('tabs');
  tabs.replaceChildren(...TABS.map(([id, label]) =>
    h('button', { class: prefs.tab === id ? 'on' : '', onclick: () => { prefs.tab = id; savePrefs(); render(); } }, label())));
  const view = document.getElementById('view');
  const scrollTop = view.firstChild?.scrollTop || 0;
  // 다시 그려도 입력 중인 칸의 포커스와 커서를 유지
  const focused = document.activeElement && document.activeElement.id ? document.activeElement : null;
  const caret = focused && focused.selectionStart;
  const tab = TABS.find(t => t[0] === prefs.tab) || TABS[0];
  const gameTab = !['stats', 'settings'].includes(tab[0]);
  view.replaceChildren(ranked && !online.signedIn && gameTab ? rankedGate() : tab[2]());
  if (view.firstChild && scrollTop) view.firstChild.scrollTop = scrollTop;
  if (focused) {
    const again = document.getElementById(focused.id);
    if (again) { again.focus(); try { again.setSelectionRange(caret, caret); } catch { /* 선택 불가 입력 */ } }
  }
}

applyTheme();
rankServer = online.profile ? Number(online.profile.balance) : 0;
if (ranked) bet = Math.max(1, Math.round(rankBalance() / 100));
render();
onlineRefresh();
