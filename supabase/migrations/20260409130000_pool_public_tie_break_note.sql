-- Optional plain-English tie-break copy for the public rules page.

DROP VIEW IF EXISTS public.scoring_rules_public;
DROP VIEW IF EXISTS public.pool_rules_public;

ALTER TABLE public.pools
  ADD COLUMN IF NOT EXISTS tie_break_note text;

COMMENT ON COLUMN public.pools.tie_break_note IS
  'Optional tie-break explanation for participants; shown on the public rules page when set.';

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
WHERE pl.is_public IS TRUE;

COMMENT ON VIEW public.pool_rules_public IS
  'Public pool metadata for the rules page (fee, prizes, group-stage summary, tie-break note).';

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
INNER JOIN public.pools pl ON pl.id = sr.pool_id AND pl.is_public IS TRUE;

COMMENT ON VIEW public.scoring_rules_public IS
  'Per-row scoring rules for public pools, including pool metadata, optional bonus_key, and tie_break_note.';

GRANT SELECT ON public.scoring_rules_public TO anon, authenticated;
