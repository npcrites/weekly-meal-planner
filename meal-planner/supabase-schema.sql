-- Run this in Supabase SQL editor
-- Creates a single table for shared household state

create table if not exists pantry_state (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz default now()
);

-- Enable Row Level Security (keep it open for household use)
alter table pantry_state enable row level security;

create policy "allow all" on pantry_state
  for all using (true) with check (true);

-- Insert initial empty state
insert into pantry_state (id, data)
values ('household', '{}')
on conflict (id) do nothing;
