-- 2026 rules: round_of_16 and third_place_qualifier picks; golden_boot bonus.
-- Expands CHECK constraints; backfills sample pool scoring; removes most_red_cards bonus rows.

-- ---------------------------------------------------------------------------
-- prediction_kind / results.kind enumerations
-- ---------------------------------------------------------------------------

ALTER TABLE public.predictions
  DROP CONSTRAINT IF EXISTS predictions_prediction_kind_check;

ALTER TABLE public.predictions
  ADD CONSTRAINT predictions_prediction_kind_check CHECK (
    prediction_kind IN (
      'group_winner',
      'group_runner_up',
      'round_of_16',
      'quarterfinalist',
      'semifinalist',
      'finalist',
      'champion',
      'third_place_qualifier',
      'bonus_pick'
    )
  );

ALTER TABLE public.results
  DROP CONSTRAINT IF EXISTS results_kind_check;

ALTER TABLE public.results
  ADD CONSTRAINT results_kind_check CHECK (
    kind IN (
      'group_winner',
      'group_runner_up',
      'round_of_16',
      'quarterfinalist',
      'semifinalist',
      'finalist',
      'champion',
      'third_place_qualifier',
      'bonus_pick'
    )
  );

ALTER TABLE public.scoring_rules
  DROP CONSTRAINT IF EXISTS scoring_rules_prediction_kind_check;

ALTER TABLE public.scoring_rules
  ADD CONSTRAINT scoring_rules_prediction_kind_check CHECK (
    prediction_kind IN (
      'group_winner',
      'group_runner_up',
      'round_of_16',
      'quarterfinalist',
      'semifinalist',
      'finalist',
      'champion',
      'third_place_qualifier',
      'bonus_pick'
    )
  );

ALTER TABLE public.points_ledger
  DROP CONSTRAINT IF EXISTS points_ledger_prediction_kind_ok;

ALTER TABLE public.points_ledger
  ADD CONSTRAINT points_ledger_prediction_kind_ok CHECK (
    prediction_kind IS NULL
    OR prediction_kind IN (
      'group_winner',
      'group_runner_up',
      'round_of_16',
      'quarterfinalist',
      'semifinalist',
      'finalist',
      'champion',
      'third_place_qualifier',
      'bonus_pick'
    )
  );

-- tournament_matches.scoring_result_kind still allows the original kind set;
-- if match-to-result sync needs round_of_16 / third_place_qualifier later, add a follow-up migration.

-- ---------------------------------------------------------------------------
-- Sample pool scoring (id from seed)
-- ---------------------------------------------------------------------------

DELETE FROM public.scoring_rules
WHERE prediction_kind = 'bonus_pick'
  AND bonus_key = 'most_red_cards';

INSERT INTO public.scoring_rules (pool_id, prediction_kind, bonus_key, points)
SELECT pool_id, prediction_kind, bonus_key, points
FROM (
  VALUES
    ('a0000001-0000-4000-8000-000000000001'::uuid, 'round_of_16'::text, NULL::text, 5::numeric),
    ('a0000001-0000-4000-8000-000000000001', 'quarterfinalist', NULL, 10),
    ('a0000001-0000-4000-8000-000000000001', 'semifinalist', NULL, 20),
    ('a0000001-0000-4000-8000-000000000001', 'finalist', NULL, 50),
    ('a0000001-0000-4000-8000-000000000001', 'champion', NULL, 100),
    ('a0000001-0000-4000-8000-000000000001', 'third_place_qualifier', NULL, 3),
    ('a0000001-0000-4000-8000-000000000001', 'bonus_pick', 'most_goals', 50),
    ('a0000001-0000-4000-8000-000000000001', 'bonus_pick', 'most_yellow_cards', 10),
    ('a0000001-0000-4000-8000-000000000001', 'bonus_pick', 'golden_boot', 25)
) AS v(pool_id, prediction_kind, bonus_key, points)
WHERE EXISTS (
  SELECT 1 FROM public.pools p WHERE p.id = v.pool_id
)
ON CONFLICT (pool_id, prediction_kind, bonus_key) DO UPDATE SET
  points = EXCLUDED.points;
