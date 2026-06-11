-- Manual goal-scorer events for official tournament matches (admin entry only).
-- Scores remain authoritative on tournament_matches.home_goals / away_goals.

CREATE TABLE IF NOT EXISTS public.tournament_match_goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  edition_id uuid NOT NULL REFERENCES public.tournament_editions (id) ON DELETE CASCADE,
  match_id uuid NOT NULL REFERENCES public.tournament_matches (id) ON DELETE CASCADE,
  team_id uuid REFERENCES public.teams (id) ON DELETE SET NULL,
  player_name text NOT NULL,
  minute integer,
  stoppage_minute integer,
  is_own_goal boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tournament_match_goals_player_name_not_blank CHECK (
    length(btrim(player_name)) > 0
  ),
  CONSTRAINT tournament_match_goals_minute_range CHECK (
    minute IS NULL OR (minute >= 0 AND minute <= 130)
  ),
  CONSTRAINT tournament_match_goals_stoppage_minute_nonneg CHECK (
    stoppage_minute IS NULL OR stoppage_minute >= 0
  )
);

CREATE INDEX IF NOT EXISTS tournament_match_goals_edition_id_idx
  ON public.tournament_match_goals (edition_id);

CREATE INDEX IF NOT EXISTS tournament_match_goals_match_id_idx
  ON public.tournament_match_goals (match_id);

COMMENT ON TABLE public.tournament_match_goals IS
  'Admin-entered goal scorers per match. Does not drive match score or ledger recompute.';

DROP TRIGGER IF EXISTS tournament_match_goals_set_updated_at ON public.tournament_match_goals;
CREATE TRIGGER tournament_match_goals_set_updated_at
  BEFORE UPDATE ON public.tournament_match_goals
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.tournament_match_goals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tournament_match_goals_admins_all ON public.tournament_match_goals;
CREATE POLICY tournament_match_goals_admins_all
  ON public.tournament_match_goals
  FOR ALL
  TO authenticated
  USING (public.ashbracket_is_admin())
  WITH CHECK (public.ashbracket_is_admin());
