'use strict';
// 게임 엔진: 중국점(로드맵), 포커 족보·승률, 홀덤 AI

// ================= 중국점 =================
// 결과 r = { w: 0 플레이어/호, 1 뱅커/용, 2 타이, pp, bp }

const WIN_COLORS = ['#3b82f6', '#ef4444', '#22c55e'];

/** 같은 값이 이어지면 아래로, 6줄을 넘거나 막히면 오른쪽으로 꺾는(드래곤 테일) 배치 */
function placeRoad(values) {
  const pos = [];
  const occupied = new Set();
  let streakCol = 0;
  values.forEach((v, i) => {
    let p;
    if (i === 0) {
      p = [0, 0];
      streakCol = 0;
    } else if (v === values[i - 1]) {
      const [c, r] = pos[i - 1];
      const down = r + 1;
      p = c === streakCol && down < 6 && !occupied.has(c * 6 + down) ? [c, down] : [c + 1, r];
    } else {
      let c = streakCol + 1;
      while (occupied.has(c * 6)) c++;
      streakCol = c;
      p = [c, 0];
    }
    pos.push(p);
    occupied.add(p[0] * 6 + p[1]);
  });
  return pos;
}

/** 타이를 뺀 대로 항목 (타이는 직전 항목에 표시) */
function bigRoadEntries(results) {
  const out = [];
  let leadingTies = 0;
  for (const r of results) {
    if (r.w === 2) {
      if (out.length === 0) leadingTies++;
      else out[out.length - 1].ties++;
    } else {
      out.push({ w: r.w, ties: out.length ? 0 : leadingTies, pp: r.pp, bp: r.bp });
    }
  }
  return out;
}

function beadMarks(results, letters) {
  return results.map((r, i) => ({
    col: Math.floor(i / 6), row: i % 6, color: WIN_COLORS[r.w], style: 'bead',
    text: letters[r.w], pp: r.pp, bp: r.bp,
  }));
}

function bigRoadMarks(results) {
  const e = bigRoadEntries(results);
  const pos = placeRoad(e.map(x => x.w));
  return e.map((x, i) => ({
    col: pos[i][0], row: pos[i][1], color: WIN_COLORS[x.w], style: 'ring', ties: x.ties, pp: x.pp, bp: x.bp,
  }));
}

/** 파생 도로 (k=1 대안로, 2 소로, 3 바퀴벌레). 0 = 빨강(규칙적), 1 = 파랑(불규칙) */
function derivedRoad(results, k) {
  const e = bigRoadEntries(results);
  const lens = [];
  const coords = [];
  e.forEach((x, i) => {
    if (i > 0 && x.w === e[i - 1].w) lens[lens.length - 1]++;
    else lens.push(1);
    coords.push([lens.length - 1, lens[lens.length - 1] - 1]);
  });
  const out = [];
  for (const [c, r] of coords) {
    if (c < k || (c === k && r === 0)) continue;
    if (r === 0) out.push(lens[c - 1] === lens[c - 1 - k] ? 0 : 1);
    else {
      const l = lens[c - k];
      out.push(l >= r + 1 ? 0 : l === r ? 1 : 0);
    }
  }
  return out;
}

function derivedMarks(results, k, style) {
  const vals = derivedRoad(results, k);
  const pos = placeRoad(vals);
  return vals.map((v, i) => ({ col: pos[i][0], row: pos[i][1], color: v === 0 ? '#ef4444' : '#3b82f6', style }));
}

