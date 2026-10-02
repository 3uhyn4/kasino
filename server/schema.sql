-- Kasino 계정 · 랭크 순위표 (v2: 칩 잔액 순위)
-- Supabase 대시보드 > SQL Editor에 전체를 붙여넣고 Run.
-- 이전 버전 테이블과 함수는 지우고 새로 만든다.
--
-- 아이디/비밀번호 로그인을 Supabase Auth 대신 여기서 직접 처리한다(이메일 불필요).
--  - 비밀번호는 bcrypt 해시로만 저장
--  - 로그인하면 무작위 토큰을 발급하고, DB에는 토큰의 SHA-256만 저장
--  - 비밀번호를 10번 틀리면 10분 잠금
-- 테이블은 직접 읽거나 쓸 수 없고, 아래 함수(RPC)로만 접근한다.
--
-- 랭크 모드: 가입하면 1,000칩. 앱은 매 판 (게임, 건 금액, 받은 금액)을 보내고
-- 서버가 잔액을 관리한다. 건 금액은 잔액 이하, 받은 금액은 게임별 최대 배당 이하,
-- 0.5초에 한 판까지만 받는다. 잔액이 100 미만이면 하루 한 번 1,000칩으로 채울 수 있다.

-- ---------- 이전 버전 정리

drop function if exists
  public.sign_up(text, text, text), public.sign_in(text, text), public.sign_out(text), public.me(text),
  public.submit_match(text, int), public.submit_round(text, text, numeric, numeric), public.claim_relief(text),
  public.set_nickname(text, text), public.delete_account(text, text), public.leaderboard(int),
  public._session_player(text), public._new_session(uuid), public._profile(uuid);
drop table if exists public.sessions, public.players;

create extension if not exists pgcrypto with schema extensions;

create table public.players (
  id             uuid primary key default gen_random_uuid(),
  username       text not null unique check (username ~ '^[a-z0-9_]{3,16}$'),
  nickname       text not null unique
                 check (char_length(nickname) between 2 and 12
                        and nickname ~ '^[0-9A-Za-z_\uAC00-\uD7A3\u3041-\u309F\u30A0-\u30FF\u4E00-\u9FFF]+$'),
  pass_hash      text not null,
  balance        numeric(20, 2) not null default 1000 check (balance >= 0),
  peak           numeric(20, 2) not null default 1000,
  rounds         int not null default 0,
  last_round_at  timestamptz,
  relief_day     date,
  is_bot         boolean not null default false,   -- AI 플레이어 (server/ai-players.sql)
  failed_logins  int not null default 0,
  locked_until   timestamptz,
  created_at     timestamptz not null default now()
);

create table public.sessions (
  token_hash  text primary key,
  player_id   uuid not null references public.players (id) on delete cascade,
  expires_at  timestamptz not null default now() + interval '180 days'
);

alter table public.players enable row level security;
alter table public.sessions enable row level security;
revoke all on public.players, public.sessions from public, anon, authenticated;

-- ---------- 내부용

create function public._session_player(p_token text)
returns uuid
language sql stable security definer set search_path = ''
as $$
  select player_id from public.sessions
   where token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
     and expires_at > now();
$$;

create function public._new_session(p_player uuid)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  t text := encode(extensions.gen_random_bytes(32), 'hex');
begin
  delete from public.sessions where player_id = p_player and expires_at <= now();
  insert into public.sessions (token_hash, player_id)
  values (encode(extensions.digest(t, 'sha256'), 'hex'), p_player);
  return t;
end;
$$;

create function public._profile(p_player uuid)
returns json
language sql stable security definer set search_path = ''
as $$
  select json_build_object(
    'username', p.username,
    'nickname', p.nickname,
    'balance',  p.balance,
    'peak',     p.peak,
    'rounds',   p.rounds,
    'rank',     (select count(*) + 1 from public.players q where q.balance > p.balance),
    'relief',   p.balance < 100 and (p.relief_day is null or p.relief_day < current_date))
  from public.players p where p.id = p_player;
$$;

revoke execute on function public._session_player(text), public._new_session(uuid), public._profile(uuid)
  from public, anon, authenticated;

