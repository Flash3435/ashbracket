-- Allow provider-imported card totals alongside manual admin entries.
ALTER TABLE public.tournament_match_team_stats
  DROP CONSTRAINT IF EXISTS tournament_match_team_stats_source_check;

ALTER TABLE public.tournament_match_team_stats
  ADD CONSTRAINT tournament_match_team_stats_source_check
  CHECK (source IN ('manual', 'provider'));

COMMENT ON COLUMN public.tournament_match_team_stats.source IS
  'manual = admin-entered totals; provider = imported from live score provider fixture events.';
