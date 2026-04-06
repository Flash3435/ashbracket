-- Ensure the default sample pool (ashbracket seed id) has full public rules data:
-- prize breakdown, tie-break copy, and per-bonus scoring rows (older DBs often had
-- only one bonus_pick row under the old UNIQUE(pool_id, prediction_kind) constraint).

-- Prize tiers: 50 / 25 / 15 / remaining 10% (4th place).
UPDATE public.pools
SET
  prize_distribution_json = '[
    {"place": 1, "label": "1st place", "percent": 50},
    {"place": 2, "label": "2nd place", "percent": 25},
    {"place": 3, "label": "3rd place", "percent": 15},
    {"place": 4, "label": "4th place", "percent": 10, "remainder": true}
  ]'::jsonb
WHERE id = 'a0000001-0000-4000-8000-000000000001'
  AND (
    prize_distribution_json IS NULL
    OR prize_distribution_json = '[]'::jsonb
    OR jsonb_typeof(prize_distribution_json) <> 'array'
    OR (
      jsonb_typeof(prize_distribution_json) = 'array'
      AND jsonb_array_length(prize_distribution_json) < 4
    )
  );

UPDATE public.pools
SET tie_break_note = 'If total points are tied, the organizer decides the tie-break rule.'
WHERE id = 'a0000001-0000-4000-8000-000000000001'
  AND (tie_break_note IS NULL OR btrim(tie_break_note) = '');

INSERT INTO public.scoring_rules (pool_id, prediction_kind, bonus_key, points)
VALUES
  ('a0000001-0000-4000-8000-000000000001', 'quarterfinalist', NULL, 10),
  ('a0000001-0000-4000-8000-000000000001', 'semifinalist', NULL, 20),
  ('a0000001-0000-4000-8000-000000000001', 'finalist', NULL, 50),
  ('a0000001-0000-4000-8000-000000000001', 'champion', NULL, 100),
  ('a0000001-0000-4000-8000-000000000001', 'bonus_pick', 'most_goals', 50),
  ('a0000001-0000-4000-8000-000000000001', 'bonus_pick', 'most_yellow_cards', 10),
  ('a0000001-0000-4000-8000-000000000001', 'bonus_pick', 'most_red_cards', 10)
ON CONFLICT (pool_id, prediction_kind, bonus_key) DO UPDATE SET
  points = EXCLUDED.points;
