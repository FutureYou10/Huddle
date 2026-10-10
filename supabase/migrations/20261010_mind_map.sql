-- Mind: a map of everything taking up headspace (app/mind).
--
-- mind_areas  = the "atoms" on the map (Work, Money, Family...)
-- mind_items  = the thoughts orbiting them. Each moves through
--               tangled -> solved -> committed -> done, or is let go.
--               `control` is how much of it is actually yours to act on;
--               not_mine items are shown apart so they don't get problem-solved.
-- mind_imported_chats = Claude chats already untangled, so re-importing an
--               export only picks up new conversations.

create table public.mind_areas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  emoji text,
  created_at timestamptz not null default now()
);

create table public.mind_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  area_id uuid references public.mind_areas(id) on delete set null,
  title text not null,
  detail text,
  kind text not null default 'action' check (kind in ('action', 'decision', 'worry', 'idea')),
  control text not null default 'mine' check (control in ('mine', 'influence', 'not_mine')),
  stage text not null default 'tangled' check (stage in ('tangled', 'solved', 'committed', 'done', 'let_go')),
  load smallint not null default 2 check (load between 1 and 3),
  loop_count integer not null default 1,
  decision text,
  influence_note text,
  steps jsonb not null default '[]'::jsonb,
  source text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  closed_at timestamptz
);

create index mind_items_user_stage on public.mind_items (user_id, stage);

create table public.mind_imported_chats (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  chat_uuid text not null,
  title text,
  imported_at timestamptz not null default now(),
  primary key (user_id, chat_uuid)
);

alter table public.mind_areas enable row level security;
alter table public.mind_items enable row level security;
alter table public.mind_imported_chats enable row level security;

create policy "Users manage own mind areas" on public.mind_areas
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users manage own mind items" on public.mind_items
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users manage own imported chats" on public.mind_imported_chats
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
