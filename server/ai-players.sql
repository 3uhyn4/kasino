-- Kasino AI 플레이어
-- Supabase 대시보드 > SQL Editor에 붙여넣고 Run. 여러 번 실행해도 된다.
--
-- 순위표가 비어 보이지 않도록 AI 플레이어를 넣는다. 순위표에서는 항상 AI로 표시된다.
-- 비밀번호는 무작위라 아무도 이 계정으로 로그인할 수 없다.
-- 모두 지우기: delete from public.players where is_bot;

alter table public.players add column if not exists is_bot boolean not null default false;

-- 순위표: AI는 bot: true, 이름은 name, 그리고 배지를 모르는 옛 버전 앱을 위해 nickname 뒤에 " (AI)"
create or replace function public.leaderboard(p_limit int default 50)
returns json
language sql stable security definer set search_path = ''
as $$
  select coalesce(json_agg(x order by x.rank, x.rounds desc), '[]'::json)
  from (
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

insert into public.players (username, nickname, pass_hash, is_bot, balance, peak, rounds, last_round_at, created_at)
select v.username, v.nickname,
       extensions.crypt(gen_random_uuid()::text, extensions.gen_salt('bf', 6)),
       true, v.balance, greatest(v.balance, v.peak), v.rounds,
       now() - make_interval(hours => v.hours_ago),
       now() - make_interval(days => v.days_ago)
from (values
  ('ai_01', U&'\B7ED\D0A4\BE44\D0A4',                 8420.00, 9100.00, 612,  2, 9),  -- 럭키비키
  ('ai_02', 'zl' || U&'\C874\BC14\CE74\B77C',         5160.00, 6020.00, 438,  5, 8),  -- zl존바카라
  ('ai_03', U&'\C911\AEBE\B9C8',                      3890.00, 4300.00, 351,  1, 7),  -- 중꺾마
  ('ai_04', U&'\D1F4\ADFC\D558\ACE0\D640\B364',       2610.00, 3550.00, 290, 11, 7),  -- 퇴근하고홀덤
  ('ai_05', 'yolo_bet',                               2240.00, 2480.00, 205,  3, 6),
  ('ai_06', U&'\AC13\C0DD\B7EC',                      1730.00, 2900.00, 263, 20, 6),  -- 갓생러
  ('ai_07', U&'\C624\D788\B824\C88B\C544',            1390.00, 1600.00, 142,  7, 5),  -- 오히려좋아
  ('ai_08', U&'\C6D0\C601\C801\C0AC\ACE0',            1080.00, 1950.00, 188, 30, 4),  -- 원영적사고
  ('ai_09', U&'\CA5D\CA5D\BC15\C0AC',                  860.00, 1420.00,  97, 14, 3),  -- 쩝쩝박사
  ('ai_10', U&'\D0B9\BC1B\B124',                       540.00, 1180.00,  76, 26, 3),  -- 킹받네
  ('ai_11', U&'\C874\BC84\B294\C2B9\B9AC\D55C\B2E4',   310.00, 1300.00, 121, 40, 2),  -- 존버는승리한다
  ('ai_12', U&'\B9DB\B3C4\B9AC',                       120.00, 1650.00, 158,  9, 1)   -- 맛도리
) as v(username, nickname, balance, peak, rounds, hours_ago, days_ago)
on conflict do nothing;

select public.leaderboard(20);
