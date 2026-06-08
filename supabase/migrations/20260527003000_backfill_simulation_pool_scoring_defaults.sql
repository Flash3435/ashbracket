-- Simulation pools created for World Cup testing should score by default.
-- Backfill only pools that are tied to simulation editions and still have no
-- scoring configuration at all (no group points and no scoring_rules rows).

WITH target_pools AS (
  SELECT p.id
  FROM public.pools p
  INNER JOIN public.tournament_editions e
    ON e.id = p.tournament_edition_id
  WHERE p.is_simulation IS TRUE
    AND e.is_simulation IS TRUE
    AND p.group_advance_exact_points IS NULL
    AND p.group_advance_wrong_slot_points IS NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.scoring_rules sr
      WHERE sr.pool_id = p.id
    )
)
UPDATE public.pools p
SET
  group_advance_exact_points = 3,
  group_advance_wrong_slot_points = 1
WHERE p.id IN (SELECT id FROM target_pools);

WITH target_pools AS (
  SELECT p.id
  FROM public.pools p
  INNER JOIN public.tournament_editions e
    ON e.id = p.tournament_edition_id
  WHERE p.is_simulation IS TRUE
    AND e.is_simulation IS TRUE
    AND p.group_advance_exact_points = 3
    AND p.group_advance_wrong_slot_points = 1
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
    ('third_place_qualifier'::text, NULL::text, 2::numeric),
    ('round_of_16', NULL, 4),
    ('quarterfinalist', NULL, 8),
    ('semifinalist', NULL, 16),
    ('finalist', NULL, 24),
    ('champion', NULL, 32),
    ('bonus_pick', 'most_goals', 50),
    ('bonus_pick', 'most_yellow_cards', 10),
    ('bonus_pick', 'most_red_cards', 10)
) AS seed(prediction_kind, bonus_key, points)
ON CONFLICT (pool_id, prediction_kind, bonus_key) DO UPDATE SET
  points = EXCLUDED.points;
