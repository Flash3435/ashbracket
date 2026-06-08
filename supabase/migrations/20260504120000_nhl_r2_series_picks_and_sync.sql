-- Round 2 NHL series-winner picks + bracket slot sync from Round 1 DB winners.
-- Standings RPC extended to include R2 picks (same scoring weights as existing join).

-- ---------------------------------------------------------------------------
-- Round 2 picks table (mirrors Round 1; isolated from World Cup)
-- ---------------------------------------------------------------------------

CREATE TABLE public.nhl_r2_series_picks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  edition_id uuid NOT NULL REFERENCES public.nhl_editions (id) ON DELETE CASCADE,
  series_id uuid NOT NULL REFERENCES public.nhl_series (id) ON DELETE CASCADE,
  picked_team_id uuid NOT NULL REFERENCES public.nhl_teams (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT nhl_r2_series_picks_user_edition_series_unique UNIQUE (user_id, edition_id, series_id)
);

CREATE INDEX idx_nhl_r2_series_picks_edition_user
  ON public.nhl_r2_series_picks (edition_id, user_id);

CREATE TRIGGER nhl_r2_series_picks_set_updated_at
  BEFORE UPDATE ON public.nhl_r2_series_picks
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.nhl_r2_series_picks IS
  'Round 2 predicted series winner per auth user and edition; one row per Round 2 series.';

CREATE OR REPLACE FUNCTION public.enforce_nhl_r2_series_pick_row()
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

  IF v_series.round_code IS DISTINCT FROM 'R2' THEN
    RAISE EXCEPTION 'only round 2 series picks are allowed';
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

CREATE TRIGGER nhl_r2_series_picks_enforce_rules
  BEFORE INSERT OR UPDATE ON public.nhl_r2_series_picks
  FOR EACH ROW EXECUTE FUNCTION public.enforce_nhl_r2_series_pick_row();

ALTER TABLE public.nhl_r2_series_picks ENABLE ROW LEVEL SECURITY;

