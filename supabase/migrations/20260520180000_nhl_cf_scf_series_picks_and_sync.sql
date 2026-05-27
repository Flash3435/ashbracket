-- Conference Finals + Stanley Cup Final series-winner picks (NHL-only).
-- Mirrors Round 2 pick tables; keeps CF (round 3) and SCF (round 4) separate for scoring.

-- ---------------------------------------------------------------------------
-- Conference Finals picks (Round 3 / CF)
-- ---------------------------------------------------------------------------

CREATE TABLE public.nhl_cf_series_picks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  edition_id uuid NOT NULL REFERENCES public.nhl_editions (id) ON DELETE CASCADE,
  series_id uuid NOT NULL REFERENCES public.nhl_series (id) ON DELETE CASCADE,
  picked_team_id uuid NOT NULL REFERENCES public.nhl_teams (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT nhl_cf_series_picks_user_edition_series_unique UNIQUE (user_id, edition_id, series_id)
);

CREATE INDEX idx_nhl_cf_series_picks_edition_user
  ON public.nhl_cf_series_picks (edition_id, user_id);

CREATE TRIGGER nhl_cf_series_picks_set_updated_at
  BEFORE UPDATE ON public.nhl_cf_series_picks
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.nhl_cf_series_picks IS
  'Conference Finals predicted series winner per auth user and edition; one row per CF series.';

CREATE OR REPLACE FUNCTION public.enforce_nhl_cf_series_pick_row()
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

  IF v_series.round_code IS DISTINCT FROM 'CF' THEN
    RAISE EXCEPTION 'only conference finals series picks are allowed';
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

CREATE TRIGGER nhl_cf_series_picks_enforce_rules
  BEFORE INSERT OR UPDATE ON public.nhl_cf_series_picks
  FOR EACH ROW EXECUTE FUNCTION public.enforce_nhl_cf_series_pick_row();

ALTER TABLE public.nhl_cf_series_picks ENABLE ROW LEVEL SECURITY;

CREATE POLICY nhl_cf_series_picks_select_own
  ON public.nhl_cf_series_picks
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY nhl_cf_series_picks_insert_own
  ON public.nhl_cf_series_picks
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY nhl_cf_series_picks_update_own
  ON public.nhl_cf_series_picks
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY nhl_cf_series_picks_delete_own
  ON public.nhl_cf_series_picks
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Stanley Cup Final picks (Round 4 / SCF)
-- ---------------------------------------------------------------------------

CREATE TABLE public.nhl_scf_series_picks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  edition_id uuid NOT NULL REFERENCES public.nhl_editions (id) ON DELETE CASCADE,
  series_id uuid NOT NULL REFERENCES public.nhl_series (id) ON DELETE CASCADE,
  picked_team_id uuid NOT NULL REFERENCES public.nhl_teams (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT nhl_scf_series_picks_user_edition_series_unique UNIQUE (user_id, edition_id, series_id)
);

CREATE INDEX idx_nhl_scf_series_picks_edition_user
  ON public.nhl_scf_series_picks (edition_id, user_id);

CREATE TRIGGER nhl_scf_series_picks_set_updated_at
  BEFORE UPDATE ON public.nhl_scf_series_picks
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.nhl_scf_series_picks IS
  'Stanley Cup Final predicted series winner per auth user and edition; one row per SCF series.';

CREATE OR REPLACE FUNCTION public.enforce_nhl_scf_series_pick_row()
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

  IF v_series.round_code IS DISTINCT FROM 'SCF' THEN
    RAISE EXCEPTION 'only stanley cup final series picks are allowed';
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

CREATE TRIGGER nhl_scf_series_picks_enforce_rules
  BEFORE INSERT OR UPDATE ON public.nhl_scf_series_picks
  FOR EACH ROW EXECUTE FUNCTION public.enforce_nhl_scf_series_pick_row();

ALTER TABLE public.nhl_scf_series_picks ENABLE ROW LEVEL SECURITY;

