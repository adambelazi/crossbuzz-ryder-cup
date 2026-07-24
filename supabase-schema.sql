-- Crossbuzz Ryder Cup — Supabase setup
-- Run this ONCE: Supabase dashboard -> SQL Editor -> New query -> paste all of this -> Run

-- The whole event lives in one row of JSON, protected by a version number
-- so simultaneous score entries from different phones can't wipe each other out.
create table if not exists public.event_state (
  id integer primary key,
  data jsonb not null,
  version bigint not null default 1
);

-- Row Level Security: on, with open read/write for the app.
-- NOTE: this means anyone with your app's URL can read and write the event data.
-- The player/admin PINs inside the app are a politeness gate, not real security.
-- That's an acceptable trade-off for a friendly trip; don't reuse this pattern
-- for anything sensitive.
alter table public.event_state enable row level security;

drop policy if exists "public read" on public.event_state;
create policy "public read" on public.event_state
  for select using (true);

drop policy if exists "public insert" on public.event_state;
create policy "public insert" on public.event_state
  for insert with check (true);

drop policy if exists "public update" on public.event_state;
create policy "public update" on public.event_state
  for update using (true) with check (true);

-- Turn on realtime so every phone updates instantly when anyone posts a score
alter publication supabase_realtime add table public.event_state;
