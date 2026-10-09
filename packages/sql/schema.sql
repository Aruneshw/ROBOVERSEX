-- Roboverse X — PostgreSQL schema (identical for self-hosted Postgres and Supabase)
-- gen_random_uuid() is built into PostgreSQL 13+ (no extension needed)

create table if not exists event_settings (
  id                      smallint primary key default 1 check (id = 1),
  event_name              text        not null default 'Roboverse X',
  common_username         text        not null default 'roboverse',
  common_password_hash    text        not null,
  admin_password_hash     text        not null,
  starts_at               timestamptz,
  ends_at                 timestamptz,
  is_paused               boolean     not null default false,
  unlock_mode             text        not null default 'sequential' check (unlock_mode in ('sequential', 'open')),
  roast_enabled           boolean     not null default true,
  single_session          boolean     not null default true,
  submission_cooldown_sec int         not null default 15 check (submission_cooldown_sec between 0 and 600),
  max_attempts_per_task   int         not null default 50 check (max_attempts_per_task > 0),
  penalty_per_fail_sec    int         not null default 0 check (penalty_per_fail_sec >= 0),
  updated_at              timestamptz not null default now()
);

create table if not exists teams (
  id              uuid primary key default gen_random_uuid(),
  code            text        not null unique check (code = upper(code)),   -- e.g. RVX-014
  name            text        not null,
  institution     text,
  members         jsonb       not null default '[]'::jsonb,
  is_active       boolean     not null default true,
  session_version int         not null default 0,
  last_login_at   timestamptz,
  last_seen_at    timestamptz,
  created_at      timestamptz not null default now()
);