CREATE POLICY nhl_scf_series_picks_select_own
  ON public.nhl_scf_series_picks
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY nhl_scf_series_picks_insert_own
  ON public.nhl_scf_series_picks
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY nhl_scf_series_picks_update_own
  ON public.nhl_scf_series_picks
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY nhl_scf_series_picks_delete_own
  ON public.nhl_scf_series_picks
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Populate CF higher/lower from completed Round 2 winners (per conference).
-- CF slot 1 = winners of R2 slots 1 and 2 in the same conference.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.sync_nhl_cf_slots_from_r2(p_edition_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_side text;
  v_w1 uuid;
  v_w2 uuid;
  v_hi uuid;
  v_lo uuid;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.nhl_editions e
    WHERE e.id = p_edition_id
      AND e.is_active = true
  ) THEN
    RETURN;
  END IF;

  FOREACH v_side IN ARRAY ARRAY['east', 'west']::text[]
  LOOP
    SELECT s1.winner_team_id, s2.winner_team_id
    INTO v_w1, v_w2
    FROM public.nhl_series s1
    JOIN public.nhl_series s2
      ON s2.edition_id = s1.edition_id
      AND s2.round_code = 'R2'
      AND s2.side_or_conference = s1.side_or_conference
      AND s2.slot_index = 2
    WHERE s1.edition_id = p_edition_id
      AND s1.round_code = 'R2'
      AND s1.side_or_conference = v_side
      AND s1.slot_index = 1;

    IF v_w1 IS NULL OR v_w2 IS NULL THEN
      UPDATE public.nhl_series cf
      SET
        higher_seed_team_id = NULL,
        lower_seed_team_id = NULL
      WHERE cf.edition_id = p_edition_id
        AND cf.round_code = 'CF'
        AND cf.side_or_conference = v_side
        AND cf.slot_index = 1;
      CONTINUE;
    END IF;

    SELECT t.id
    INTO v_hi
    FROM public.nhl_teams t
    WHERE t.edition_id = p_edition_id
      AND t.id IN (v_w1, v_w2)
    ORDER BY COALESCE(t.seed, 999) ASC, t.id ASC
    LIMIT 1;

    SELECT t.id
    INTO v_lo
    FROM public.nhl_teams t
    WHERE t.edition_id = p_edition_id
      AND t.id IN (v_w1, v_w2)
      AND t.id IS DISTINCT FROM v_hi
    ORDER BY COALESCE(t.seed, 999) DESC, t.id ASC
    LIMIT 1;

    IF v_hi IS NULL OR v_lo IS NULL THEN
      UPDATE public.nhl_series cf
      SET
        higher_seed_team_id = NULL,
        lower_seed_team_id = NULL
      WHERE cf.edition_id = p_edition_id
        AND cf.round_code = 'CF'
        AND cf.side_or_conference = v_side
        AND cf.slot_index = 1;
      CONTINUE;
    END IF;

    UPDATE public.nhl_series cf
    SET
      higher_seed_team_id = v_hi,
      lower_seed_team_id = v_lo
    WHERE cf.edition_id = p_edition_id
      AND cf.round_code = 'CF'
      AND cf.side_or_conference = v_side
      AND cf.slot_index = 1;
  END LOOP;
END;
$$;

COMMENT ON FUNCTION public.sync_nhl_cf_slots_from_r2(uuid) IS
  'Fills Conference Finals series higher/lower team FKs from Round 2 winner_team_id values (active edition only). Idempotent.';

