-- Remap NHL picks onto the active edition (legacy inactive editions / slot-stable identity).
-- Also allow authenticated users to read bracket rows for editions where they saved picks.

-- ---------------------------------------------------------------------------
-- RLS: read series/teams for editions where the user has pick rows (legacy resolution)
-- ---------------------------------------------------------------------------

CREATE POLICY nhl_series_select_own_pick_editions
  ON public.nhl_series
  FOR SELECT
  TO authenticated
  USING (
    edition_id IN (
      SELECT p.edition_id
      FROM public.nhl_r1_series_picks p
      WHERE p.user_id = auth.uid()
      UNION
      SELECT p.edition_id
      FROM public.nhl_r2_series_picks p
      WHERE p.user_id = auth.uid()
    )
  );

CREATE POLICY nhl_teams_select_own_pick_editions
  ON public.nhl_teams
  FOR SELECT
  TO authenticated
  USING (
    edition_id IN (
      SELECT p.edition_id
      FROM public.nhl_r1_series_picks p
      WHERE p.user_id = auth.uid()
      UNION
      SELECT p.edition_id
      FROM public.nhl_r2_series_picks p
      WHERE p.user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- One-time backfill: move picks from inactive editions → active edition (by bracket slot)
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_active uuid;
BEGIN
  SELECT e.id
  INTO v_active
  FROM public.nhl_editions e
  WHERE e.is_active = true
  ORDER BY e.created_at DESC
  LIMIT 1;

  IF v_active IS NULL THEN
    RETURN;
  END IF;

  -- Round 1: copy onto active edition slots; keep existing active-edition row if present.
  INSERT INTO public.nhl_r1_series_picks (user_id, edition_id, series_id, picked_team_id)
  SELECT
    p.user_id,
    v_active,
    s_new.id,
    t_new.id
  FROM public.nhl_r1_series_picks p
  INNER JOIN public.nhl_series s_old ON s_old.id = p.series_id
  INNER JOIN public.nhl_series s_new
    ON s_new.edition_id = v_active
    AND s_new.round_code = s_old.round_code
    AND s_new.side_or_conference IS NOT DISTINCT FROM s_old.side_or_conference
    AND s_new.slot_index = s_old.slot_index
  INNER JOIN public.nhl_teams t_old ON t_old.id = p.picked_team_id
  INNER JOIN public.nhl_teams t_new
    ON t_new.edition_id = v_active
    AND t_new.team_slug = t_old.team_slug
  WHERE p.edition_id IS DISTINCT FROM v_active
    AND s_old.round_code = 'R1'
  ON CONFLICT (user_id, edition_id, series_id) DO NOTHING;

  DELETE FROM public.nhl_r1_series_picks p
  WHERE p.edition_id IS DISTINCT FROM v_active;

  -- Round 2
  INSERT INTO public.nhl_r2_series_picks (user_id, edition_id, series_id, picked_team_id)
  SELECT
    p.user_id,
    v_active,
    s_new.id,
    t_new.id
  FROM public.nhl_r2_series_picks p
  INNER JOIN public.nhl_series s_old ON s_old.id = p.series_id
  INNER JOIN public.nhl_series s_new
    ON s_new.edition_id = v_active
    AND s_new.round_code = s_old.round_code
    AND s_new.side_or_conference IS NOT DISTINCT FROM s_old.side_or_conference
    AND s_new.slot_index = s_old.slot_index
  INNER JOIN public.nhl_teams t_old ON t_old.id = p.picked_team_id
  INNER JOIN public.nhl_teams t_new
    ON t_new.edition_id = v_active
    AND t_new.team_slug = t_old.team_slug
  WHERE p.edition_id IS DISTINCT FROM v_active
    AND s_old.round_code = 'R2'
  ON CONFLICT (user_id, edition_id, series_id) DO NOTHING;

  DELETE FROM public.nhl_r2_series_picks p
  WHERE p.edition_id IS DISTINCT FROM v_active;

  -- Membership on active edition for anyone with picks there now.
  INSERT INTO public.nhl_memberships (user_id, edition_id)
  SELECT DISTINCT src.user_id, v_active
  FROM (
    SELECT p.user_id
    FROM public.nhl_r1_series_picks p
    WHERE p.edition_id = v_active
    UNION
    SELECT p.user_id
    FROM public.nhl_r2_series_picks p
    WHERE p.edition_id = v_active
  ) AS src
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.nhl_memberships m
    WHERE m.user_id = src.user_id
      AND m.edition_id = v_active
  );
END;
$$;