/** 로드맵 한 칸 그리드를 캔버스로 */
function roadCanvas(marks, cols, cell) {
  const dpr = window.devicePixelRatio || 1;
  const cv = h('canvas', { class: 'road', width: cols * cell * dpr, height: 6 * cell * dpr,
                           style: { width: cols * cell + 'px', height: 6 * cell + 'px' } });
  const g = cv.getContext('2d');
  g.scale(dpr, dpr);
  g.fillStyle = '#fff';
  g.fillRect(0, 0, cols * cell, 6 * cell);
  g.strokeStyle = 'rgba(128,128,128,0.25)';
  g.lineWidth = 0.5;
  g.beginPath();
  for (let c = 0; c <= cols; c++) { g.moveTo(c * cell, 0); g.lineTo(c * cell, 6 * cell); }
  for (let r = 0; r <= 6; r++) { g.moveTo(0, r * cell); g.lineTo(cols * cell, r * cell); }
  g.stroke();

  // 가장 최근 열이 보이도록 오른쪽 끝에 맞춘다
  const maxCol = marks.reduce((m, x) => Math.max(m, x.col), 0);
  const offset = Math.max(0, maxCol - cols + 1);
  const pad = Math.max(0.8, cell * 0.1);
  for (const m of marks) {
    if (m.col < offset) continue;
    const x = (m.col - offset) * cell, y = m.row * cell;
    const cx = x + cell / 2, cy = y + cell / 2, rad = cell / 2 - pad;
    g.fillStyle = g.strokeStyle = m.color;
    if (m.style === 'bead' || m.style === 'dot') {
      g.beginPath(); g.arc(cx, cy, rad, 0, Math.PI * 2); g.fill();
      if (m.text) {
        g.fillStyle = '#fff';
        g.font = `bold ${Math.round(cell * 0.55)}px system-ui, sans-serif`;
        g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText(m.text, cx, cy + 0.5);
      }
    } else if (m.style === 'ring') {
      g.lineWidth = Math.max(1.2, cell * 0.15);
      g.beginPath(); g.arc(cx, cy, rad - 0.8, 0, Math.PI * 2); g.stroke();
    } else if (m.style === 'slash') {
      g.lineWidth = Math.max(1.2, cell * 0.2);
      g.beginPath(); g.moveTo(x + pad, y + cell - pad); g.lineTo(x + cell - pad, y + pad); g.stroke();
    }
    if (m.ties > 0) {
      g.strokeStyle = '#22c55e'; g.lineWidth = 1.5;
      g.beginPath(); g.moveTo(x + pad + 1, y + cell - pad - 1); g.lineTo(x + cell - pad - 1, y + pad + 1); g.stroke();
      if (m.ties > 1) {
        g.fillStyle = '#16a34a';
        g.font = `900 ${Math.round(cell * 0.5)}px system-ui, sans-serif`;
        g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText(String(m.ties), cx, cy);
      }
    }
    const d = Math.max(2.5, cell * 0.28);
    if (m.bp) { g.fillStyle = '#ef4444'; g.beginPath(); g.arc(x + d / 2, y + d / 2, d / 2, 0, Math.PI * 2); g.fill(); }
    if (m.pp) { g.fillStyle = '#3b82f6'; g.beginPath(); g.arc(x + cell - d / 2, y + cell - d / 2, d / 2, 0, Math.PI * 2); g.fill(); }
  }
  return cv;
}

// ================= 포커 족보 =================

const SCORE_BASE = 759375; // 15^5
function handNames() {
  return [
    T('하이카드', 'High Card', 'ハイカード'), T('원페어', 'One Pair', 'ワンペア'), T('투페어', 'Two Pair', 'ツーペア'),
    T('트리플', 'Three of a Kind', 'スリーカード'), T('스트레이트', 'Straight', 'ストレート'), T('플러시', 'Flush', 'フラッシュ'),
    T('풀하우스', 'Full House', 'フルハウス'), T('포카드', 'Four of a Kind', 'フォーカード'),
    T('스트레이트 플러시', 'Straight Flush', 'ストレートフラッシュ'),
  ];
}

/** 5장 점수: 족보 * 15^5 + 타이브레이커 */
function score5(c) {
  const counts = {};
  for (const x of c) counts[x.rank] = (counts[x.rank] || 0) + 1;
  const groups = Object.entries(counts).map(([r, n]) => [Number(r), n])
    .sort((a, b) => (a[1] !== b[1] ? b[1] - a[1] : b[0] - a[0]));
  const flush = c.every(x => x.suit === c[0].suit);
  const ranks = c.map(x => x.rank).sort((a, b) => b - a);
  let straightHigh = 0;
  if (groups.length === 5) {
    if (ranks[0] - ranks[4] === 4) straightHigh = ranks[0];
    else if (ranks.join() === '14,5,4,3,2') straightHigh = 5;
  }
  let cat;
  let tb = groups.map(g => g[0]);
  if (straightHigh && flush) { cat = 8; tb = [straightHigh]; }
  else if (groups[0][1] === 4) cat = 7;
  else if (groups[0][1] === 3 && groups[1][1] === 2) cat = 6;
  else if (flush) { cat = 5; tb = ranks; }
  else if (straightHigh) { cat = 4; tb = [straightHigh]; }
  else if (groups[0][1] === 3) cat = 3;
  else if (groups[0][1] === 2 && groups[1][1] === 2) cat = 2;
  else if (groups[0][1] === 2) cat = 1;
  else { cat = 0; tb = ranks; }
  let s = cat;
  for (let i = 0; i < 5; i++) s = s * 15 + (tb[i] || 0);
  return s;
}

