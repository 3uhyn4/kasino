'use strict';
// 공용: 언어, 숫자 포맷, 카드, 뱅크롤·통계 저장

// ---------- 설정 / 언어

const prefs = Object.assign(
  { lang: 'ko', theme: 'system', coach: true, tab: 'baccarat' },
  safeParse(localStorage.getItem('kasino-prefs'))
);
function savePrefs() { localStorage.setItem('kasino-prefs', JSON.stringify(prefs)); }

/** 현재 언어에 맞는 문자열 (한국어, 영어, 일본어) */
function T(ko, en, ja) { return prefs.lang === 'en' ? en : prefs.lang === 'ja' ? ja : ko; }

function safeParse(s) { try { return JSON.parse(s) || {}; } catch { return {}; } }

// ---------- 숫자 포맷

const numberFormat = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });
function fmt(v) {
  const r = Math.abs(v) >= 1000 ? Math.round(v) : Math.round(v * 100) / 100;
  return numberFormat.format(r);
}
function fmtShort(v) {
  const a = Math.abs(v);
  for (const [d, u] of [[1e12, 'T'], [1e9, 'B'], [1e6, 'M'], [1e3, 'K']]) {
    if (a >= d) {
      const x = v / d;
      return (Number.isInteger(x) ? String(x) : x.toFixed(1)) + u;
    }
  }
  return fmt(v);
}
const signed = v => (v >= 0 ? '+' : '−') + fmt(Math.abs(v));
const pct = v => (v * 100).toFixed(1) + '%';
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ---------- 카드

const SUITS = ['♠', '♥', '♦', '♣'];
const FACES = { 11: '💂', 12: '👸', 13: '🤴' };

function makeCard(rank, suit) { return { rank, suit }; }
function cardLabel(c) { return ({ 14: 'A', 13: 'K', 12: 'Q', 11: 'J' }[c.rank] || String(c.rank)) + SUITS[c.suit]; }
const isRed = c => c.suit === 1 || c.suit === 2;
const baccaratValue = c => (c.rank === 14 ? 1 : c.rank >= 10 ? 0 : c.rank);

function randInt(n) {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return a[0] % n;
}
function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = randInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function makeDeck(n = 1) {
  const d = [];
  for (let k = 0; k < n; k++) for (let s = 0; s < 4; s++) for (let r = 2; r <= 14; r++) d.push(makeCard(r, s));
  return shuffle(d);
}

// ---------- 게임 / 통계

const GAMES = ['baccarat', 'dragonTiger', 'roulette', 'holdem', 'slots'];
function gameName(g) {
  return {
    baccarat: T('바카라', 'Baccarat', 'バカラ'),
    dragonTiger: T('용호', 'Dragon Tiger', 'ドラゴンタイガー'),
    roulette: T('룰렛', 'Roulette', 'ルーレット'),
    holdem: T('홀덤', "Hold'em", 'ホールデム'),
    slots: T('슬롯', 'Slots', 'スロット'),
  }[g];
}

function newStats() {
  return {
    rounds: 0, wins: 0, losses: 0, pushes: 0, wagered: 0, net: 0,
    expected: 0,       // 하우스 엣지 기준 기대 손익
    biggestWin: 0, biggestLoss: 0,
    streak: 0, bestStreak: 0, worstStreak: 0,
    decisions: 0, goodDecisions: 0,   // 홀덤 판단
  };
}
const winRate = s => (s.wins + s.losses > 0 ? s.wins / (s.wins + s.losses) : null);
const roi = s => (s.wagered > 0 ? s.net / s.wagered : null);
/** 운 = 실제 손익 − 기대 손익 */
const luck = s => s.net - s.expected;
const accuracy = s => (s.decisions > 0 ? s.goodDecisions / s.decisions : null);

// ---------- 저장 데이터

const SAVE_KEY = 'kasino-v1';
const S = Object.assign(
  { bankroll: 1e6, startBankroll: 1e6, stats: {}, curve: [1e6], bacHistory: [], dtHistory: [], rouHistory: [] },
  safeParse(localStorage.getItem(SAVE_KEY))
);
function save() { localStorage.setItem(SAVE_KEY, JSON.stringify(S)); }

let sessionStart = S.bankroll;
let bet = Math.max(1, Math.round(S.startBankroll / 100));
let allIn = false;
/** 랭크 모드: 서버 계정의 칩으로 하고 전체 순위에 반영된다 */
let ranked = localStorage.getItem('kasino-ranked') === '1';
// 랭크 잔액 = 서버가 확인한 잔액 − 진행 중인 판에 건 돈 + 서버 확인을 기다리는 결과
// (서버 응답이 진행 중인 판의 차감분을 덮어쓰지 않도록 나눠서 관리한다)
let rankServer = 0;
let openStake = 0;
const queuedNets = new Map();
let nextRoundId = 1;
const rankBalance = () => rankServer - openStake + [...queuedNets.values()].reduce((a, n) => a + n, 0);
/** 베팅했지만 아직 정산 전인 판 수 (이 동안은 모드 전환 금지) */
let inFlight = 0;
const money = () => (ranked ? rankBalance() : S.bankroll);

const stats = g => S.stats[g] || newStats();
/** 올인 모드면 베팅하는 순간의 전 재산 */
const effectiveBet = () => (allIn ? money() : bet);
function setBet(v) { allIn = false; bet = Math.max(1, Math.round(v)); render(); }

