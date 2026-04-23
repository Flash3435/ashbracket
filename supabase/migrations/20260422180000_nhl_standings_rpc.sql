-- NHL leaderboard RPC + optional membership display name (NHL-only; no World Cup changes).

ALTER TABLE public.nhl_memberships
  ADD COLUMN IF NOT EXISTS display_name text;

COMMENT ON COLUMN public.nhl_memberships.display_name IS
  'Optional public leaderboard label for this NHL edition; falls back to account email local-part in standings RPC.';

-- ---------------------------------------------------------------------------
-- Public standings for the active NHL edition (aggregates only; SECURITY DEFINER).
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
    FROM public.nhl_r1_series_picks p
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
  'Returns NHL-only leaderboard rows for an active edition (members + anyone with R1 picks). Round weights: R1=1, R2=2, CF=4, SCF=8 per correct resolved series winner.';

REVOKE ALL ON FUNCTION public.fetch_nhl_edition_standings(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fetch_nhl_edition_standings(uuid) TO anon, authenticated;