const COMBOS7 = [];
for (let a = 0; a < 7; a++) for (let b = a + 1; b < 7; b++) COMBOS7.push([0, 1, 2, 3, 4, 5, 6].filter(i => i !== a && i !== b));

/** 5~7장 중 최고 점수 */
function bestScore(c) {
  if (c.length === 5) return score5(c);
  if (c.length === 7) {
    let best = 0;
    for (const idx of COMBOS7) best = Math.max(best, score5(idx.map(i => c[i])));
    return best;
  }
  let best = 0;
  for (let i = 0; i < c.length; i++) best = Math.max(best, bestScore(c.filter((_, j) => j !== i)));
  return best;
}

function handName(score) {
  const cat = Math.floor(score / SCORE_BASE);
  if (cat === 8 && Math.floor(score / 50625) % 15 === 14) return T('로열 플러시', 'Royal Flush', 'ロイヤルフラッシュ');
  return handNames()[cat];
}

/** 몬테카를로 승률 추정 */
function equity(hole, board, opponents, iters = 200) {
  if (opponents <= 0) return 1;
  const known = new Set([...hole, ...board].map(c => c.rank * 4 + c.suit));
  const rest = [];
  for (let s = 0; s < 4; s++) for (let r = 2; r <= 14; r++) if (!known.has(r * 4 + s)) rest.push(makeCard(r, s));
  let total = 0;
  for (let it = 0; it < iters; it++) {
    const d = rest.slice();
    // 필요한 카드만 부분 셔플
    const need = 5 - board.length + opponents * 2;
    for (let i = 0; i < need; i++) {
      const j = i + Math.floor(Math.random() * (d.length - i));
      [d[i], d[j]] = [d[j], d[i]];
    }
    let k = 0;
    const b = board.slice();
    while (b.length < 5) b.push(d[k++]);
    const mine = bestScore([...hole, ...b]);
    let best = true, ties = 1;
    for (let o = 0; o < opponents; o++) {
      const s = bestScore([d[k++], d[k++], ...b]);
      if (s > mine) { best = false; break; }
      if (s === mine) ties++;
    }
    if (best) total += 1 / ties;
  }
  return total / iters;
}

// ================= 홀덤 (리밋, AI 3명) =================

const RANK = { bb: 1000, hands: 20, startStack: 100 * 1000 };

class Holdem {
  constructor(onChange) {
    this.onChange = onChange;
    this.seats = [
      { names: ['나', 'Me', '自分'], emoji: '😎', human: true },
      { names: ['블러퍼 박', 'Bluffer Park', 'ブラッファー朴'], emoji: '🤡', aggression: 0.8, tightness: 0.8, bluff: 0.15 },
      { names: ['바위 김', 'Rock Kim', '岩のキム'], emoji: '🗿', aggression: 0.2, tightness: 1.3, bluff: 0.02 },
      { names: ['샤크 최', 'Shark Choi', 'シャーク崔'], emoji: '🦈', aggression: 0.6, tightness: 1.0, bluff: 0.07 },
    ].map(s => Object.assign(s, { cards: [], folded: false, allIn: false, roundBet: 0, totalIn: 0, action: '' }));
    this.board = [];
    this.street = 0;
    this.inHand = false;
    this.humanTurn = false;
    this.showdown = false;
    this.message = '';
    this.win = null;
    this.winners = new Set();
    this.currentBet = 0;
    this.turn = 0;
    this.dealer = 0;
    this.bb = 0;
    this.raises = 0;
    this.needsToAct = new Set();
    this.humanSettled = false;
    this.coachEquity = null;
    this.feedback = '';
    // 랭크 모드: 뱅크롤과 별개인 고정 칩으로 20핸드를 치고 레이팅을 매긴다
    this.ranked = false;
    this.match = null;
  }

