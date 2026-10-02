-- Kasino 계정 · 랭크 순위표
-- Supabase 대시보드 > SQL Editor에 전체를 붙여넣고 Run.
--
-- 아이디/비밀번호 로그인을 Supabase Auth 대신 여기서 직접 처리한다(이메일 불필요).
--  - 비밀번호는 bcrypt 해시로만 저장
--  - 로그인하면 무작위 토큰을 발급하고, DB에는 토큰의 SHA-256만 저장
--  - 비밀번호를 10번 틀리면 10분 잠금
-- 테이블은 직접 읽거나 쓸 수 없고, 아래 함수(RPC)로만 접근한다.
--
-- 레이팅은 서버가 보관한다. 앱은 랭크전이 끝날 때 변화량만 보내고,
-- 서버는 한 판에 ±60점, 30초에 한 번, 하루 40판까지만 반영한다(간단한 조작 방지).

create extension if not exists pgcrypto with schema extensions;

create table public.players (
  id             uuid primary key default gen_random_uuid(),
  username       text not null unique check (username ~ '^[a-z0-9_]{3,16}$'),
  nickname       text not null unique
                 check (char_length(nickname) between 2 and 12
                        and nickname ~ '^[0-9A-Za-z_가-힣ぁ-ゟ゠-ヿ一-鿿]+$'),
  pass_hash      text not null,
  rating         int not null default 1000,
  peak           int not null default 1000,
  matches        int not null default 0,
  last_match_at  timestamptz,
  day            date,
  day_matches    int not null default 0,
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
    'rating',   p.rating,
    'peak',     p.peak,
    'matches',  p.matches,
    'rank',     case when p.matches > 0
                     then (select count(*) + 1 from public.players q where q.matches > 0 and q.rating > p.rating)
                end)
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
  if char_length(n) not between 2 and 12 or n !~ '^[0-9A-Za-z_가-힣ぁ-ゟ゠-ヿ一-鿿]+$' then
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

create function public.submit_match(p_token text, p_delta int)
returns json
language plpgsql security definer set search_path = ''
as $$
declare
  pid uuid := public._session_player(p_token);
  p public.players;
  d int := greatest(-60, least(60, coalesce(p_delta, 0)));
begin
  if pid is null then return json_build_object('error', 'session_expired'); end if;
  select * into p from public.players where id = pid for update;
  if p.last_match_at is not null and p.last_match_at > now() - interval '30 seconds' then
    return json_build_object('error', 'too_soon');
  end if;
  if p.day = current_date and p.day_matches >= 40 then
    return json_build_object('error', 'daily_limit');
  end if;
  update public.players
     set rating        = greatest(0, rating + d),
         peak          = greatest(peak, rating + d),
         matches       = matches + 1,
         last_match_at = now(),
         day_matches   = case when day = current_date then day_matches + 1 else 1 end,
         day           = current_date
   where id = pid;
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
  if char_length(n) not between 2 and 12 or n !~ '^[0-9A-Za-z_가-힣ぁ-ゟ゠-ヿ一-鿿]+$' then
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
  select coalesce(json_agg(x order by x.rank, x.matches desc), '[]'::json)
  from (
    select nickname, rating, peak, matches,
           rank() over (order by rating desc) as rank
    from public.players
    where matches > 0
    order by rating desc, matches desc
    limit least(greatest(coalesce(p_limit, 50), 1), 100)
  ) x;
$$;

revoke execute on function
  public.sign_up(text, text, text), public.sign_in(text, text), public.sign_out(text), public.me(text),
  public.submit_match(text, int), public.set_nickname(text, text), public.delete_account(text, text),
  public.leaderboard(int)
  from public;
grant execute on function
  public.sign_up(text, text, text), public.sign_in(text, text), public.sign_out(text), public.me(text),
  public.submit_match(text, int), public.set_nickname(text, text), public.delete_account(text, text),
  public.leaderboard(int)
  to anon, authenticated;
