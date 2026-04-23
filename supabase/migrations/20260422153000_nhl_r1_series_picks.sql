-- Round 1 NHL series-winner picks (user + active edition); isolated from World Cup predictions.

-- ---------------------------------------------------------------------------
-- Public read access to *active* playoff field (bracket pages use anon session)
-- ---------------------------------------------------------------------------

CREATE POLICY nhl_editions_select_public_active
  ON public.nhl_editions
  FOR SELECT
  TO anon, authenticated
  USING (is_active = true);

CREATE POLICY nhl_teams_select_public_active_edition
  ON public.nhl_teams
  FOR SELECT
  TO anon, authenticated
  USING (
    edition_id IN (SELECT e.id FROM public.nhl_editions e WHERE e.is_active = true)
  );

CREATE POLICY nhl_series_select_public_active_edition
  ON public.nhl_series
  FOR SELECT
  TO anon, authenticated
  USING (
    edition_id IN (SELECT e.id FROM public.nhl_editions e WHERE e.is_active = true)
  );

-- ---------------------------------------------------------------------------
-- Picks table
-- ---------------------------------------------------------------------------

CREATE TABLE public.nhl_r1_series_picks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  edition_id uuid NOT NULL REFERENCES public.nhl_editions (id) ON DELETE CASCADE,
  series_id uuid NOT NULL REFERENCES public.nhl_series (id) ON DELETE CASCADE,
  picked_team_id uuid NOT NULL REFERENCES public.nhl_teams (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT nhl_r1_series_picks_user_edition_series_unique UNIQUE (user_id, edition_id, series_id)
);

CREATE INDEX idx_nhl_r1_series_picks_edition_user
  ON public.nhl_r1_series_picks (edition_id, user_id);

CREATE TRIGGER nhl_r1_series_picks_set_updated_at
  BEFORE UPDATE ON public.nhl_r1_series_picks
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.nhl_r1_series_picks IS
  'Round 1 predicted series winner per auth user and edition; one row per series.';

-- ---------------------------------------------------------------------------
-- Rules (defense in depth: server action also validates)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.enforce_nhl_r1_series_pick_row()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_series public.nhl_series%ROWTYPE;
  v_lock timestamptz;
  v_active boolean;
BEGIN
  SELECT * INTO v_series FROM public.nhl_series WHERE id = NEW.series_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'series not found';
  END IF;

  IF v_series.edition_id IS DISTINCT FROM NEW.edition_id THEN
    RAISE EXCEPTION 'edition does not match series';
  END IF;

  IF v_series.round_code IS DISTINCT FROM 'R1' THEN
    RAISE EXCEPTION 'only round 1 series picks are allowed';
  END IF;

  SELECT is_active, lock_at INTO v_active, v_lock
  FROM public.nhl_editions
  WHERE id = NEW.edition_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'edition not found';
  END IF;

  IF NOT v_active THEN
    RAISE EXCEPTION 'edition is not active';
  END IF;

  IF v_lock IS NOT NULL AND v_lock <= now() THEN
    RAISE EXCEPTION 'picks are locked for this edition';
  END IF;

  IF v_series.higher_seed_team_id IS NULL OR v_series.lower_seed_team_id IS NULL THEN
    RAISE EXCEPTION 'series opponent slots are not both set';
  END IF;

  IF NEW.picked_team_id NOT IN (v_series.higher_seed_team_id, v_series.lower_seed_team_id) THEN
    RAISE EXCEPTION 'picked team is not a participant in this series';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.nhl_teams t
    WHERE t.id = NEW.picked_team_id
      AND t.edition_id = NEW.edition_id
  ) THEN
    RAISE EXCEPTION 'picked team is not in this edition';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER nhl_r1_series_picks_enforce_rules
  BEFORE INSERT OR UPDATE ON public.nhl_r1_series_picks
  FOR EACH ROW EXECUTE FUNCTION public.enforce_nhl_r1_series_pick_row();

-- ---------------------------------------------------------------------------
-- RLS: own rows only
-- ---------------------------------------------------------------------------

ALTER TABLE public.nhl_r1_series_picks ENABLE ROW LEVEL SECURITY;

CREATE POLICY nhl_r1_series_picks_select_own
  ON public.nhl_r1_series_picks
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY nhl_r1_series_picks_insert_own
  ON public.nhl_r1_series_picks
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY nhl_r1_series_picks_update_own
  ON public.nhl_r1_series_picks
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY nhl_r1_series_picks_delete_own
  ON public.nhl_r1_series_picks
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());
