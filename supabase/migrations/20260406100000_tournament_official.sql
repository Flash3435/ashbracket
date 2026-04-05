-- Official tournament schedule + match state; results provenance for sync vs manual admin.

-- ---------------------------------------------------------------------------
-- Teams: FIFA 3-letter codes as canonical country_code (ENG, SCO, USA, …)
-- ---------------------------------------------------------------------------

-- View predictions_public selects teams.country_code; Postgres blocks ALTER TYPE until it is dropped.
DROP VIEW IF EXISTS public.predictions_public;

ALTER TABLE public.teams DROP CONSTRAINT IF EXISTS teams_country_code_unique;

-- Widen before 3-letter FIFA codes: initial schema uses char(2) (e.g. US); updates need varchar(3).
ALTER TABLE public.teams
  ALTER COLUMN country_code TYPE varchar(3) USING rtrim(country_code::text);

UPDATE public.teams SET country_code = 'USA' WHERE country_code = 'US';
UPDATE public.teams SET country_code = 'CAN' WHERE country_code = 'CA';
UPDATE public.teams SET country_code = 'MEX' WHERE country_code = 'MX';
UPDATE public.teams SET country_code = 'BRA' WHERE country_code = 'BR';
UPDATE public.teams SET country_code = 'ARG' WHERE country_code = 'AR';
UPDATE public.teams SET country_code = 'FRA' WHERE country_code = 'FR';
UPDATE public.teams SET country_code = 'GER' WHERE country_code = 'DE';
UPDATE public.teams SET country_code = 'ESP' WHERE country_code = 'ES';

UPDATE public.teams SET fifa_code = country_code WHERE fifa_code IS NULL OR fifa_code = '';

ALTER TABLE public.teams DROP CONSTRAINT IF EXISTS teams_country_code_upper;

ALTER TABLE public.teams
  ADD CONSTRAINT teams_country_code_upper CHECK (country_code = upper(country_code));

CREATE UNIQUE INDEX IF NOT EXISTS teams_country_code_unique ON public.teams (country_code);

CREATE UNIQUE INDEX IF NOT EXISTS teams_fifa_code_unique ON public.teams (fifa_code)
  WHERE fifa_code IS NOT NULL AND length(trim(fifa_code)) > 0;

-- Recreate (same definition as 20260405120000_public_predictions_ledger_views.sql).
CREATE OR REPLACE VIEW public.predictions_public
WITH (security_invoker = false)
AS
SELECT
  pr.id AS prediction_id,
  pr.participant_id,
  pr.pool_id,
  pr.prediction_kind,
  pr.group_code,
  pr.slot_key,
  pr.bonus_key,
  ts.code AS stage_code,
  ts.label AS stage_label,
  ts.sort_order AS stage_sort_order,
  t.name AS team_name,
  t.country_code AS team_country_code
FROM public.predictions pr
INNER JOIN public.participants par ON par.id = pr.participant_id
INNER JOIN public.pools pl ON pl.id = pr.pool_id AND pl.is_public IS TRUE
LEFT JOIN public.tournament_stages ts ON ts.id = pr.tournament_stage_id
LEFT JOIN public.teams t ON t.id = pr.team_id;

COMMENT ON VIEW public.predictions_public IS
  'Picks for participants in public pools only. Team/stage labels only; no admin fields.';

GRANT SELECT ON public.predictions_public TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- Tournament stages: first knockout round for 48-team format
-- ---------------------------------------------------------------------------

INSERT INTO public.tournament_stages (code, label, sort_order, starts_at, ends_at)
VALUES
  (
    'round_of_32',
    'Round of 32',
    15,
    '2026-06-27 00:00:00+00',
    '2026-06-28 23:59:59+00'
  )
ON CONFLICT (code) DO UPDATE SET
  label = EXCLUDED.label,
  sort_order = EXCLUDED.sort_order,
  starts_at = EXCLUDED.starts_at,
  ends_at = EXCLUDED.ends_at;

-- ---------------------------------------------------------------------------
-- Editions + matches
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.tournament_editions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  starts_on date,
  ends_on date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS tournament_editions_set_updated_at ON public.tournament_editions;