REVOKE ALL ON FUNCTION public.sync_nhl_cf_slots_from_r2(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sync_nhl_cf_slots_from_r2(uuid) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- Populate SCF higher/lower from completed Conference Finals winners.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.sync_nhl_scf_slots_from_cf(p_edition_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_east uuid;
  v_west uuid;
  v_hi uuid;
  v_lo uuid;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.nhl_editions e
    WHERE e.id = p_edition_id
      AND e.is_active = true
  ) THEN
    RETURN;
  END IF;

  SELECT winner_team_id
  INTO v_east
  FROM public.nhl_series
  WHERE edition_id = p_edition_id
    AND round_code = 'CF'
    AND side_or_conference = 'east'
    AND slot_index = 1;

  SELECT winner_team_id
  INTO v_west
  FROM public.nhl_series
  WHERE edition_id = p_edition_id
    AND round_code = 'CF'
    AND side_or_conference = 'west'
    AND slot_index = 1;

  IF v_east IS NULL OR v_west IS NULL THEN
    UPDATE public.nhl_series scf
    SET
      higher_seed_team_id = NULL,
      lower_seed_team_id = NULL
    WHERE scf.edition_id = p_edition_id
      AND scf.round_code = 'SCF'
      AND scf.side_or_conference = 'cup'
      AND scf.slot_index = 1;
    RETURN;
  END IF;

  SELECT t.id
  INTO v_hi
  FROM public.nhl_teams t
  WHERE t.edition_id = p_edition_id
    AND t.id IN (v_east, v_west)
  ORDER BY COALESCE(t.seed, 999) ASC, t.id ASC
  LIMIT 1;

  SELECT t.id
  INTO v_lo
  FROM public.nhl_teams t
  WHERE t.edition_id = p_edition_id
    AND t.id IN (v_east, v_west)
    AND t.id IS DISTINCT FROM v_hi
  ORDER BY COALESCE(t.seed, 999) DESC, t.id ASC
  LIMIT 1;

  IF v_hi IS NULL OR v_lo IS NULL THEN
    UPDATE public.nhl_series scf
    SET
      higher_seed_team_id = NULL,
      lower_seed_team_id = NULL
    WHERE scf.edition_id = p_edition_id
      AND scf.round_code = 'SCF'
      AND scf.side_or_conference = 'cup'
      AND scf.slot_index = 1;
    RETURN;
  END IF;

  UPDATE public.nhl_series scf
  SET
    higher_seed_team_id = v_hi,
    lower_seed_team_id = v_lo
  WHERE scf.edition_id = p_edition_id
    AND scf.round_code = 'SCF'
    AND scf.side_or_conference = 'cup'
    AND scf.slot_index = 1;
END;
$$;

COMMENT ON FUNCTION public.sync_nhl_scf_slots_from_cf(uuid) IS
  'Fills Stanley Cup Final series higher/lower team FKs from Conference Finals winner_team_id values (active edition only). Idempotent.';

REVOKE ALL ON FUNCTION public.sync_nhl_scf_slots_from_cf(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sync_nhl_scf_slots_from_cf(uuid) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- RLS: read series/teams for editions where user has CF/SCF picks
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS nhl_series_select_own_pick_editions ON public.nhl_series;
CREATE POLICY nhl_series_select_own_pick_editions
  ON public.nhl_series
  FOR SELECT
  TO authenticated
  USING (
    edition_id IN (
      SELECT p.edition_id FROM public.nhl_r1_series_picks p WHERE p.user_id = auth.uid()
      UNION
      SELECT p.edition_id FROM public.nhl_r2_series_picks p WHERE p.user_id = auth.uid()
      UNION
      SELECT p.edition_id FROM public.nhl_cf_series_picks p WHERE p.user_id = auth.uid()
      UNION
      SELECT p.edition_id FROM public.nhl_scf_series_picks p WHERE p.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS nhl_teams_select_own_pick_editions ON public.nhl_teams;
CREATE POLICY nhl_teams_select_own_pick_editions
  ON public.nhl_teams
  FOR SELECT
  TO authenticated
  USING (
    edition_id IN (
      SELECT p.edition_id FROM public.nhl_r1_series_picks p WHERE p.user_id = auth.uid()
      UNION
      SELECT p.edition_id FROM public.nhl_r2_series_picks p WHERE p.user_id = auth.uid()
      UNION
      SELECT p.edition_id FROM public.nhl_cf_series_picks p WHERE p.user_id = auth.uid()
      UNION
      SELECT p.edition_id FROM public.nhl_scf_series_picks p WHERE p.user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- Standings + public entry picks: include CF and SCF pick tables
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.fetch_nhl_edition_standings(uuid);

CREATE OR REPLACE FUNCTION public.fetch_nhl_edition_standings(p_edition_id uuid)
RETURNS TABLE (
  rank bigint,
  round2_plus_rank bigint,
  user_id uuid,
  entry_name text,
  total_points integer,
  round1_points integer,
  round2_points integer,
  conference_final_points integer,
  stanley_cup_final_points integer,
  bonus_points integer,
  round2_plus_points integer,
  correct_picks integer,
  correct_picks_post_round1 integer,
  pending_decisions integer,
  pick_count integer,
  status text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.nhl_editions e
    WHERE e.id = p_edition_id
      AND e.is_active = true
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH entrants AS (
    SELECT m.user_id
    FROM public.nhl_memberships m
    WHERE m.edition_id = p_edition_id
    UNION
    SELECT DISTINCT p.user_id
    FROM public.nhl_r1_series_picks p
    WHERE p.edition_id = p_edition_id
    UNION
    SELECT DISTINCT p.user_id
    FROM public.nhl_r2_series_picks p
    WHERE p.edition_id = p_edition_id
    UNION
    SELECT DISTINCT p.user_id
    FROM public.nhl_cf_series_picks p
    WHERE p.edition_id = p_edition_id
    UNION
    SELECT DISTINCT p.user_id
    FROM public.nhl_scf_series_picks p
    WHERE p.edition_id = p_edition_id
  ),
  all_picks AS (
    SELECT p.user_id, p.edition_id, p.series_id, p.picked_team_id
    FROM public.nhl_r1_series_picks p
    WHERE p.edition_id = p_edition_id
    UNION ALL
    SELECT p.user_id, p.edition_id, p.series_id, p.picked_team_id
    FROM public.nhl_r2_series_picks p
    WHERE p.edition_id = p_edition_id
    UNION ALL
    SELECT p.user_id, p.edition_id, p.series_id, p.picked_team_id
    FROM public.nhl_cf_series_picks p
    WHERE p.edition_id = p_edition_id
    UNION ALL
    SELECT p.user_id, p.edition_id, p.series_id, p.picked_team_id
    FROM public.nhl_scf_series_picks p
    WHERE p.edition_id = p_edition_id
  ),
  series_for_scoring AS (
    SELECT
      s.id,
      s.edition_id,
      s.round_code,
      COALESCE(
        s.winner_team_id,
        CASE
          WHEN s.higher_seed_team_id IS NOT NULL
            AND s.lower_seed_team_id IS NOT NULL
            AND GREATEST(
              COALESCE(s.games_won_by_higher_seed, 0),
              COALESCE(s.games_won_by_lower_seed, 0)
            ) >= 4
            AND COALESCE(s.games_won_by_higher_seed, 0)
              <> COALESCE(s.games_won_by_lower_seed, 0)
          THEN
            CASE
              WHEN COALESCE(s.games_won_by_higher_seed, 0)
                > COALESCE(s.games_won_by_lower_seed, 0)
              THEN s.higher_seed_team_id
              ELSE s.lower_seed_team_id
            END
          ELSE NULL
        END
      ) AS scoring_winner_team_id
    FROM public.nhl_series s
    WHERE s.edition_id = p_edition_id
  ),
  pick_scores AS (
    SELECT
      p.user_id,
      COUNT(*)::integer AS pick_count,
      COUNT(*) FILTER (WHERE sfs.scoring_winner_team_id IS NULL)::integer AS pending_decisions,
      COUNT(*) FILTER (
        WHERE sfs.scoring_winner_team_id IS NOT NULL
          AND p.picked_team_id = sfs.scoring_winner_team_id
      )::integer AS correct_picks,
      COUNT(*) FILTER (
        WHERE sfs.scoring_winner_team_id IS NOT NULL
          AND p.picked_team_id = sfs.scoring_winner_team_id
          AND sfs.round_code IN ('R2', 'CF', 'SCF')
      )::integer AS correct_picks_post_round1,
      COALESCE(
        SUM(
          CASE
            WHEN sfs.scoring_winner_team_id IS NOT NULL
              AND p.picked_team_id = sfs.scoring_winner_team_id
              AND sfs.round_code = 'R1'
            THEN 1
            ELSE 0
          END
        ),
        0
      )::integer AS round1_points,
      COALESCE(
        SUM(
          CASE
            WHEN sfs.scoring_winner_team_id IS NOT NULL
              AND p.picked_team_id = sfs.scoring_winner_team_id
              AND sfs.round_code = 'R2'
            THEN 2
            ELSE 0
          END
        ),
        0
      )::integer AS round2_points,
      COALESCE(
        SUM(
          CASE
            WHEN sfs.scoring_winner_team_id IS NOT NULL
              AND p.picked_team_id = sfs.scoring_winner_team_id
              AND sfs.round_code = 'CF'
            THEN 4
            ELSE 0
          END
        ),
        0
      )::integer AS conference_final_points,
      COALESCE(
        SUM(
          CASE
            WHEN sfs.scoring_winner_team_id IS NOT NULL
              AND p.picked_team_id = sfs.scoring_winner_team_id
              AND sfs.round_code = 'SCF'
            THEN 8
            ELSE 0
          END
        ),
        0
      )::integer AS stanley_cup_final_points,
      0::integer AS bonus_points
    FROM all_picks p
    INNER JOIN series_for_scoring sfs
      ON sfs.id = p.series_id
      AND sfs.edition_id = p.edition_id
    WHERE p.edition_id = p_edition_id
    GROUP BY p.user_id
  ),
  scored AS (
    SELECT
      e.user_id,
      COALESCE(
        NULLIF(TRIM(m.display_name), ''),
        NULLIF(TRIM(split_part(u.email, '@', 1)), ''),
        'NHL participant'
      ) AS entry_name,
      COALESCE(ps.round1_points, 0) AS round1_points,
      COALESCE(ps.round2_points, 0) AS round2_points,
      COALESCE(ps.conference_final_points, 0) AS conference_final_points,
      COALESCE(ps.stanley_cup_final_points, 0) AS stanley_cup_final_points,
      COALESCE(ps.bonus_points, 0) AS bonus_points,
      (
        COALESCE(ps.round1_points, 0)
        + COALESCE(ps.round2_points, 0)
        + COALESCE(ps.conference_final_points, 0)
        + COALESCE(ps.stanley_cup_final_points, 0)
        + COALESCE(ps.bonus_points, 0)
      )::integer AS total_points,
      (
        COALESCE(ps.round2_points, 0)
        + COALESCE(ps.conference_final_points, 0)
        + COALESCE(ps.stanley_cup_final_points, 0)
        + COALESCE(ps.bonus_points, 0)
      )::integer AS round2_plus_points,
      COALESCE(ps.correct_picks, 0) AS correct_picks,
      COALESCE(ps.correct_picks_post_round1, 0) AS correct_picks_post_round1,
      COALESCE(ps.pending_decisions, 0) AS pending_decisions,
      COALESCE(ps.pick_count, 0) AS pick_count,
      CASE
        WHEN COALESCE(ps.pick_count, 0) = 0 THEN 'no_picks'
        WHEN COALESCE(ps.pending_decisions, 0) > 0 THEN 'in_progress'
        ELSE 'complete'
      END AS status
    FROM entrants e
    LEFT JOIN public.nhl_memberships m
      ON m.user_id = e.user_id
      AND m.edition_id = p_edition_id
    LEFT JOIN auth.users u ON u.id = e.user_id
    LEFT JOIN pick_scores ps ON ps.user_id = e.user_id
  )
  SELECT
    RANK() OVER (
      ORDER BY s.total_points DESC, s.correct_picks DESC, s.entry_name ASC
    ) AS rank,
    RANK() OVER (
      ORDER BY s.round2_plus_points DESC, s.correct_picks_post_round1 DESC, s.entry_name ASC
    ) AS round2_plus_rank,
    s.user_id,
    s.entry_name,
    s.total_points,
    s.round1_points,
    s.round2_points,
    s.conference_final_points,
    s.stanley_cup_final_points,
    s.bonus_points,
    s.round2_plus_points,
    s.correct_picks,
    s.correct_picks_post_round1,
    s.pending_decisions,
    s.pick_count,
    s.status
  FROM scored s
  ORDER BY rank ASC, s.entry_name ASC;
END;
$$;

COMMENT ON FUNCTION public.fetch_nhl_edition_standings(uuid) IS
  'NHL edition leaderboard: scores R1–SCF picks using winner_team_id or inferred winner from 4+ game wins.';

REVOKE ALL ON FUNCTION public.fetch_nhl_edition_standings(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fetch_nhl_edition_standings(uuid) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.fetch_nhl_public_entry_picks(p_membership_id uuid)
RETURNS TABLE (
  series_id uuid,
  round_code text,
  round_order integer,
  side_or_conference text,
  slot_index integer,
  higher_team_abbr text,
  higher_team_name text,
  lower_team_abbr text,
  lower_team_name text,
  picked_team_abbr text,
  picked_team_name text,
  scoring_winner_abbr text,
  scoring_winner_name text,
  outcome text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_edition_id uuid;
BEGIN
  SELECT m.user_id, m.edition_id
  INTO v_user_id, v_edition_id
  FROM public.nhl_memberships m
  INNER JOIN public.nhl_editions e ON e.id = m.edition_id AND e.is_active = true
  WHERE m.id = p_membership_id;

  IF v_user_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH series_for_scoring AS (
    SELECT
      s.id,
      s.edition_id,
      s.round_code,
      s.round_order,
      s.side_or_conference,
      s.slot_index,
      s.higher_seed_team_id,
      s.lower_seed_team_id,
      COALESCE(
        s.winner_team_id,
        CASE
          WHEN s.higher_seed_team_id IS NOT NULL
            AND s.lower_seed_team_id IS NOT NULL
            AND GREATEST(
              COALESCE(s.games_won_by_higher_seed, 0),
              COALESCE(s.games_won_by_lower_seed, 0)
            ) >= 4
            AND COALESCE(s.games_won_by_higher_seed, 0)
              <> COALESCE(s.games_won_by_lower_seed, 0)
          THEN
            CASE
              WHEN COALESCE(s.games_won_by_higher_seed, 0)
                > COALESCE(s.games_won_by_lower_seed, 0)
              THEN s.higher_seed_team_id
              ELSE s.lower_seed_team_id
            END
          ELSE NULL
        END
      ) AS scoring_winner_team_id
    FROM public.nhl_series s
    WHERE s.edition_id = v_edition_id
  ),
  user_picks AS (
    SELECT p.series_id, p.picked_team_id
    FROM public.nhl_r1_series_picks p
    WHERE p.user_id = v_user_id
      AND p.edition_id = v_edition_id
    UNION ALL
    SELECT p.series_id, p.picked_team_id
    FROM public.nhl_r2_series_picks p
    WHERE p.user_id = v_user_id
      AND p.edition_id = v_edition_id
    UNION ALL
    SELECT p.series_id, p.picked_team_id
    FROM public.nhl_cf_series_picks p
    WHERE p.user_id = v_user_id
      AND p.edition_id = v_edition_id
    UNION ALL
    SELECT p.series_id, p.picked_team_id
    FROM public.nhl_scf_series_picks p
    WHERE p.user_id = v_user_id
      AND p.edition_id = v_edition_id
  )
  SELECT
    sfs.id AS series_id,
    sfs.round_code::text,
    sfs.round_order::integer,
    sfs.side_or_conference::text,
    sfs.slot_index::integer,
    th.abbreviation::text AS higher_team_abbr,
    th.team_name::text AS higher_team_name,
    tl.abbreviation::text AS lower_team_abbr,
    tl.team_name::text AS lower_team_name,
    tp.abbreviation::text AS picked_team_abbr,
    tp.team_name::text AS picked_team_name,
    tw.abbreviation::text AS scoring_winner_abbr,
    tw.team_name::text AS scoring_winner_name,
    (
      CASE
        WHEN sfs.scoring_winner_team_id IS NULL THEN 'pending'
        WHEN up.picked_team_id = sfs.scoring_winner_team_id THEN 'correct'
        ELSE 'incorrect'
      END
    )::text AS outcome
  FROM user_picks up
  INNER JOIN series_for_scoring sfs ON sfs.id = up.series_id
  LEFT JOIN public.nhl_teams th ON th.id = sfs.higher_seed_team_id
  LEFT JOIN public.nhl_teams tl ON tl.id = sfs.lower_seed_team_id
  LEFT JOIN public.nhl_teams tp ON tp.id = up.picked_team_id
  LEFT JOIN public.nhl_teams tw ON tw.id = sfs.scoring_winner_team_id
  ORDER BY sfs.round_order ASC, sfs.side_or_conference ASC NULLS LAST, sfs.slot_index ASC;
END;
$$;
