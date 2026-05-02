-- 004_add_object_media.sql
--
-- Saved objects gain a structured `media` jsonb column that holds the
-- decomposed contents of the captured element: links, images, videos,
-- text segments, and tabular data extracted from the live DOM at save
-- time. This lets the dashboard render a faithful, queryable view of
-- the saved item even when the HTML snapshot would be too lossy.
--
-- The existing `screenshot_url` column is reused: the extension now
-- stores a Vercel Blob pathname (e.g. "screenshots/<uuid>.png") in it
-- and the dashboard streams it through an authenticated route.

alter table public.objects
  add column if not exists media jsonb not null default '{}'::jsonb;

-- A small index lets us search for objects whose media has any links/
-- images later without scanning the whole jsonb tree.
create index if not exists objects_media_kind_idx
  on public.objects ((media->>'__schema'));
