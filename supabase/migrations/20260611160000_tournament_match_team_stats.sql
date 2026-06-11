-- Per-match team card totals for bonus scoring (admin manual entry).
-- Final goals remain authoritative on tournament_matches.home_goals / away_goals.

CREATE TABLE IF NOT EXISTS public.tournament_match_team_stats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  edition_id uuid NOT NULL REFERENCES public.tournament_editions (id) ON DELETE CASCADE,
  match_id uuid NOT NULL REFERENCES public.tournament_matches (id) ON DELETE CASCADE,
  team_id uuid NOT NULL REFERENCES public.teams (id) ON DELETE CASCADE,
  yellow_cards integer,
  red_cards integer,
  source text NOT NULL DEFAULT 'manual',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tournament_match_team_stats_unique UNIQUE (match_id, team_id, source),
  CONSTRAINT tournament_match_team_stats_yellow_nonneg CHECK (
    yellow_cards IS NULL OR yellow_cards >= 0
  ),
  CONSTRAINT tournament_match_team_stats_red_nonneg CHECK (
    red_cards IS NULL OR red_cards >= 0
  )
);

CREATE INDEX IF NOT EXISTS tournament_match_team_stats_edition_id_idx
  ON public.tournament_match_team_stats (edition_id);

CREATE INDEX IF NOT EXISTS tournament_match_team_stats_match_id_idx
  ON public.tournament_match_team_stats (match_id);

COMMENT ON TABLE public.tournament_match_team_stats IS
  'Admin-entered yellow/red card totals per team per match. Tournament goal totals derive from tournament_matches scores.';

DROP TRIGGER IF EXISTS tournament_match_team_stats_set_updated_at ON public.tournament_match_team_stats;
CREATE TRIGGER tournament_match_team_stats_set_updated_at
  BEFORE UPDATE ON public.tournament_match_team_stats
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.tournament_match_team_stats ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tournament_match_team_stats_admins_all ON public.tournament_match_team_stats;
CREATE POLICY tournament_match_team_stats_admins_all
  ON public.tournament_match_team_stats
  FOR ALL
  TO authenticated
  USING (public.ashbracket_is_admin())
  WITH CHECK (public.ashbracket_is_admin());
