-- AshBracket 2026 sample pool: June 10, 2026 11:59 p.m. Eastern Time (EDT / UTC-4).
-- Stored as 2026-06-11 03:59:00+00 — evening before the opening match.
UPDATE public.pools
SET lock_at = '2026-06-11 03:59:00+00'::timestamptz,
    updated_at = now()
WHERE id = 'a0000001-0000-4000-8000-000000000001';