  /** 지금 쓸 수 있는 내 칩 (랭크전이면 랭크 칩, 아니면 뱅크롤) */
  get available() { return this.ranked ? (this.match ? this.match.stack : 0) : S.bankroll; }
  get matchActive() { return this.ranked && this.match !== null && this.match.result === null; }

  name(i) { return this.seats[i].names[['ko', 'en', 'ja'].indexOf(prefs.lang)]; }
  intro() { return T('빅블라인드를 정하고 딜을 누르세요 · 리밋 홀덤', "Set the big blind and deal · Limit Hold'em", 'ビッグブラインドを決めてディール · リミットホールデム'); }
  streetName(i) { return [T('프리플랍', 'Preflop', 'プリフロップ'), T('플랍', 'Flop', 'フロップ'), T('턴', 'Turn', 'ターン'), T('리버', 'River', 'リバー')][i]; }

  get pot() { return this.seats.reduce((a, s) => a + s.totalIn, 0); }
  get betSize() { return this.street < 2 ? this.bb : this.bb * 2; }
  get active() { return [0, 1, 2, 3].filter(i => !this.seats[i].folded); }
  get toCall() { return Math.max(0, this.currentBet - this.seats[0].roundBet); }
  get canRaise() { return this.raises < 4; }
  get potOdds() { return this.toCall > 0 ? this.toCall / (this.pot + this.toCall) : 0; }
  /** 1.0 = 이 인원수에서 평균적인 핸드 */
  get strength() { return (this.coachEquity || 0) * this.active.length; }
  get humanHandName() {
    const all = [...this.seats[0].cards, ...this.board];
    if (all.length >= 5) return handName(bestScore(all));
    if (all.length === 2 && all[0].rank === all[1].rank) return T('포켓 페어', 'Pocket Pair', 'ポケットペア');
    return '';
  }

  startHand() {
    if (this.inHand) return;
    if (this.ranked) {
      const m = this.match;
      if (!m || m.result || m.hand >= RANK.hands || m.stack < RANK.bb) return;
      this.bb = RANK.bb;
    } else {
      this.bb = Math.round(effectiveBet());
    }
    if (!this.ranked && (S.bankroll < this.bb || this.bb <= 0)) {
      toast(T(`빅블라인드(${fmt(this.bb)})만큼의 돈이 필요해요`, `You need at least the big blind (${fmt(this.bb)})`, `ビッグブラインド(${fmt(this.bb)})分のお金が必要です`));
      return;
    }
    this.deck = makeDeck();
    this.board = []; this.street = 0; this.showdown = false; this.win = null; this.winners = new Set();
    this.humanSettled = false; this.feedback = ''; this.coachEquity = null;
    for (const s of this.seats) Object.assign(s, { cards: [this.deck.pop(), this.deck.pop()], folded: false, allIn: false, roundBet: 0, totalIn: 0, action: '' });
    this.dealer = (this.dealer + 1) % 4;
    this.inHand = true;
    const sb = (this.dealer + 1) % 4, bbi = (this.dealer + 2) % 4;
    this.put(sb, this.bb / 2); this.seats[sb].action = `SB ${fmt(this.bb / 2)}`;
    this.put(bbi, this.bb); this.seats[bbi].action = `BB ${fmt(this.bb)}`;
    this.currentBet = this.bb; this.raises = 1;
    this.needsToAct = new Set([0, 1, 2, 3].filter(i => !this.seats[i].allIn));
    this.turn = (this.dealer + 3) % 4;
    this.message = this.streetName(0);
    this.onChange();
    this.run();
  }

  /** 칩을 팟에 넣는다. 사람은 실제 뱅크롤에서 차감 */
  put(i, amount) {
    let a = amount;
    if (this.seats[i].human && this.ranked && this.match) {
      a = Math.min(a, this.match.stack);
      this.match.stack -= a;
      if (this.match.stack <= 0) this.seats[i].allIn = true;
    } else if (this.seats[i].human) {
      a = Math.min(a, S.bankroll);
      S.bankroll -= a;
      if (S.bankroll <= 0) this.seats[i].allIn = true;
    }
    this.seats[i].roundBet += a;
    this.seats[i].totalIn += a;
  }

