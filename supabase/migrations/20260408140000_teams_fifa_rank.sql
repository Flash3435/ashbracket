-- Stored FIFA men's world ranking snapshot per team (updated via seed script, not on page load).

ALTER TABLE public.teams
  ADD COLUMN IF NOT EXISTS fifa_rank integer,
  ADD COLUMN IF NOT EXISTS fifa_rank_as_of date;

COMMENT ON COLUMN public.teams.fifa_rank IS 'Men''s FIFA/Coca-Cola world ranking position at snapshot date (lower is stronger).';
COMMENT ON COLUMN public.teams.fifa_rank_as_of IS 'Date the fifa_rank snapshot was taken.';
