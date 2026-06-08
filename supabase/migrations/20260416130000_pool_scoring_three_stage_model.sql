-- Three-stage pool scoring: group 3/1, third-place qualifiers 2 pts each,
-- knockout points once per team by furthest round (R16→champion), no separate Round of 32 points.

UPDATE public.pools
SET
  group_advance_exact_points = 3,
  group_advance_wrong_slot_points = 1
WHERE id = 'a0000001-0000-4000-8000-000000000001';

DELETE FROM public.scoring_rules
WHERE pool_id = 'a0000001-0000-4000-8000-000000000001'
  AND prediction_kind = 'round_of_32';

UPDATE public.scoring_rules
SET points = 2
WHERE pool_id = 'a0000001-0000-4000-8000-000000000001'
  AND prediction_kind = 'third_place_qualifier'
  AND bonus_key IS NULL;

UPDATE public.scoring_rules
SET points = 4
WHERE pool_id = 'a0000001-0000-4000-8000-000000000001'
  AND prediction_kind = 'round_of_16'
  AND bonus_key IS NULL;

UPDATE public.scoring_rules
SET points = 8
WHERE pool_id = 'a0000001-0000-4000-8000-000000000001'
  AND prediction_kind = 'quarterfinalist'
  AND bonus_key IS NULL;

UPDATE public.scoring_rules
SET points = 16
WHERE pool_id = 'a0000001-0000-4000-8000-000000000001'
  AND prediction_kind = 'semifinalist'
  AND bonus_key IS NULL;

UPDATE public.scoring_rules
SET points = 24
WHERE pool_id = 'a0000001-0000-4000-8000-000000000001'
  AND prediction_kind = 'finalist'
  AND bonus_key IS NULL;

UPDATE public.scoring_rules
SET points = 32
WHERE pool_id = 'a0000001-0000-4000-8000-000000000001'
  AND prediction_kind = 'champion'
  AND bonus_key IS NULL;