  async run() {
    while (this.inHand) {
      if (this.active.length === 1) return this.finishUncontested();
      if (this.needsToAct.size === 0) {
        if (this.street === 3) return this.doShowdown();
        await this.nextStreet();
        continue;
      }
      if (!this.needsToAct.has(this.turn)) { this.turn = (this.turn + 1) % 4; continue; }
      if (this.seats[this.turn].human) {
        this.coachEquity = equity(this.seats[0].cards, this.board, this.active.length - 1, 500);
        this.humanTurn = true;
        this.onChange();
        return;
      }
      this.onChange();
      await sleep(this.seats[0].folded ? 250 : 700);
      this.aiAct(this.turn);
      this.turn = (this.turn + 1) % 4;
      this.onChange();
    }
  }

  async nextStreet() {
    this.street++;
    for (const s of this.seats) if (!s.folded) { s.roundBet = 0; if (!s.allIn) s.action = ''; }
    this.currentBet = 0; this.raises = 0;
    this.onChange();
    await sleep(500);
    if (this.street === 1) this.board.push(this.deck.pop(), this.deck.pop(), this.deck.pop());
    else this.board.push(this.deck.pop());
    this.message = this.streetName(this.street);
    const actors = [0, 1, 2, 3].filter(i => !this.seats[i].folded && !this.seats[i].allIn);
    this.needsToAct = new Set(actors.length >= 2 ? actors : []);
    this.turn = (this.dealer + 1) % 4;
    this.onChange();
  }

  raise(i) {
    const target = this.currentBet + this.betSize;
    this.put(i, target - this.seats[i].roundBet);
    this.currentBet = target;
    this.raises++;
    this.seats[i].action = this.seats[i].allIn ? T('올인', 'All-in', 'オールイン') : `${T('레이즈', 'Raise', 'レイズ')} ${fmt(target)}`;
    this.needsToAct = new Set([0, 1, 2, 3].filter(j => j !== i && !this.seats[j].folded && !this.seats[j].allIn));
  }

  // ----- 코치

  advice() {
    const eq = this.coachEquity;
    if (eq === null) return ['', 'gray'];
    if (this.toCall === 0) return this.strength > 1.4 ? [T('벳 추천', 'Bet', 'ベット推奨'), 'orange'] : [T('체크 추천', 'Check', 'チェック推奨'), 'blue'];
    if (eq < this.potOdds) return [T('폴드 추천', 'Fold', 'フォールド推奨'), 'red'];
    if (this.strength > 1.5 && this.canRaise) return [T('레이즈 추천', 'Raise', 'レイズ推奨'), 'orange'];
    return [T('콜 추천', 'Call', 'コール推奨'), 'blue'];
  }

  /** 행동 직전에 승률 기준으로 판단을 채점한다 (0 폴드, 1 콜/체크, 2 레이즈, 3 올인) */
  grade(action) {
    const eq = this.coachEquity;
    if (eq === null) return;
    const po = this.potOdds;
    let good, why;
    if (action === 0) {
      good = this.toCall > 0 && eq < po;
      why = this.toCall === 0 ? T('공짜로 체크할 수 있었어요', 'You could have checked for free', '無料でチェックできました')
        : T(`승률 ${pct(eq)} ≥ 팟 오즈 ${pct(po)} — 콜이 이득`, `Equity ${pct(eq)} ≥ pot odds ${pct(po)} — calling was +EV`, `勝率 ${pct(eq)} ≥ ポットオッズ ${pct(po)} — コールが有利`);
    } else if (action === 1) {
      good = this.toCall === 0 || eq >= po - 0.02;
      why = T(`승률 ${pct(eq)} < 팟 오즈 ${pct(po)} — 폴드가 나았어요`, `Equity ${pct(eq)} < pot odds ${pct(po)} — folding was better`, `勝率 ${pct(eq)} < ポットオッズ ${pct(po)} — フォールドが良かった`);
    } else if (action === 2) {
      good = this.strength >= 1.1;
      why = T(`승률 ${pct(eq)} — 레이즈하기엔 약한 핸드`, `Equity ${pct(eq)} — too weak to raise`, `勝率 ${pct(eq)} — レイズには弱い`);
    } else {
      good = this.strength >= 1.5;
      why = T(`승률 ${pct(eq)} — 올인하기엔 위험한 핸드`, `Equity ${pct(eq)} — too risky to shove`, `勝率 ${pct(eq)} — オールインは危険`);
    }
    if (this.ranked) {
      // 랭크전에서는 결과만 기록하고 피드백은 판이 끝난 뒤 정확도로만 보여준다
      if (this.match) { this.match.decisions++; if (good) this.match.good++; }
      return;
    }
    recordDecision(good);
    this.feedback = good ? `👍 ${T('좋은 판단', 'Good decision', '良い判断')} · ${T('승률', 'equity', '勝率')} ${pct(eq)}` : `⚠️ ${why}`;
  }