create table if not exists tasks (
  id                 uuid primary key default gen_random_uuid(),
  level              smallint    not null check (level in (1, 2)),
  slug               text        not null unique,
  title              text        not null,
  description_md     text        not null default '',
  mode               text        not null check (mode in ('teleop', 'code')),
  target             jsonb       not null,
  tolerance          real        not null default 0.12 check (tolerance > 0 and tolerance <= 1),
  pass_threshold     real        not null default 100 check (pass_threshold between 0 and 100),
  max_sim_sec        int         not null default 120 check (max_sim_sec between 5 and 7200),
  idle_stop_sec      real        not null default 5,
  rules              jsonb       not null default '{"allow_teleport": true}'::jsonb,
  check_color        boolean     not null default false,
  starter_code       text        not null default '',
  hints              jsonb       not null default '[]'::jsonb,
  reference_solution text,                        -- admin only, never sent to teams
  order_index        int         not null default 0,
  is_published       boolean     not null default false,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create table if not exists submissions (
  id              uuid primary key default gen_random_uuid(),
  team_id         uuid        not null references teams(id) on delete cascade,
  task_id         uuid        not null references tasks(id) on delete cascade,
  kind            text        not null check (kind in ('code', 'teleop')),
  code            text,
  command_log     jsonb,
  status          text        not null default 'queued' check (status in ('queued', 'running', 'passed', 'failed', 'error')),
  score           real,
  recall_score    real,
  precision_score real,
  client_score    real,
  error           text,
  violation       text,
  diff            jsonb,
  logs            jsonb,
  trace_path      text,
  judge_version   text,
  sim_ticks       int,
  wall_hits       int,
  duration_ms     int,
  ip              inet,
  user_agent      text,
  created_at      timestamptz not null default now(),
  judged_at       timestamptz
);
create index if not exists submissions_team_task_idx on submissions (team_id, task_id, created_at desc);
create index if not exists submissions_status_idx    on submissions (status, created_at);

create table if not exists task_progress (
  team_id              uuid not null references teams(id) on delete cascade,
  task_id              uuid not null references tasks(id) on delete cascade,
  attempts             int  not null default 0,
  fails_before_pass    int  not null default 0,
  best_score           real not null default 0,
  passed_at            timestamptz,
  passed_submission_id uuid references submissions(id) on delete set null,
  primary key (team_id, task_id)
);

create table if not exists announcements (
  id         bigserial primary key,
  message    text not null check (length(message) <= 500),
  level      text not null default 'info' check (level in ('info', 'warn', 'success')),
  created_at timestamptz not null default now()
);

create table if not exists audit_log (
  id         bigserial primary key,
  actor      text not null check (actor in ('team', 'admin', 'system')),
  team_id    uuid references teams(id) on delete set null,
  action     text not null,
  meta       jsonb not null default '{}'::jsonb,
  ip         inet,
  user_agent text,
  created_at timestamptz not null default now()
);
create index if not exists audit_log_created_idx on audit_log (created_at desc);

-- Atomically store a judge verdict and update progress. Returns whether this was the team's FIRST pass.
create or replace function rvx_record_result(
  p_submission_id uuid, p_status text, p_score real, p_recall real, p_precision real,
  p_error text, p_violation text, p_diff jsonb, p_logs jsonb, p_judge_version text,
  p_sim_ticks int, p_wall_hits int, p_duration_ms int, p_trace_path text
) returns table (newly_passed boolean, out_team_id uuid, out_task_id uuid)
language plpgsql as $$
declare
  s          submissions%rowtype;
  was_passed boolean;
begin
  select * into s from submissions where id = p_submission_id for update;
  if not found then raise exception 'submission % not found', p_submission_id; end if;
  if s.status in ('passed', 'failed', 'error') then        -- idempotent: already recorded
    return query select false, s.team_id, s.task_id; return;
  end if;

  update submissions set
    status = p_status, score = p_score, recall_score = p_recall, precision_score = p_precision,
    error = p_error, violation = p_violation, diff = p_diff, logs = p_logs,
    judge_version = p_judge_version, sim_ticks = p_sim_ticks, wall_hits = p_wall_hits,
    duration_ms = p_duration_ms, trace_path = p_trace_path, judged_at = now()
  where id = p_submission_id;

  insert into task_progress (team_id, task_id) values (s.team_id, s.task_id) on conflict do nothing;
  select (tp.passed_at is not null) into was_passed
    from task_progress tp where tp.team_id = s.team_id and tp.task_id = s.task_id for update;

  update task_progress tp set
    attempts             = tp.attempts + 1,
    best_score           = greatest(tp.best_score, coalesce(p_score, 0)),
    fails_before_pass    = case when tp.passed_at is null and p_status <> 'passed' then tp.fails_before_pass + 1 else tp.fails_before_pass end,
    passed_at            = case when tp.passed_at is null and p_status = 'passed' then s.created_at else tp.passed_at end,
    passed_submission_id = case when tp.passed_at is null and p_status = 'passed' then s.id else tp.passed_submission_id end
  where tp.team_id = s.team_id and tp.task_id = s.task_id;

  return query select (not was_passed and p_status = 'passed'), s.team_id, s.task_id;
end $$;

-- Live ranking: most tasks passed, then least total time (+ fail penalty), then fewest attempts.
create or replace view leaderboard as
with es as (select coalesce(starts_at, now()) as starts_at, penalty_per_fail_sec from event_settings where id = 1),
agg as (
  select t.id as team_id, t.name as team_name, t.institution,
         count(p.passed_at)::int                                                     as tasks_passed,
         coalesce(sum(case when p.passed_at is not null
                   then extract(epoch from (p.passed_at - es.starts_at)) + p.fails_before_pass * es.penalty_per_fail_sec
              end), 0)::bigint                                                       as total_time_sec,
         coalesce(sum(p.attempts), 0)::int                                           as attempts,
         max(p.passed_at)                                                            as last_pass_at,
         max(case when tk.level = 1 then p.passed_at end)                            as l1_passed_at,
         max(case when tk.level = 2 then p.passed_at end)                            as l2_passed_at,
         max(p.best_score)                                                           as best_score
  from teams t
  cross join es
  left join task_progress p on p.team_id = t.id
  left join tasks tk on tk.id = p.task_id
  where t.is_active
  group by t.id, t.name, t.institution
)
select rank() over (order by tasks_passed desc, total_time_sec asc, attempts asc, last_pass_at asc nulls last) as rank, agg.*
from agg
order by rank, team_name;
