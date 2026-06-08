-- round_of_32 bracket picks (32 teams); restore most_red_cards bonus for sample pool.

ALTER TABLE public.predictions
  DROP CONSTRAINT IF EXISTS predictions_prediction_kind_check;

ALTER TABLE public.predictions
  ADD CONSTRAINT predictions_prediction_kind_check CHECK (
    prediction_kind IN (
      'group_winner',
      'group_runner_up',
      'round_of_32',
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
      'round_of_32',
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
      'round_of_32',
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
      'round_of_32',
      'round_of_16',
      'quarterfinalist',
      'semifinalist',
      'finalist',
      'champion',
      'third_place_qualifier',
      'bonus_pick'
    )
  );

INSERT INTO public.scoring_rules (pool_id, prediction_kind, bonus_key, points)
SELECT pool_id, prediction_kind, bonus_key, points
FROM (
  VALUES
    ('a0000001-0000-4000-8000-000000000001'::uuid, 'round_of_32'::text, NULL::text, 4::numeric),
    ('a0000001-0000-4000-8000-000000000001', 'bonus_pick', 'most_red_cards', 10)
) AS v(pool_id, prediction_kind, bonus_key, points)
WHERE EXISTS (
  SELECT 1 FROM public.pools p WHERE p.id = v.pool_id
)
ON CONFLICT (pool_id, prediction_kind, bonus_key) DO UPDATE SET
  points = EXCLUDED.points;

DELETE FROM public.scoring_rules
WHERE id IN (
  SELECT sr.id
  FROM public.scoring_rules sr
  WHERE sr.pool_id = 'a0000001-0000-4000-8000-000000000001'
    AND sr.prediction_kind = 'bonus_pick'
    AND sr.bonus_key = 'golden_boot'
);