CREATE POLICY nhl_r2_series_picks_select_own
  ON public.nhl_r2_series_picks
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY nhl_r2_series_picks_insert_own
  ON public.nhl_r2_series_picks
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY nhl_r2_series_picks_update_own
  ON public.nhl_r2_series_picks
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY nhl_r2_series_picks_delete_own
  ON public.nhl_r2_series_picks
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Populate Round 2 higher/lower team ids from completed Round 1 winners.
-- Bracket wiring: R2 slot 1 = winners of R1 slots 1 & 2; R2 slot 2 = winners of R1 slots 3 & 4
-- (same mapping for East and West). Higher seed = better regular-season seed (lower number).
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.sync_nhl_r2_slots_from_r1(p_edition_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_side text;
  v_r2_slot int;
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
    FOREACH v_r2_slot IN ARRAY ARRAY[1, 2]
    LOOP
      SELECT s1.winner_team_id, s2.winner_team_id
      INTO v_w1, v_w2
      FROM public.nhl_series s1
      JOIN public.nhl_series s2
        ON s2.edition_id = s1.edition_id
        AND s2.round_code = 'R1'
        AND s2.side_or_conference = s1.side_or_conference
        AND s2.slot_index = CASE WHEN v_r2_slot = 1 THEN 2 ELSE 4 END
      WHERE s1.edition_id = p_edition_id
        AND s1.round_code = 'R1'
        AND s1.side_or_conference = v_side
        AND s1.slot_index = CASE WHEN v_r2_slot = 1 THEN 1 ELSE 3 END;

      IF v_w1 IS NULL OR v_w2 IS NULL THEN
        UPDATE public.nhl_series r2
        SET
          higher_seed_team_id = NULL,
          lower_seed_team_id = NULL
        WHERE r2.edition_id = p_edition_id
          AND r2.round_code = 'R2'
          AND r2.side_or_conference = v_side
          AND r2.slot_index = v_r2_slot;
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
        UPDATE public.nhl_series r2
        SET
          higher_seed_team_id = NULL,
          lower_seed_team_id = NULL
        WHERE r2.edition_id = p_edition_id
          AND r2.round_code = 'R2'
          AND r2.side_or_conference = v_side
          AND r2.slot_index = v_r2_slot;
        CONTINUE;
      END IF;

      UPDATE public.nhl_series r2
      SET
        higher_seed_team_id = v_hi,
        lower_seed_team_id = v_lo
      WHERE r2.edition_id = p_edition_id
        AND r2.round_code = 'R2'
        AND r2.side_or_conference = v_side
        AND r2.slot_index = v_r2_slot;
    END LOOP;
  END LOOP;
END;
$$;

COMMENT ON FUNCTION public.sync_nhl_r2_slots_from_r1(uuid) IS
  'Fills Round 2 series higher/lower team FKs from Round 1 winner_team_id values (active edition only). Idempotent.';

REVOKE ALL ON FUNCTION public.sync_nhl_r2_slots_from_r1(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sync_nhl_r2_slots_from_r1(uuid) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- Standings: aggregate R1 + R2 picks
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fetch_nhl_edition_standings(p_edition_id uuid)
RETURNS TABLE (
  rank bigint,
  user_id uuid,
  entry_name text,
  total_points integer,
  correct_picks integer,
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
  ),
  all_picks AS (
    SELECT p.user_id, p.edition_id, p.series_id, p.picked_team_id
    FROM public.nhl_r1_series_picks p
    WHERE p.edition_id = p_edition_id
    UNION ALL
    SELECT p.user_id, p.edition_id, p.series_id, p.picked_team_id
    FROM public.nhl_r2_series_picks p
    WHERE p.edition_id = p_edition_id
  ),
  pick_scores AS (
    SELECT
      p.user_id,
      COUNT(*)::integer AS pick_count,
      COUNT(*) FILTER (WHERE s.winner_team_id IS NULL)::integer AS pending_decisions,
      COUNT(*) FILTER (
        WHERE s.winner_team_id IS NOT NULL
          AND p.picked_team_id = s.winner_team_id
      )::integer AS correct_picks,
      COALESCE(
        SUM(
          CASE
            WHEN s.winner_team_id IS NOT NULL
              AND p.picked_team_id = s.winner_team_id
            THEN
              CASE s.round_code
                WHEN 'R1' THEN 1
                WHEN 'R2' THEN 2
                WHEN 'CF' THEN 4
                WHEN 'SCF' THEN 8
                ELSE 0
              END
            ELSE 0
          END
        ),
        0
      )::integer AS total_points
    FROM all_picks p
    INNER JOIN public.nhl_series s
      ON s.id = p.series_id
      AND s.edition_id = p.edition_id
    WHERE p.edition_id = p_edition_id
    GROUP BY p.user_id
  ),
  ranked AS (
    SELECT
      e.user_id,
      COALESCE(
        NULLIF(TRIM(m.display_name), ''),
        NULLIF(TRIM(split_part(u.email, '@', 1)), ''),
        'NHL participant'
      ) AS entry_name,
      COALESCE(ps.total_points, 0) AS total_points,
      COALESCE(ps.correct_picks, 0) AS correct_picks,
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
      ORDER BY r.total_points DESC, r.correct_picks DESC, r.entry_name ASC
    ) AS rank,
    r.user_id,
    r.entry_name,
    r.total_points::integer,
    r.correct_picks::integer,
    r.pending_decisions::integer,
    r.pick_count::integer,
    r.status
  FROM ranked r
  ORDER BY rank ASC, r.entry_name ASC;
END;
$$;

COMMENT ON FUNCTION public.fetch_nhl_edition_standings(uuid) IS
  'Returns NHL-only leaderboard rows for an active edition. Round weights: R1=1, R2=2, CF=4, SCF=8 per correct resolved series winner. Includes Round 1 and Round 2 series picks.';
