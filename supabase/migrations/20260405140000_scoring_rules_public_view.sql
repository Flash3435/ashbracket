-- Public read-only scoring rules for pools marked is_public (anon + authenticated).
-- Same pattern as leaderboard_public: security_invoker = false, no direct table grants needed.

CREATE VIEW public.scoring_rules_public
WITH (security_invoker = false)
AS
SELECT
  sr.pool_id,
  pl.name AS pool_name,
  pl.lock_at AS pool_lock_at,
  sr.prediction_kind,
  sr.points
FROM public.scoring_rules sr
INNER JOIN public.pools pl ON pl.id = sr.pool_id AND pl.is_public IS TRUE;

COMMENT ON VIEW public.scoring_rules_public IS
  'Points per prediction_kind for public pools. No internal rule row ids.';

GRANT SELECT ON public.scoring_rules_public TO anon, authenticated;
