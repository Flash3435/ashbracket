-- Pool rules metadata (entry fee, prizes, group-stage partial credit), fractional points,
-- per-bonus scoring rows, and public views for the rules page.

-- ---------------------------------------------------------------------------
-- Dependent views (column type / definition changes below)
-- ---------------------------------------------------------------------------

DROP VIEW IF EXISTS public.leaderboard_public;
DROP VIEW IF EXISTS public.scoring_rules_public;

-- ---------------------------------------------------------------------------
-- Pools: organizer-facing metadata surfaced on the public rules page
-- ---------------------------------------------------------------------------

ALTER TABLE public.pools
  ADD COLUMN IF NOT EXISTS entry_fee_cents integer,
  ADD COLUMN IF NOT EXISTS prize_distribution_json jsonb,
  ADD COLUMN IF NOT EXISTS group_advance_exact_points numeric(10, 2),
  ADD COLUMN IF NOT EXISTS group_advance_wrong_slot_points numeric(10, 2);

ALTER TABLE public.pools
  DROP CONSTRAINT IF EXISTS pools_entry_fee_cents_check;

ALTER TABLE public.pools
  ADD CONSTRAINT pools_entry_fee_cents_check
  CHECK (entry_fee_cents IS NULL OR entry_fee_cents >= 0);

COMMENT ON COLUMN public.pools.entry_fee_cents IS
  'Optional entry fee in cents (e.g. 2500 = $25.00) for public rules display.';
COMMENT ON COLUMN public.pools.prize_distribution_json IS
  'JSON array of {place, label, percent?, remainder?} for public rules display.';
COMMENT ON COLUMN public.pools.group_advance_exact_points IS
  'When set with group_advance_wrong_slot_points, group winner/runner-up picks use legacy exact-slot vs wrong-slot scoring instead of per-kind scoring_rules rows.';
COMMENT ON COLUMN public.pools.group_advance_wrong_slot_points IS
  'Partial credit when the picked team advances from the group but in the other finishing slot.';

-- ---------------------------------------------------------------------------
-- Scoring rules: optional bonus_key (per bonus category), fractional points
-- ---------------------------------------------------------------------------

ALTER TABLE public.scoring_rules
  ADD COLUMN IF NOT EXISTS bonus_key text;

ALTER TABLE public.scoring_rules
  DROP CONSTRAINT IF EXISTS scoring_rules_pool_kind_unique;

ALTER TABLE public.scoring_rules
  DROP CONSTRAINT IF EXISTS scoring_rules_points_check;

ALTER TABLE public.scoring_rules
  ALTER COLUMN points TYPE numeric(10, 2) USING points::numeric(10, 2);

ALTER TABLE public.scoring_rules
  ADD CONSTRAINT scoring_rules_points_non_negative CHECK (points >= 0);

CREATE UNIQUE INDEX IF NOT EXISTS scoring_rules_pool_kind_bonus_unique
  ON public.scoring_rules (pool_id, prediction_kind, bonus_key)
  NULLS NOT DISTINCT;

COMMENT ON COLUMN public.scoring_rules.bonus_key IS
  'For prediction_kind bonus_pick, identifies which bonus (e.g. most_goals). NULL for all other kinds.';

-- ---------------------------------------------------------------------------
-- Ledger: allow half-points etc.
-- ---------------------------------------------------------------------------

ALTER TABLE public.points_ledger
  ALTER COLUMN points_delta TYPE numeric(10, 2) USING points_delta::numeric(10, 2);

-- ---------------------------------------------------------------------------
-- RPC: persist fractional ledger lines
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.replace_points_ledger_for_pool(
  p_pool_id uuid,
  p_rows jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.app_admins a WHERE a.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'not authorized to replace points ledger'
      USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.points_ledger WHERE pool_id = p_pool_id;

  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' THEN
    RETURN;
  END IF;

  IF COALESCE(jsonb_array_length(p_rows), 0) = 0 THEN
    RETURN;
  END IF;

  INSERT INTO public.points_ledger (
    pool_id,
    participant_id,
    points_delta,
    prediction_kind,
    prediction_id,
    result_id,
    note
  )
  SELECT
    p_pool_id,
    (elem->>'participant_id')::uuid,
    (elem->>'points_delta')::numeric(10, 2),
    elem->>'prediction_kind',
    (elem->>'prediction_id')::uuid,
    (elem->>'result_id')::uuid,
    elem->>'note'
  FROM jsonb_array_elements(p_rows) AS elem;
END;
$$;

-- ---------------------------------------------------------------------------
-- Public views
-- ---------------------------------------------------------------------------

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
  pl.group_advance_wrong_slot_points
FROM public.pools pl
WHERE pl.is_public IS TRUE;

COMMENT ON VIEW public.pool_rules_public IS
  'Public pool metadata for the rules page (fee, prizes, group-stage scoring summary).';

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
  sr.prediction_kind,
  sr.bonus_key,
  sr.points
FROM public.scoring_rules sr
INNER JOIN public.pools pl ON pl.id = sr.pool_id AND pl.is_public IS TRUE;

COMMENT ON VIEW public.scoring_rules_public IS
  'Per-row scoring rules for public pools, including pool metadata and optional bonus_key.';

GRANT SELECT ON public.scoring_rules_public TO anon, authenticated;

CREATE VIEW public.leaderboard_public
WITH (security_invoker = false)
AS
WITH totals AS (
  SELECT
    par.pool_id,
    pl.name AS pool_name,
    par.id AS participant_id,
    par.display_name,
    COALESCE(SUM(l.points_delta), 0)::numeric(12, 2) AS total_points
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
  'Leaderboard rows for public pools only. total_points may include fractional scoring.';

GRANT SELECT ON public.leaderboard_public TO anon, authenticated;