-- ---------- 공개 함수 (실패하면 {"error": "..."}를 돌려준다)

create function public.sign_up(p_username text, p_password text, p_nickname text)
returns json
language plpgsql security definer set search_path = ''
as $$
declare
  u text := lower(trim(p_username));
  n text := trim(p_nickname);
  pid uuid;
begin
  if u !~ '^[a-z0-9_]{3,16}$' then return json_build_object('error', 'invalid_username'); end if;
  if char_length(n) not between 2 and 12 or n !~ '^[0-9A-Za-z_\uAC00-\uD7A3\u3041-\u309F\u30A0-\u30FF\u4E00-\u9FFF]+$' then
    return json_build_object('error', 'invalid_nickname');
  end if;
  if char_length(p_password) not between 6 and 72 then return json_build_object('error', 'invalid_password'); end if;
  if exists (select 1 from public.players where username = u) then return json_build_object('error', 'username_taken'); end if;
  if exists (select 1 from public.players where nickname = n) then return json_build_object('error', 'nickname_taken'); end if;

  insert into public.players (username, nickname, pass_hash)
  values (u, n, extensions.crypt(p_password, extensions.gen_salt('bf', 10)))
  returning id into pid;
  return json_build_object('token', public._new_session(pid), 'profile', public._profile(pid));
end;
$$;

create function public.sign_in(p_username text, p_password text)
returns json
language plpgsql security definer set search_path = ''
as $$
declare
  p public.players;
begin
  select * into p from public.players where username = lower(trim(p_username)) for update;
  if not found then return json_build_object('error', 'invalid_login'); end if;
  if p.locked_until is not null and p.locked_until > now() then
    return json_build_object('error', 'locked');
  end if;
  if p.pass_hash <> extensions.crypt(p_password, p.pass_hash) then
    update public.players
       set failed_logins = case when failed_logins + 1 >= 10 then 0 else failed_logins + 1 end,
           locked_until  = case when failed_logins + 1 >= 10 then now() + interval '10 minutes' else locked_until end
     where id = p.id;
    return json_build_object('error', 'invalid_login');
  end if;
  update public.players set failed_logins = 0, locked_until = null where id = p.id;
  return json_build_object('token', public._new_session(p.id), 'profile', public._profile(p.id));
end;
$$;

create function public.sign_out(p_token text)
returns json
language sql security definer set search_path = ''
as $$
  delete from public.sessions where token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex');
  select json_build_object('ok', true);
$$;

create function public.me(p_token text)
returns json
language plpgsql stable security definer set search_path = ''
as $$
declare
  pid uuid := public._session_player(p_token);
begin
  if pid is null then return json_build_object('error', 'session_expired'); end if;
  return json_build_object('profile', public._profile(pid));
end;
$$;

-- 한 판 결과 반영. 받을 수 있는 최대 배당(원금 포함 배수)은 게임마다 다르다.
create function public.submit_round(p_token text, p_game text, p_bet numeric, p_payout numeric)
returns json
language plpgsql security definer set search_path = ''
as $$
declare
  pid uuid := public._session_player(p_token);
  p public.players;
  cap numeric := case p_game
                   when 'baccarat'    then 32    -- 사이드 베팅 포함
                   when 'dragonTiger' then 9
                   when 'roulette'    then 36
                   when 'slots'       then 777
                   when 'holdem'      then 4     -- 내 몫의 팟은 최대 4명분
                 end;
begin
  if pid is null then return json_build_object('error', 'session_expired'); end if;
  if cap is null or p_bet is null or p_payout is null or p_bet <= 0 or p_payout < 0 or p_payout > p_bet * cap then
    return json_build_object('error', 'invalid_round');
  end if;
  select * into p from public.players where id = pid for update;
  if p.last_round_at is not null and p.last_round_at > now() - interval '500 milliseconds' then
    return json_build_object('error', 'too_soon');
  end if;
  if p_bet > p.balance then
    return json_build_object('error', 'insufficient', 'profile', public._profile(pid));
  end if;
  update public.players
     set balance       = round(balance - p_bet + p_payout, 2),
         peak          = greatest(peak, round(balance - p_bet + p_payout, 2)),
         rounds        = rounds + 1,
         last_round_at = now()
   where id = pid;
  return json_build_object('profile', public._profile(pid));
