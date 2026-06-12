-- Live World Cup 2026 pools: increase third-place qualifier points (2→4) and
-- reduce most-goals bonus (50→25). Post-lock scoring adjustment for active pools only.
--
-- Scope: fifa_wc_2026 edition, non-simulation pools/editions, not archived.
-- Idempotent: updates only rows at prior canonical values; seeds missing rule sets.
-- Simulation, test, and archived pools are excluded.
--
-- After deploy, recompute ledgers:
--   npx tsx scripts/update-wc2026-live-scoring-rules.ts --recompute

-- ---------------------------------------------------------------------------
-- Group-stage columns (canonical 3/1) when a live pool never received them
-- ---------------------------------------------------------------------------

UPDATE public.pools p
SET
  group_advance_exact_points = 3,
  group_advance_wrong_slot_points = 1,
  updated_at = now()
FROM public.tournament_editions te
WHERE p.tournament_edition_id = te.id
  AND te.code = 'fifa_wc_2026'
  AND te.is_simulation IS NOT TRUE
  AND p.is_simulation IS NOT TRUE
  AND p.archived_at IS NULL
  AND (
    p.group_advance_exact_points IS NULL
    OR p.group_advance_wrong_slot_points IS NULL
  );

-- ---------------------------------------------------------------------------
-- Seed full canonical rule set when a live pool has no scoring_rules rows
-- ---------------------------------------------------------------------------

WITH target_pools AS (
  SELECT p.id
  FROM public.pools p
  INNER JOIN public.tournament_editions te ON te.id = p.tournament_edition_id
  WHERE te.code = 'fifa_wc_2026'
    AND te.is_simulation IS NOT TRUE
    AND p.is_simulation IS NOT TRUE
    AND p.archived_at IS NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.scoring_rules sr
      WHERE sr.pool_id = p.id
    )
)
INSERT INTO public.scoring_rules (pool_id, prediction_kind, bonus_key, points)
SELECT
  tp.id,
  seed.prediction_kind,
  seed.bonus_key,
  seed.points
FROM target_pools tp
CROSS JOIN (
  VALUES
    ('third_place_qualifier'::text, NULL::text, 4::numeric),
    ('round_of_16', NULL, 4),
    ('quarterfinalist', NULL, 8),
    ('semifinalist', NULL, 16),
    ('finalist', NULL, 24),
    ('champion', NULL, 32),
    ('bonus_pick', 'most_goals', 25),
    ('bonus_pick', 'most_yellow_cards', 10),
    ('bonus_pick', 'most_red_cards', 10)
) AS seed(prediction_kind, bonus_key, points)
ON CONFLICT (pool_id, prediction_kind, bonus_key) DO UPDATE SET
  points = EXCLUDED.points;

-- ---------------------------------------------------------------------------
-- third_place_qualifier: 2 → 4 (pools that already had partial/full rule rows)
-- ---------------------------------------------------------------------------

UPDATE public.scoring_rules sr
SET
  points = 4,
  updated_at = now()
FROM public.pools p
INNER JOIN public.tournament_editions te ON te.id = p.tournament_edition_id
WHERE sr.pool_id = p.id
  AND te.code = 'fifa_wc_2026'
  AND te.is_simulation IS NOT TRUE
  AND p.is_simulation IS NOT TRUE
  AND p.archived_at IS NULL
  AND sr.prediction_kind = 'third_place_qualifier'
  AND sr.bonus_key IS NULL
  AND sr.points = 2;

-- ---------------------------------------------------------------------------
-- bonus_pick / most_goals: 50 → 25
-- ---------------------------------------------------------------------------

UPDATE public.scoring_rules sr
SET
  points = 25,
  updated_at = now()
FROM public.pools p
INNER JOIN public.tournament_editions te ON te.id = p.tournament_edition_id
WHERE sr.pool_id = p.id
  AND te.code = 'fifa_wc_2026'
  AND te.is_simulation IS NOT TRUE
  AND p.is_simulation IS NOT TRUE
  AND p.archived_at IS NULL
  AND sr.prediction_kind = 'bonus_pick'
  AND sr.bonus_key = 'most_goals'
  AND sr.points = 50;

-- ---------------------------------------------------------------------------
-- Insert missing third_place / most_goals rows on partially configured pools
-- ---------------------------------------------------------------------------

INSERT INTO public.scoring_rules (pool_id, prediction_kind, bonus_key, points)
SELECT p.id, 'third_place_qualifier', NULL, 4
FROM public.pools p
INNER JOIN public.tournament_editions te ON te.id = p.tournament_edition_id
WHERE te.code = 'fifa_wc_2026'
  AND te.is_simulation IS NOT TRUE
  AND p.is_simulation IS NOT TRUE
  AND p.archived_at IS NULL
  AND EXISTS (
    SELECT 1 FROM public.scoring_rules sr WHERE sr.pool_id = p.id
  )
  AND NOT EXISTS (
    SELECT 1
    FROM public.scoring_rules sr
    WHERE sr.pool_id = p.id
      AND sr.prediction_kind = 'third_place_qualifier'
      AND sr.bonus_key IS NULL
  )
ON CONFLICT (pool_id, prediction_kind, bonus_key) DO NOTHING;

INSERT INTO public.scoring_rules (pool_id, prediction_kind, bonus_key, points)
SELECT p.id, 'bonus_pick', 'most_goals', 25
FROM public.pools p
INNER JOIN public.tournament_editions te ON te.id = p.tournament_edition_id
WHERE te.code = 'fifa_wc_2026'
  AND te.is_simulation IS NOT TRUE
  AND p.is_simulation IS NOT TRUE
  AND p.archived_at IS NULL
  AND EXISTS (
    SELECT 1 FROM public.scoring_rules sr WHERE sr.pool_id = p.id
  )
  AND NOT EXISTS (
    SELECT 1
    FROM public.scoring_rules sr
    WHERE sr.pool_id = p.id
      AND sr.prediction_kind = 'bonus_pick'
      AND sr.bonus_key = 'most_goals'
  )
ON CONFLICT (pool_id, prediction_kind, bonus_key) DO NOTHING;
