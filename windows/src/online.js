'use strict';
// 온라인: 아이디/비밀번호 계정과 전체 순위표 (Supabase, server/schema.sql 참고)

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
  return {
    invalid_username: T('아이디는 영문 소문자, 숫자, _ 로 3~16자예요', 'Username: 3–16 lowercase letters, digits or _', 'IDは英小文字・数字・_で3〜16文字です'),
    invalid_nickname: T('닉네임은 2~12자, 한글·영문·숫자·_만 쓸 수 있어요', 'Nickname: 2–12 letters, digits or _', 'ニックネームは2〜12文字です'),
    invalid_password: T('비밀번호는 6자 이상이어야 해요', 'Password must be at least 6 characters', 'パスワードは6文字以上です'),
    username_taken: T('이미 있는 아이디예요', 'That username is taken', 'そのIDは使われています'),
    nickname_taken: T('이미 있는 닉네임이에요', 'That nickname is taken', 'そのニックネームは使われています'),
    invalid_login: T('아이디 또는 비밀번호가 틀렸어요', 'Wrong username or password', 'IDまたはパスワードが違います'),
    locked: T('비밀번호를 너무 많이 틀렸어요. 10분 뒤에 다시 해 주세요', 'Too many attempts. Try again in 10 minutes', '失敗が多すぎます。10分後にお試しください'),
    session_expired: T('로그인이 만료됐어요. 다시 로그인해 주세요', 'Your session expired. Please sign in again', 'ログインの有効期限が切れました'),
    too_soon: T('결과를 너무 빨리 보내서 이번 판은 온라인에 반영되지 않았어요', "Sent too quickly, so this match wasn't counted online", '送信が早すぎたため、今回はオンラインに反映されません'),
    daily_limit: T('오늘 온라인 랭크전 한도(40판)를 채웠어요', "You've hit today's online limit of 40 matches", '本日のオンライン上限（40試合）に達しました'),
    network: T('서버에 연결할 수 없어요', "Can't reach the server", 'サーバーに接続できません'),
  }[code] || `${T('오류가 났어요', 'Something went wrong', 'エラーが発生しました')} (${code})`;
}

async function rpc(name, params) {
  try {
    const res = await fetch(`${ONLINE.url}/rest/v1/rpc/${name}`, {
      method: 'POST',
      headers: { apikey: ONLINE.key, 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

function setOnlineProfile(p) {
  online.profile = p;
  localStorage.setItem('kasino-profile', JSON.stringify(p));
  // 로그인 중이면 서버 레이팅이 기준이다
  Object.assign(S.rank, { rating: p.rating, peak: p.peak, matches: p.matches });
  save();
}

function clearOnline() {
  online.token = null;
  online.profile = null;
  localStorage.removeItem('kasino-session');
  localStorage.removeItem('kasino-profile');
}

/** 계정 관련 호출. 성공하면 true, 실패하면 online.error에 문구를 넣고 false */
async function accountCall(name, params) {
  online.busy = true;
  render();
  const reply = await rpc(name, params);
  online.busy = false;
  if (!reply) { online.error = onlineErrorText('network'); render(); return false; }
  if (reply.error) {
    if (reply.error === 'session_expired') clearOnline();
    online.error = onlineErrorText(reply.error);
    render();
    return false;
  }
  online.error = '';
  if (reply.token) { online.token = reply.token; localStorage.setItem('kasino-session', reply.token); }
  if (reply.profile) setOnlineProfile(reply.profile);
  render();
  return true;
}

const onlineSignIn = (u, p) => accountCall('sign_in', { p_username: u, p_password: p });
const onlineSignUp = (u, p, n) => accountCall('sign_up', { p_username: u, p_password: p, p_nickname: n });

/** 앱 시작 시: 저장된 로그인으로 서버의 최신 레이팅을 받아온다 */
async function onlineRefresh() {
  if (online.token) await accountCall('me', { p_token: online.token });
}

async function onlineSignOut() {
  if (online.token) await rpc('sign_out', { p_token: online.token });
  clearOnline();
  online.error = '';
  render();
}

async function onlineDeleteAccount(password) {
  if (!online.token) return false;
  const ok = await accountCall('delete_account', { p_token: online.token, p_password: password });
  if (ok) { clearOnline(); render(); }
  return ok;
}

/** 랭크전 결과를 서버에 반영. 거절되면 서버 값으로 되돌린다 */
async function onlineSubmit(delta) {
  if (!online.token) return;
  if (!(await accountCall('submit_match', { p_token: online.token, p_delta: delta }))) {
    toast(online.error);
    await onlineRefresh();
  }
}

async function onlineLoadLeaderboard() {
  const rows = await rpc('leaderboard', { p_limit: 50 });
  if (Array.isArray(rows)) online.leaderboard = rows;
  else online.error = onlineErrorText('network');
  render();
}
