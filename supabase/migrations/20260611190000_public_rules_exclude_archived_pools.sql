-- Public rules views should not expose archived or simulation pools.
-- Also disable show_public_rules on archived pools that still had it enabled.

UPDATE public.pools
SET
  show_public_rules = false,
  updated_at = now()
WHERE archived_at IS NOT NULL
  AND show_public_rules IS TRUE;

DROP VIEW IF EXISTS public.scoring_rules_public;
DROP VIEW IF EXISTS public.pool_rules_public;

CREATE VIEW public.pool_rules_public
WITH (security_invoker = false)
AS
SELECT
  pl.id AS pool_id,
  pl.name AS pool_name,
  pl.lock_at AS pool_lock_at,
  pl.entry_fee_cents,
  pl.prize_distribution_json,
  pl.group_advance_exact_points,
  pl.group_advance_wrong_slot_points,
  pl.tie_break_note
FROM public.pools pl
WHERE pl.show_public_rules IS TRUE
  AND pl.archived_at IS NULL
  AND pl.is_simulation IS NOT TRUE;

COMMENT ON VIEW public.pool_rules_public IS
  'Pool metadata for the anonymous rules page when show_public_rules is true (active pools only).';

GRANT SELECT ON public.pool_rules_public TO anon, authenticated;

CREATE VIEW public.scoring_rules_public
WITH (security_invoker = false)
AS
SELECT
  sr.pool_id,
  pl.name AS pool_name,
  pl.lock_at AS pool_lock_at,
  pl.entry_fee_cents,
  pl.prize_distribution_json,
  pl.group_advance_exact_points,
  pl.group_advance_wrong_slot_points,
  pl.tie_break_note,
  sr.prediction_kind,
  sr.bonus_key,
  sr.points
FROM public.scoring_rules sr
INNER JOIN public.pools pl ON pl.id = sr.pool_id
WHERE pl.show_public_rules IS TRUE
  AND pl.archived_at IS NULL
  AND pl.is_simulation IS NOT TRUE;

COMMENT ON VIEW public.scoring_rules_public IS
  'Per-row scoring rules for active non-simulation pools with show_public_rules.';

GRANT SELECT ON public.scoring_rules_public TO anon, authenticated;