end;
$$;

-- 파산 지원: 잔액 100 미만이면 하루 한 번 1,000칩
create function public.claim_relief(p_token text)
returns json
language plpgsql security definer set search_path = ''
as $$
declare
  pid uuid := public._session_player(p_token);
begin
  if pid is null then return json_build_object('error', 'session_expired'); end if;
  update public.players
     set balance = 1000, relief_day = current_date
   where id = pid and balance < 100 and (relief_day is null or relief_day < current_date);
  if not found then return json_build_object('error', 'relief_unavailable'); end if;
  return json_build_object('profile', public._profile(pid));
end;
$$;

create function public.set_nickname(p_token text, p_nickname text)
returns json
language plpgsql security definer set search_path = ''
as $$
declare
  pid uuid := public._session_player(p_token);
  n text := trim(p_nickname);
begin
  if pid is null then return json_build_object('error', 'session_expired'); end if;
  if char_length(n) not between 2 and 12 or n !~ '^[0-9A-Za-z_\uAC00-\uD7A3\u3041-\u309F\u30A0-\u30FF\u4E00-\u9FFF]+$' then
    return json_build_object('error', 'invalid_nickname');
  end if;
  if exists (select 1 from public.players where nickname = n and id <> pid) then
    return json_build_object('error', 'nickname_taken');
  end if;
  update public.players set nickname = n where id = pid;
  return json_build_object('profile', public._profile(pid));
end;
$$;

create function public.delete_account(p_token text, p_password text)
returns json
language plpgsql security definer set search_path = ''
as $$
declare
  pid uuid := public._session_player(p_token);
  h text;
begin
  if pid is null then return json_build_object('error', 'session_expired'); end if;
  select pass_hash into h from public.players where id = pid;
  if h <> extensions.crypt(p_password, h) then return json_build_object('error', 'invalid_login'); end if;
  delete from public.players where id = pid;
  return json_build_object('ok', true);
end;
$$;

create function public.leaderboard(p_limit int default 50)
returns json
language sql stable security definer set search_path = ''
as $$
  select coalesce(json_agg(x order by x.rank, x.rounds desc), '[]'::json)
  from (
    -- AI는 bot: true, 이름은 name. 배지를 모르는 옛 버전 앱을 위해 nickname 뒤에 " (AI)"
    select case when is_bot then nickname || ' (AI)' else nickname end as nickname,
           nickname as name,
           is_bot as bot,
           balance, rounds,
           rank() over (order by balance desc) as rank
    from public.players
    order by balance desc, rounds desc
    limit least(greatest(coalesce(p_limit, 50), 1), 100)
  ) x;
$$;

revoke execute on function
  public.sign_up(text, text, text), public.sign_in(text, text), public.sign_out(text), public.me(text),
  public.submit_round(text, text, numeric, numeric), public.claim_relief(text),
  public.set_nickname(text, text), public.delete_account(text, text), public.leaderboard(int)
  from public;
grant execute on function
  public.sign_up(text, text, text), public.sign_in(text, text), public.sign_out(text), public.me(text),
  public.submit_round(text, text, numeric, numeric), public.claim_relief(text),
  public.set_nickname(text, text), public.delete_account(text, text), public.leaderboard(int)
  to anon, authenticated;

-- ---------- 자체 점검: 가입이 실제로 되는지 확인하고 지운다.
-- 문제가 있으면 여기서 오류 메시지가 나오고, 위 내용도 모두 취소된다.
do $$
declare
  -- 닉네임은 한글(U+C790 U+CCB4 U+C810 U+AC80)로 넣어 한글 처리도 함께 확인한다
  r json := public.sign_up('selftest_kasino', 'selftest-pass', U&'\C790\CCB4\C810\AC80');
begin
  if r->>'token' is null then
    raise exception 'Kasino self-test failed: %', r;
  end if;
  delete from public.players where username = 'selftest_kasino';
  raise notice 'Kasino self-test passed';
end;
$$;