CREATE TRIGGER tournament_editions_set_updated_at
  BEFORE UPDATE ON public.tournament_editions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.tournament_matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  edition_id uuid NOT NULL REFERENCES public.tournament_editions (id) ON DELETE CASCADE,
  match_code text NOT NULL,
  stage_code text NOT NULL,
  group_code text,
  round_index int NOT NULL DEFAULT 0,
  kickoff_at timestamptz,
  status text NOT NULL DEFAULT 'scheduled'
    CHECK (
      status IN (
        'scheduled',
        'live',
        'finished',
        'postponed',
        'cancelled'
      )
    ),
  home_team_id uuid REFERENCES public.teams (id) ON DELETE RESTRICT,
  away_team_id uuid REFERENCES public.teams (id) ON DELETE RESTRICT,
  home_goals int CHECK (home_goals IS NULL OR home_goals >= 0),
  away_goals int CHECK (away_goals IS NULL OR away_goals >= 0),
  home_penalties int CHECK (home_penalties IS NULL OR home_penalties >= 0),
  away_penalties int CHECK (away_penalties IS NULL OR away_penalties >= 0),
  winner_team_id uuid REFERENCES public.teams (id) ON DELETE SET NULL,
  home_advance_from_match_id uuid REFERENCES public.tournament_matches (id) ON DELETE SET NULL,
  away_advance_from_match_id uuid REFERENCES public.tournament_matches (id) ON DELETE SET NULL,
  -- When set and the match is finished, sync maps winner into results using this slot.
  scoring_result_kind text CHECK (
    scoring_result_kind IS NULL
    OR scoring_result_kind IN (
      'group_winner',
      'group_runner_up',
      'quarterfinalist',
      'semifinalist',
      'finalist',
      'champion',
      'bonus_pick'
    )
  ),
  scoring_slot_key text,
  scoring_stage_code text,
  sync_locked boolean NOT NULL DEFAULT false,
  last_sync_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tournament_matches_edition_code_unique UNIQUE (edition_id, match_code),
  CONSTRAINT tournament_matches_group_code_upper CHECK (
    group_code IS NULL OR group_code = upper(group_code)
  )
);

CREATE INDEX IF NOT EXISTS idx_tournament_matches_edition ON public.tournament_matches (edition_id);
CREATE INDEX IF NOT EXISTS idx_tournament_matches_group ON public.tournament_matches (edition_id, group_code)
  WHERE group_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tournament_matches_stage ON public.tournament_matches (edition_id, stage_code);

DROP TRIGGER IF EXISTS tournament_matches_set_updated_at ON public.tournament_matches;
CREATE TRIGGER tournament_matches_set_updated_at
  BEFORE UPDATE ON public.tournament_matches
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.tournament_editions IS
  'One row per real tournament (e.g. FIFA World Cup 2026).';

COMMENT ON TABLE public.tournament_matches IS
  'Official schedule and scores; sync updates rows and can advance bracket via *_advance_from_match_id.';

COMMENT ON COLUMN public.tournament_matches.sync_locked IS
  'When true, automated sync must not change scores or status for this match.';

-- ---------------------------------------------------------------------------
-- Scoring results: manual vs automated sync
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'results'
      AND column_name = 'source'
  ) THEN
    ALTER TABLE public.results
      ADD COLUMN source text NOT NULL DEFAULT 'manual'
        CHECK (source IN ('manual', 'sync'));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'results'
      AND column_name = 'locked'
  ) THEN
    ALTER TABLE public.results
      ADD COLUMN locked boolean NOT NULL DEFAULT true;
  END IF;
END $$;

COMMENT ON COLUMN public.results.source IS
  'manual = admin UI or SQL; sync = derived from tournament_matches.';

COMMENT ON COLUMN public.results.locked IS
  'When true, automated sync must not replace this row (admin override).';

-- ---------------------------------------------------------------------------
-- RLS (admins only, same pattern as other domain tables)
-- ---------------------------------------------------------------------------

ALTER TABLE public.tournament_editions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tournament_matches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tournament_editions_admins_all ON public.tournament_editions;
CREATE POLICY tournament_editions_admins_all
  ON public.tournament_editions
  FOR ALL
  TO authenticated
  USING (public.ashbracket_is_admin())
  WITH CHECK (public.ashbracket_is_admin());

DROP POLICY IF EXISTS tournament_matches_admins_all ON public.tournament_matches;
CREATE POLICY tournament_matches_admins_all
  ON public.tournament_matches
  FOR ALL
  TO authenticated
  USING (public.ashbracket_is_admin())
  WITH CHECK (public.ashbracket_is_admin());
