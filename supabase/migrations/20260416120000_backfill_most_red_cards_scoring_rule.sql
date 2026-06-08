-- Pools that have any bonus_pick scoring row but no most_red_cards (legacy / partial configs)
-- get the standard third bonus question so scoring and public rules stay aligned with the app.

INSERT INTO public.scoring_rules (pool_id, prediction_kind, bonus_key, points)
SELECT DISTINCT sr.pool_id, 'bonus_pick', 'most_red_cards', 10
FROM public.scoring_rules sr
WHERE sr.prediction_kind = 'bonus_pick'
  AND NOT EXISTS (
    SELECT 1
    FROM public.scoring_rules x
    WHERE x.pool_id = sr.pool_id
      AND x.prediction_kind = 'bonus_pick'
      AND x.bonus_key = 'most_red_cards'
  )
ON CONFLICT (pool_id, prediction_kind, bonus_key) DO UPDATE SET
  points = EXCLUDED.points;
