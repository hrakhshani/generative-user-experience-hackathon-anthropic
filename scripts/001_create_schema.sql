-- Universal Web Action Layer schema
-- Tables: objects, annotations, tracked_objects, tracking_snapshots,
-- comparisons, workspace_tokens. All scoped by user_id with RLS.

-- 1) Saved objects extracted from web pages.
create table if not exists public.objects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  url text not null,
  domain text not null,
  title text,
  text text,
  attributes jsonb not null default '{}'::jsonb,
  dom_path text,
  semantic_type text,
  screenshot_url text,
  summary text,
  tags text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists objects_user_idx on public.objects(user_id, created_at desc);
create index if not exists objects_domain_idx on public.objects(user_id, domain);
create index if not exists objects_semantic_type_idx on public.objects(user_id, semantic_type);

alter table public.objects enable row level security;

drop policy if exists "objects_select_own" on public.objects;
drop policy if exists "objects_insert_own" on public.objects;
drop policy if exists "objects_update_own" on public.objects;
drop policy if exists "objects_delete_own" on public.objects;

create policy "objects_select_own" on public.objects for select using (auth.uid() = user_id);
create policy "objects_insert_own" on public.objects for insert with check (auth.uid() = user_id);
create policy "objects_update_own" on public.objects for update using (auth.uid() = user_id);
create policy "objects_delete_own" on public.objects for delete using (auth.uid() = user_id);

-- 2) Annotations / notes attached to an object (or a field within it).
create table if not exists public.annotations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  object_id uuid not null references public.objects(id) on delete cascade,
  field text,
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists annotations_object_idx on public.annotations(object_id, created_at desc);

alter table public.annotations enable row level security;

drop policy if exists "annotations_select_own" on public.annotations;
drop policy if exists "annotations_insert_own" on public.annotations;
drop policy if exists "annotations_update_own" on public.annotations;
drop policy if exists "annotations_delete_own" on public.annotations;

create policy "annotations_select_own" on public.annotations for select using (auth.uid() = user_id);
create policy "annotations_insert_own" on public.annotations for insert with check (auth.uid() = user_id);
create policy "annotations_update_own" on public.annotations for update using (auth.uid() = user_id);
create policy "annotations_delete_own" on public.annotations for delete using (auth.uid() = user_id);

-- 3) Tracked objects: monitor specific fields for changes over time.
create table if not exists public.tracked_objects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  object_id uuid not null references public.objects(id) on delete cascade,
  fields text[] not null default '{}',
  interval_minutes integer not null default 1440,
  last_checked_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, object_id)
);

alter table public.tracked_objects enable row level security;

drop policy if exists "tracked_select_own" on public.tracked_objects;
drop policy if exists "tracked_insert_own" on public.tracked_objects;
drop policy if exists "tracked_update_own" on public.tracked_objects;
drop policy if exists "tracked_delete_own" on public.tracked_objects;

create policy "tracked_select_own" on public.tracked_objects for select using (auth.uid() = user_id);
create policy "tracked_insert_own" on public.tracked_objects for insert with check (auth.uid() = user_id);
create policy "tracked_update_own" on public.tracked_objects for update using (auth.uid() = user_id);
create policy "tracked_delete_own" on public.tracked_objects for delete using (auth.uid() = user_id);

-- 4) Snapshots of tracked objects at a point in time.
create table if not exists public.tracking_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  tracked_id uuid not null references public.tracked_objects(id) on delete cascade,
  payload jsonb not null default '{}'::jsonb,
  captured_at timestamptz not null default now()
);

create index if not exists snapshots_tracked_idx on public.tracking_snapshots(tracked_id, captured_at desc);

alter table public.tracking_snapshots enable row level security;

drop policy if exists "snapshots_select_own" on public.tracking_snapshots;
drop policy if exists "snapshots_insert_own" on public.tracking_snapshots;
drop policy if exists "snapshots_delete_own" on public.tracking_snapshots;

create policy "snapshots_select_own" on public.tracking_snapshots for select using (auth.uid() = user_id);
create policy "snapshots_insert_own" on public.tracking_snapshots for insert with check (auth.uid() = user_id);
create policy "snapshots_delete_own" on public.tracking_snapshots for delete using (auth.uid() = user_id);

-- 5) Saved comparisons (groups of objects).
create table if not exists public.comparisons (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  object_ids uuid[] not null default '{}',
  created_at timestamptz not null default now()
);

alter table public.comparisons enable row level security;

drop policy if exists "comparisons_select_own" on public.comparisons;
drop policy if exists "comparisons_insert_own" on public.comparisons;
drop policy if exists "comparisons_update_own" on public.comparisons;
drop policy if exists "comparisons_delete_own" on public.comparisons;

create policy "comparisons_select_own" on public.comparisons for select using (auth.uid() = user_id);
create policy "comparisons_insert_own" on public.comparisons for insert with check (auth.uid() = user_id);
create policy "comparisons_update_own" on public.comparisons for update using (auth.uid() = user_id);
create policy "comparisons_delete_own" on public.comparisons for delete using (auth.uid() = user_id);

-- 6) Workspace tokens used by the Chrome extension to authenticate
-- without a Supabase session. The extension sends:
--   Authorization: Bearer <token>
-- and the API resolves user_id from this table via the service role.
create table if not exists public.workspace_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null default 'Chrome Extension',
  token uuid not null default gen_random_uuid(),
  last_used_at timestamptz,
  revoked boolean not null default false,
  created_at timestamptz not null default now(),
  unique (token)
);

create index if not exists workspace_tokens_user_idx on public.workspace_tokens(user_id);

alter table public.workspace_tokens enable row level security;

drop policy if exists "tokens_select_own" on public.workspace_tokens;
drop policy if exists "tokens_insert_own" on public.workspace_tokens;
drop policy if exists "tokens_update_own" on public.workspace_tokens;
drop policy if exists "tokens_delete_own" on public.workspace_tokens;

create policy "tokens_select_own" on public.workspace_tokens for select using (auth.uid() = user_id);
create policy "tokens_insert_own" on public.workspace_tokens for insert with check (auth.uid() = user_id);
create policy "tokens_update_own" on public.workspace_tokens for update using (auth.uid() = user_id);
create policy "tokens_delete_own" on public.workspace_tokens for delete using (auth.uid() = user_id);

-- 7) updated_at trigger for objects.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists objects_set_updated_at on public.objects;
create trigger objects_set_updated_at
  before update on public.objects
  for each row
  execute function public.set_updated_at();
