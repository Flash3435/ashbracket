-- Public read-only leaderboard surface for anon + authenticated users.
-- Base tables keep existing RLS: anon still has no policies there (no reads/writes).
-- Admins continue to manage data via app_admins policies on tables.

-- ---------------------------------------------------------------------------
-- Pool visibility toggle (default off = no public leaderboard rows)
-- ---------------------------------------------------------------------------

ALTER TABLE public.pools
  ADD COLUMN is_public boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.pools.is_public IS
  'When true, this pool appears in leaderboard_public for anonymous reads.';

-- ---------------------------------------------------------------------------
-- Read-only view: safe columns only, security_invoker = false (owner reads
-- underlying rows; RLS on base tables is bypassed only inside this definition).
-- ---------------------------------------------------------------------------

CREATE VIEW public.leaderboard_public
WITH (security_invoker = false)
AS
WITH totals AS (
  SELECT
    par.pool_id,
    pl.name AS pool_name,
    par.id AS participant_id,
    par.display_name,
    COALESCE(SUM(l.points_delta), 0)::bigint AS total_points
  FROM public.participants par
  INNER JOIN public.pools pl
    ON pl.id = par.pool_id
    AND pl.is_public IS TRUE
  LEFT JOIN public.points_ledger l
    ON l.participant_id = par.id
    AND l.pool_id = par.pool_id
  GROUP BY
    par.pool_id,
    pl.name,
    par.id,
    par.display_name
)
SELECT
  pool_id,
  pool_name,
  participant_id,
  display_name,
  total_points,
  RANK() OVER (
    PARTITION BY pool_id
    ORDER BY total_points DESC
  ) AS rank
FROM totals;

COMMENT ON VIEW public.leaderboard_public IS
  'Leaderboard rows for public pools only. No email, notes, or payment fields.';

-- ---------------------------------------------------------------------------
-- Grants: SELECT only; views are not writable without INSTEAD OF triggers.
-- ---------------------------------------------------------------------------

GRANT SELECT ON public.leaderboard_public TO anon, authenticated;
