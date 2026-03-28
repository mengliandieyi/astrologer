-- MVP schema for: chart + report + evidence + AB + analytics
-- PostgreSQL 14+

create extension if not exists pgcrypto;

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  anon_id text unique,
  created_at timestamptz not null default now()
);

create table if not exists birth_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete set null,
  birth_date date not null,
  birth_time time not null,
  timezone text not null default 'Asia/Shanghai',
  location text not null,
  gender text,
  idem_key text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists charts (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references birth_profiles(id) on delete cascade,
  pillars_json jsonb not null,
  elements_json jsonb not null,
  calc_version text not null default 'v1',
  created_at timestamptz not null default now()
);

create table if not exists reports (
  id uuid primary key default gen_random_uuid(),
  chart_id uuid not null references charts(id) on delete cascade,
  type text not null check (type in ('basic', 'pro')),
  content_json jsonb not null,
  evidence_json jsonb,
  confidence_score int check (confidence_score between 0 and 100),
  ab_group text not null default 'A' check (ab_group in ('A', 'B')),
  version text not null default 'v1',
  created_at timestamptz not null default now()
);

create table if not exists share_cards (
  id uuid primary key default gen_random_uuid(),
  chart_id uuid not null references charts(id) on delete cascade,
  template_id text not null,
  image_url text not null,
  share_url text not null,
  created_at timestamptz not null default now()
);

create table if not exists events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete set null,
  anon_id text,
  session_id text not null,
  event_name text not null,
  report_id uuid references reports(id) on delete set null,
  chart_id uuid references charts(id) on delete set null,
  ab_group text check (ab_group in ('A', 'B')),
  props_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_reports_chart on reports(chart_id);
create index if not exists idx_reports_group on reports(ab_group);
create index if not exists idx_events_name_time on events(event_name, created_at);
create index if not exists idx_events_report on events(report_id);

-- Daily dashboard view for the 3 north-star metrics.
create or replace view v_daily_metrics as
with base as (
  select date_trunc('day', created_at) as d, coalesce(ab_group, 'A') as g, anon_id
  from events
  where event_name = 'report_view'
  group by 1,2,3
),
pro_click as (
  select date_trunc('day', created_at) as d, coalesce(ab_group, 'A') as g, anon_id
  from events
  where event_name = 'pro_click'
  group by 1,2,3
),
share_success as (
  select date_trunc('day', created_at) as d, coalesce(ab_group, 'A') as g, anon_id
  from events
  where event_name = 'share_success'
  group by 1,2,3
),
d1_return as (
  select date_trunc('day', created_at) as d, coalesce(ab_group, 'A') as g, anon_id
  from events
  where event_name = 'return_visit_d1'
  group by 1,2,3
)
select
  b.d::date as metric_date,
  b.g as ab_group,
  count(distinct b.anon_id) as report_view_uv,
  count(distinct p.anon_id) as pro_click_uv,
  count(distinct s.anon_id) as share_success_uv,
  count(distinct r.anon_id) as return_d1_uv,
  round(count(distinct p.anon_id)::numeric / nullif(count(distinct b.anon_id), 0), 4) as pro_click_rate,
  round(count(distinct s.anon_id)::numeric / nullif(count(distinct b.anon_id), 0), 4) as share_rate,
  round(count(distinct r.anon_id)::numeric / nullif(count(distinct b.anon_id), 0), 4) as d1_return_rate
from base b
left join pro_click p on p.d = b.d and p.g = b.g and p.anon_id = b.anon_id
left join share_success s on s.d = b.d and s.g = b.g and s.anon_id = b.anon_id
left join d1_return r on r.d = b.d and r.g = b.g and r.anon_id = b.anon_id
group by 1,2;
