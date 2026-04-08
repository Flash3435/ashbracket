-- Public /rules data is gated by show_public_rules instead of is_public.
-- is_public continues to control leaderboard_public and other standings surfaces.

ALTER TABLE public.pools
  ADD COLUMN IF NOT EXISTS show_public_rules boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.pools.show_public_rules IS
  'When true, anonymous users can read this pool via scoring_rules_public / pool_rules_public (rules page). Independent of is_public (public leaderboard / standings).';

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
WHERE pl.show_public_rules IS TRUE;

COMMENT ON VIEW public.pool_rules_public IS
  'Pool metadata for the anonymous rules page when show_public_rules is true.';

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
INNER JOIN public.pools pl ON pl.id = sr.pool_id AND pl.show_public_rules IS TRUE;

COMMENT ON VIEW public.scoring_rules_public IS
  'Per-row scoring rules for pools with show_public_rules, including pool metadata, optional bonus_key, and tie_break_note.';

GRANT SELECT ON public.scoring_rules_public TO anon, authenticated;
