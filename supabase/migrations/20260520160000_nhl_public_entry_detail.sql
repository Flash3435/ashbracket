-- Public NHL entry pick detail: standings membership_id for links + SECURITY DEFINER pick rows.

DROP FUNCTION IF EXISTS public.fetch_nhl_edition_standings(uuid);

CREATE OR REPLACE FUNCTION public.fetch_nhl_edition_standings(p_edition_id uuid)
RETURNS TABLE (
  rank bigint,
  round2_plus_rank bigint,
  membership_id uuid,
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
      m.id AS membership_id,
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
    s.membership_id,
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
  'NHL edition leaderboard: scores picks using winner_team_id or inferred winner from 4+ game wins; includes membership_id when joined.';

REVOKE ALL ON FUNCTION public.fetch_nhl_edition_standings(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fetch_nhl_edition_standings(uuid) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- Public pick detail for one competition entry (membership)
-- ---------------------------------------------------------------------------

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
  )
  SELECT
    sfs.id AS series_id,
    sfs.round_code::text,
    sfs.round_order,
    sfs.side_or_conference::text,
    sfs.slot_index,
    th.abbreviation AS higher_team_abbr,
    th.team_name AS higher_team_name,
    tl.abbreviation AS lower_team_abbr,
    tl.team_name AS lower_team_name,
    tp.abbreviation AS picked_team_abbr,
    tp.team_name AS picked_team_name,
    tw.abbreviation AS scoring_winner_abbr,
    tw.team_name AS scoring_winner_name,
    CASE
      WHEN sfs.scoring_winner_team_id IS NULL THEN 'pending'
      WHEN up.picked_team_id = sfs.scoring_winner_team_id THEN 'correct'
      ELSE 'incorrect'
    END AS outcome
  FROM user_picks up
  INNER JOIN series_for_scoring sfs ON sfs.id = up.series_id
  LEFT JOIN public.nhl_teams th ON th.id = sfs.higher_seed_team_id
  LEFT JOIN public.nhl_teams tl ON tl.id = sfs.lower_seed_team_id
  LEFT JOIN public.nhl_teams tp ON tp.id = up.picked_team_id
  LEFT JOIN public.nhl_teams tw ON tw.id = sfs.scoring_winner_team_id
  ORDER BY sfs.round_order ASC, sfs.side_or_conference ASC NULLS LAST, sfs.slot_index ASC;
END;
$$;

COMMENT ON FUNCTION public.fetch_nhl_public_entry_picks(uuid) IS
  'Public NHL pick breakdown for one membership on the active edition; uses the same scoring winner logic as fetch_nhl_edition_standings.';

REVOKE ALL ON FUNCTION public.fetch_nhl_public_entry_picks(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fetch_nhl_public_entry_picks(uuid) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.fetch_nhl_public_entry_context(p_membership_id uuid)
RETURNS TABLE (
  membership_id uuid,
  user_id uuid,
  edition_id uuid,
  entry_name text,
  edition_name text,
  season_label text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    m.id,
    m.user_id,
    m.edition_id,
    COALESCE(
      NULLIF(TRIM(m.display_name), ''),
      NULLIF(TRIM(split_part(u.email, '@', 1)), ''),
      'NHL participant'
    ) AS entry_name,
    e.name AS edition_name,
    e.season_label
  FROM public.nhl_memberships m
  INNER JOIN public.nhl_editions e ON e.id = m.edition_id AND e.is_active = true
  LEFT JOIN auth.users u ON u.id = m.user_id
  WHERE m.id = p_membership_id;
END;
$$;

COMMENT ON FUNCTION public.fetch_nhl_public_entry_context(uuid) IS
  'Resolves a public NHL entry (membership) on the active edition for pick-detail pages.';

REVOKE ALL ON FUNCTION public.fetch_nhl_public_entry_context(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fetch_nhl_public_entry_context(uuid) TO anon, authenticated;
