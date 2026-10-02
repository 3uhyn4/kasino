'use strict';
// 온라인: 랭크 모드 계정(아이디/비밀번호), 칩 잔액, 전체 순위표 (Supabase, server/schema.sql 참고)

const ONLINE = {
  url: 'https://vyjaipiomptfrjxtwnvb.supabase.co',
  // 공개용(publishable) 키: 앱에 들어가도 되는 값. 데이터는 DB 함수와 권한으로 보호된다.
  key: 'sb_publishable_HTMiQwD-qtNqOSs4aJ6nFA_Bel7On6G',
};

const online = {
  token: localStorage.getItem('kasino-session'),
  profile: (() => { try { return JSON.parse(localStorage.getItem('kasino-profile')); } catch { return null; } })(),
  leaderboard: [],
  busy: false,
  error: '',
  get signedIn() { return !!(this.token && this.profile); },
};

function onlineErrorText(code) {
  const rejected = T('이번 판이 서버에 반영되지 않아 잔액을 서버 기준으로 맞췄어요', "This round wasn't accepted, so your chips were synced with the server", '今回の結果は反映されず、残高をサーバーに合わせました');
  return {
    invalid_username: T('아이디는 영문 소문자, 숫자, _ 로 3~16자예요', 'Username: 3–16 lowercase letters, digits or _', 'IDは英小文字・数字・_で3〜16文字です'),
    invalid_nickname: T('닉네임은 2~12자, 한글·영문·숫자·_만 쓸 수 있어요', 'Nickname: 2–12 letters, digits or _', 'ニックネームは2〜12文字です'),
    invalid_password: T('비밀번호는 6자 이상이어야 해요', 'Password must be at least 6 characters', 'パスワードは6文字以上です'),
    username_taken: T('이미 있는 아이디예요', 'That username is taken', 'そのIDは使われています'),
    nickname_taken: T('이미 있는 닉네임이에요', 'That nickname is taken', 'そのニックネームは使われています'),
    invalid_login: T('아이디 또는 비밀번호가 틀렸어요', 'Wrong username or password', 'IDまたはパスワードが違います'),
    locked: T('비밀번호를 너무 많이 틀렸어요. 10분 뒤에 다시 해 주세요', 'Too many attempts. Try again in 10 minutes', '失敗が多すぎます。10分後にお試しください'),
    session_expired: T('로그인이 만료됐어요. 다시 로그인해 주세요', 'Your session expired. Please sign in again', 'ログインの有効期限が切れました'),
    too_soon: rejected, invalid_round: rejected, insufficient: rejected,
    relief_unavailable: T('파산 지원은 칩이 100 미만일 때 하루 한 번만 받을 수 있어요', 'Relief is only available once a day when you have under 100 chips', '救済は100チップ未満のとき1日1回だけです'),
    network: T('서버에 연결할 수 없어요', "Can't reach the server", 'サーバーに接続できません'),
  }[code] || `${T('오류가 났어요', 'Something went wrong', 'エラーが発生しました')} (${code})`;
}

let serverMessage = '';

async function rpc(name, params) {
  serverMessage = '';
  try {
    const res = await fetch(`${ONLINE.url}/rest/v1/rpc/${name}`, {
      method: 'POST',
      headers: { apikey: ONLINE.key, 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
      serverMessage = (await res.json().catch(() => ({}))).message || `HTTP ${res.status}`;
      return null;
    }
    return await res.json();
  } catch {
    return null;
  }
}

function setOnlineProfile(p) {
  online.profile = p;
  localStorage.setItem('kasino-profile', JSON.stringify(p));
  syncBalance(Number(p.balance));
}

function clearOnline() {
  online.token = null;
  online.profile = null;
  localStorage.removeItem('kasino-session');
  localStorage.removeItem('kasino-profile');
  queuedNets.clear();
  openStake = 0;
  syncBalance(0);
}

/** 서버 함수 호출. 성공하면 true, 실패하면 online.error에 문구를 넣고 false */
async function onlineCall(name, params, showBusy = true) {
  if (showBusy) { online.busy = true; render(); }
  const reply = await rpc(name, params);
  if (showBusy) online.busy = false;
  if (!reply) {
    online.error = serverMessage ? `${T('서버 오류', 'Server error', 'サーバーエラー')}: ${serverMessage}` : onlineErrorText('network');
    render();
    return false;
  }
  if (reply.profile) setOnlineProfile(reply.profile);
  if (reply.error) {
    if (reply.error === 'session_expired') clearOnline();
    online.error = onlineErrorText(reply.error);
    render();
    return false;
  }
  online.error = '';
  if (reply.token) { online.token = reply.token; localStorage.setItem('kasino-session', reply.token); }
  render();
  return true;
}

const onlineSignIn = (u, p) => onlineCall('sign_in', { p_username: u, p_password: p });
const onlineSignUp = (u, p, n) => onlineCall('sign_up', { p_username: u, p_password: p, p_nickname: n });

/** 앱 시작 시, 순위 화면을 열 때: 서버의 최신 잔액과 순위를 받아온다 */
async function onlineRefresh() {
  if (online.token) await onlineCall('me', { p_token: online.token }, false);
}

async function onlineSignOut() {
  if (online.token) await rpc('sign_out', { p_token: online.token });
  clearOnline();
  online.error = '';
  render();
}

async function onlineDeleteAccount(password) {
  if (!online.token) return false;
  const ok = await onlineCall('delete_account', { p_token: online.token, p_password: password });
  if (ok) { clearOnline(); render(); }
  return ok;
}

async function onlineClaimRelief() {
  if (online.token && await onlineCall('claim_relief', { p_token: online.token })) {
    toast(T('1,000칩을 받았어요', 'You received 1,000 chips', '1,000チップを受け取りました'));
  }
}

// 라운드 결과를 순서대로, 서버 제한(0.5초)에 걸리지 않게 보낸다
let roundQueue = Promise.resolve();
let lastRoundSent = 0;

/** 한 판 결과를 서버에 보낸다. 거절되면 그 판은 버리고 서버 잔액으로 맞춘다 */
function onlineSubmitRound(id, game, bet, payout) {
  const token = online.token;
  if (!token) { queuedNets.delete(id); return; }
  roundQueue = roundQueue.then(async () => {
    const wait = 550 - (Date.now() - lastRoundSent);
    if (wait > 0) await new Promise(r => setTimeout(r, wait));
    lastRoundSent = Date.now();
    const reply = await rpc('submit_round', {
      p_token: token, p_game: game, p_bet: Math.round(bet * 100) / 100, p_payout: Math.round(payout * 100) / 100,
    });
    queuedNets.delete(id);                 // 응답의 잔액에 이 판이 들어 있거나(성공) 버려졌다(실패)
    if (reply && reply.profile) setOnlineProfile(reply.profile);
    if (!reply || reply.error) {
      if (reply && reply.error === 'session_expired') clearOnline();
      online.error = reply ? onlineErrorText(reply.error) : onlineErrorText('network');
      toast(online.error);
      if (!reply) await onlineRefresh();
    }
    render();
  });
}

async function onlineLoadLeaderboard() {
  const rows = await rpc('leaderboard', { p_limit: 50 });
  if (Array.isArray(rows)) online.leaderboard = rows;
  else online.error = onlineErrorText('network');
  render();
}