  // ----- 사람 행동

  humanDone() {
    this.humanTurn = false;
    this.turn = (this.turn + 1) % 4;
    this.onChange();
    this.run();
  }
  fold() {
    if (!this.humanTurn) return;
    this.grade(0);
    this.seats[0].folded = true;
    this.seats[0].action = T('폴드', 'Fold', 'フォールド');
    this.needsToAct.delete(0);
    this.settleHuman(0);
    this.message = T('폴드 — AI들끼리 마무리 중...', 'Folded — AIs finishing the hand...', 'フォールド — AI同士で続行中...');
    this.humanDone();
  }
  call() {
    if (!this.humanTurn) return;
    this.grade(1);
    const c = this.toCall;
    this.put(0, c);
    this.seats[0].action = c === 0 ? T('체크', 'Check', 'チェック') : this.seats[0].allIn ? T('올인', 'All-in', 'オールイン') : `${T('콜', 'Call', 'コール')} ${fmt(c)}`;
    this.needsToAct.delete(0);
    this.humanDone();
  }
  raiseHuman() {
    if (!this.humanTurn || !this.canRaise) return;
    this.grade(2);
    this.raise(0);
    this.humanDone();
  }
  /** 가진 돈 전부를 팟에 넣는다 */
  shove() {
    if (!this.humanTurn || this.available <= 0) return;
    this.grade(3);
    const amount = this.available;
    const target = this.seats[0].roundBet + amount;
    this.put(0, amount);
    this.seats[0].action = `${T('올인', 'All-in', 'オールイン')} ${fmt(amount)}`;
    if (target > this.currentBet) {
      this.currentBet = target;
      this.raises++;
      this.needsToAct = new Set([1, 2, 3].filter(j => !this.seats[j].folded && !this.seats[j].allIn));
    } else {
      this.needsToAct.delete(0);
    }
    this.humanDone();
  }

  // ----- AI

  aiAct(i) {
    const s = this.seats[i];
    const opp = this.active.length - 1;
    const eq = equity(s.cards, this.board, opp);
    const strength = eq * (opp + 1);
    const call = Math.max(0, this.currentBet - s.roundBet);
    const potOdds = call / (this.pot + call);
    const r = Math.random();
    const othersCanAct = [0, 1, 2, 3].some(j => j !== i && !this.seats[j].folded && !this.seats[j].allIn);

    // 랭크전: 낮은 티어의 AI는 가끔 아무렇게나 둔다
    if (this.ranked && this.match && Math.random() < 0.25 * (1 - this.match.difficulty)) {
      if (call === 0) s.action = T('체크', 'Check', 'チェック');
      else if (Math.random() < 0.5) { this.put(i, call); s.action = `${T('콜', 'Call', 'コール')} ${fmt(call)}`; }
      else { s.folded = true; s.action = T('폴드', 'Fold', 'フォールド'); }
      this.needsToAct.delete(i);
      return;
    }

    if (this.canRaise && othersCanAct &&
        ((strength > 1.6 - s.aggression * 0.4 && r < 0.55 + s.aggression * 0.4) || r < s.bluff)) {
      this.raise(i);
    } else if (call === 0) {
      s.action = T('체크', 'Check', 'チェック');
    } else if (eq >= potOdds * s.tightness + 0.03 || r < s.bluff / 2) {
      this.put(i, call);
      s.action = `${T('콜', 'Call', 'コール')} ${fmt(call)}`;
    } else {
      s.folded = true;
      s.action = T('폴드', 'Fold', 'フォールド');
    }
    this.needsToAct.delete(i);
  }

  // ----- 정산

  /** 사람이 올인했을 때 받을 수 있는 몫(메인 팟) */
  eligiblePot() {
    const hIn = this.seats[0].totalIn;
    return this.seats.reduce((a, s) => a + Math.min(s.totalIn, hIn), 0);
  }