/** 금액을 차감한다. 잔액이 부족하면 false */
function spend(amount) {
  if (ranked) {
    if (!online.signedIn) { toast(T('랭크 모드는 로그인이 필요해요', 'Ranked mode needs an account', 'ランクモードはログインが必要です')); return false; }
    if (rankBalance() < amount || amount <= 0) {
      toast(T('칩이 부족해요 — 베팅을 줄이거나 순위 탭에서 파산 지원을 받으세요', 'Not enough chips — lower your bet or claim relief in the Ranking tab', 'チップ不足 — 賭け金を下げるか、ランキングタブで救済を受けてください'));
      return false;
    }
    openStake += amount;
    inFlight++;
    return true;
  }
  if (S.bankroll < amount || amount <= 0) {
    toast(T('잔액이 부족해요 — 베팅을 줄이거나 설정에서 뱅크롤을 리셋하세요',
            'Insufficient bankroll — lower your bet or reset it in Settings',
            '残高不足 — 賭け金を下げるか設定でリセットしてください'));
    return false;
  }
  S.bankroll -= amount;
  inFlight++;
  return true;
}

/** 홀덤처럼 판 중간에 칩을 넣을 때: 가진 만큼만 빼고 실제로 뺀 금액을 돌려준다 */
function debit(amount) {
  const a = Math.min(amount, money());
  if (ranked) openStake += a; else S.bankroll -= a;
  return a;
}

function syncBalance(b) {
  // 처음 칩을 받았을 때(가입·로그인) 기본 베팅을 잔액의 1%로
  if (ranked && rankServer === 0 && b > 0) { allIn = false; bet = Math.max(1, Math.round(b / 100)); }
  rankServer = b;
}

const canSwitchMode = () => inFlight === 0 && !holdem.inHand;
function setRanked(v) {
  if (!canSwitchMode() || ranked === v) return;
  ranked = v;
  localStorage.setItem('kasino-ranked', v ? '1' : '0');
  allIn = false;
  bet = Math.max(1, Math.round(money() / 100));
  if (v) onlineRefresh();
  render();
}

/** 총 반환금(원금 포함)을 지급하고 기록한다. 순손익을 돌려준다 */
function settle(game, b, payout, expectedLoss) {
  inFlight = Math.max(0, inFlight - 1);
  if (ranked) {
    openStake = Math.max(0, openStake - b);
    const id = nextRoundId++;
    queuedNets.set(id, payout - b);
    onlineSubmitRound(id, game, b, payout);
    return payout - b;
  }
  S.bankroll += payout;
  const net = payout - b;
  const st = stats(game);
  st.rounds++;
  st.wagered += b;
  st.net += net;
  st.expected -= expectedLoss;
  if (net > 0) {
    st.wins++;
    st.streak = st.streak > 0 ? st.streak + 1 : 1;
    st.bestStreak = Math.max(st.bestStreak, st.streak);
    st.biggestWin = Math.max(st.biggestWin, net);
  } else if (net < 0) {
    st.losses++;
    st.streak = st.streak < 0 ? st.streak - 1 : -1;
    st.worstStreak = Math.min(st.worstStreak, st.streak);
    st.biggestLoss = Math.min(st.biggestLoss, net);
  } else {
    st.pushes++;
  }
  S.stats[game] = st;
  S.curve.push(S.bankroll);
  if (S.curve.length > 500) S.curve.splice(0, S.curve.length - 500);
  save();
  return net;
}

function recordDecision(good) {
  if (ranked) return; // 통계는 연습 모드 기록
  const st = stats('holdem');
  st.decisions++;
  if (good) st.goodDecisions++;
  S.stats.holdem = st;
}

function pushHistory(key, r) {
  S[key].push(r);
  if (S[key].length > 150) S[key].splice(0, S[key].length - 150);
}

function resetBankroll() {
  S.bankroll = S.startBankroll;
  S.curve.push(S.bankroll);
  sessionStart = S.bankroll;
  allIn = false;
  bet = Math.max(1, Math.round(S.startBankroll / 100));
  save();
  toast(T(`뱅크롤을 ${fmt(S.bankroll)}(으)로 리셋했어요`, `Bankroll reset to ${fmt(S.bankroll)}`, `残高を ${fmt(S.bankroll)} にリセットしました`));
}
function resetStats() {
  S.stats = {};
  S.curve = [S.bankroll];
  S.bacHistory = [];
  S.dtHistory = [];
  S.rouHistory = [];
  sessionStart = S.bankroll;
  save();
  toast(T('통계를 초기화했어요', 'Stats cleared', '統計をリセットしました'));
}

// ---------- 알림

let toastText = '';
let toastTimer = null;
function toast(msg) {
  toastText = msg;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toastText = ''; render(); }, 4000);
  render();
}

function playSound(win) {
  // 짧은 효과음 (Web Audio)
  try {
    const ctx = playSound.ctx || (playSound.ctx = new AudioContext());
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.value = win ? 880 : 440;
    g.gain.setValueAtTime(0.06, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.25);
    o.connect(g).connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + 0.25);
  } catch { /* 소리 없이 진행 */ }
}

// ---------- DOM 도우미

/** h('div', {class: 'x', onclick: fn}, child, 'text', ...) */
function h(tag, attrs, ...children) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    e.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return e;
}
