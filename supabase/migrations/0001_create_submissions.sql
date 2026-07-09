-- Solux — lighting study requests
-- Run this once in the Supabase dashboard: SQL Editor → New query → paste → Run.

create table if not exists public.submissions (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),
  project_name text,
  client_name  text,
  locality     text,
  country      text,
  sales_name   text,
  deadline     date,
  status       text not null default 'new',
  form         jsonb not null
);

-- Row Level Security: lock the table down, then open exactly what we need.
alter table public.submissions enable row level security;

-- No authentication yet: allow anyone using the public anon key to CREATE a
-- request. Reading/updating stays blocked until we add login (a later step).
drop policy if exists "Public can insert submissions" on public.submissions;
create policy "Public can insert submissions"
  on public.submissions
  for insert
  to anon, authenticated
  with check (true);