  finishUncontested() {
    const w = this.active[0];
    this.winners = new Set([w]);
    if (w === 0) {
      const net = this.settleHuman(this.eligiblePot());
      this.message = `${T('모두 폴드! 팟 획득', 'Everyone folded! Pot won', '全員フォールド！ポット獲得')} +${fmt(net)}`;
    } else {
      this.message = `${this.seats[w].emoji} ${this.name(w)} ${T('승리 (모두 폴드)', 'wins (all folded)', 'の勝ち（全員フォールド）')}`;
    }
    this.endHand();
  }

  doShowdown() {
    this.showdown = true;
    const scores = this.active.map(i => [i, bestScore([...this.seats[i].cards, ...this.board])]);
    const top = Math.max(...scores.map(x => x[1]));
    const ws = scores.filter(x => x[1] === top).map(x => x[0]);
    this.winners = new Set(ws);
    const name = handName(top);
    if (ws.includes(0)) {
      const net = this.settleHuman(this.eligiblePot() / ws.length);
      this.message = ws.length > 1 ? `${T('무승부', 'Split', '引き分け')} (${name}) ${signed(net)}` : `${T('승리!', 'You win!', '勝利！')} ${name} +${fmt(net)}`;
    } else {
      const net = this.settleHuman(0);
      const names = ws.map(i => `${this.seats[i].emoji} ${this.name(i)}`).join(', ');
      this.message = `${names} ${T('승리', 'wins', 'の勝ち')} — ${name}` + (net < 0 ? ` (−${fmt(-net)})` : '');
    }
    this.endHand();
  }

  endHand() {
    this.inHand = false;
    this.humanTurn = false;
    if (this.ranked && this.match && !this.match.result) {
      this.match.hand++;
      if (this.match.hand >= RANK.hands || this.match.stack < RANK.bb) this.finishMatch();
    }
    this.onChange();
  }

  // ----- 랭크전

  startMatch() {
    if (this.inHand) return;
    const rating = S.rank.rating;
    this.match = { hand: 0, stack: RANK.startStack, net: 0, decisions: 0, good: 0, result: null,
                   difficulty: Math.max(0, Math.min(1, (rating - 600) / 1600)) };
    this.board = []; this.winners = new Set(); this.win = null; this.feedback = '';
    for (const s of this.seats) { s.cards = []; s.action = ''; }
    this.message = T('랭크전 시작 · 20핸드', 'Ranked match · 20 hands', 'ランク戦開始 · 20ハンド');
    this.startHand();
  }

  /** 칩 손익과 판단 정확도로 레이팅 변화를 계산한다 */
  finishMatch() {
    const m = this.match;
    const old = S.rank.rating;
    const netBB = m.net / RANK.bb;
    const acc = m.decisions > 0 ? m.good / m.decisions : null;
    const perf = Math.max(-1, Math.min(1, netBB / 30)) * 0.6 + ((acc === null ? 0.6 : acc) - 0.6);
    const drift = (old - 1000) / 400; // 레이팅이 높을수록 기대치가 높다
    const placement = S.rank.matches < 5;
    let delta = Math.round(40 * perf - drift * 8);
    if (placement) delta *= 2;
    delta = Math.max(-60, Math.min(60, delta));
    const now = Math.max(0, old + delta);
    applyRank(now, delta);
    if (online.signedIn) onlineSubmit(delta);
    m.result = { netBB, accuracy: acc, delta, oldRating: old, newRating: now, placement };
    const before = tierInfo(old).label, after = tierInfo(now).label;
    if (before !== after) toast(now > old ? T(`승급! ${after}`, `Promoted to ${after}!`, `昇格！${after}`) : T(`강등: ${after}`, `Demoted to ${after}`, `降格：${after}`));
  }

  settleHuman(payout) {
    if (this.humanSettled) return 0;
    this.humanSettled = true;
    const staked = this.seats[0].totalIn;
    if (this.ranked && this.match) {
      this.match.stack += payout;
      const net = payout - staked;
      this.match.net += net;
      this.win = net > 0 ? true : net < 0 ? false : null;
      return net;
    }
    if (staked === 0 && payout === 0) { this.win = null; return 0; }
    const net = settle('holdem', staked, payout, 0);
    this.win = net > 0 ? true : net < 0 ? false : null;
    if (net > 0) playSound(true);
    return net;
  }
}
