-- AshBracket sample seed — safe to edit or replace.
-- Stable pool id (change in one place if you fork this seed):
--   a0000001-0000-4000-8000-000000000001

-- ---------------------------------------------------------------------------
-- Tournament stages (codes must match src/types/domain.ts TournamentStageCode)
-- ---------------------------------------------------------------------------

INSERT INTO public.tournament_stages (code, label, sort_order, starts_at, ends_at)
VALUES
  ('group', 'Group stage', 10, '2026-06-11 00:00:00+00', '2026-06-26 23:59:59+00'),
  ('round_of_32', 'Round of 32', 15, '2026-06-27 00:00:00+00', '2026-06-28 23:59:59+00'),
  ('round_of_16', 'Round of 16', 20, '2026-06-29 00:00:00+00', '2026-06-30 23:59:59+00'),
  ('quarterfinal', 'Quarter-finals', 30, '2026-07-04 00:00:00+00', '2026-07-05 23:59:59+00'),
  ('semifinal', 'Semi-finals', 40, '2026-07-08 00:00:00+00', '2026-07-09 23:59:59+00'),
  ('third_place', 'Third place', 50, '2026-07-11 12:00:00+00', '2026-07-11 23:59:59+00'),
  ('final', 'Final', 60, '2026-07-12 18:00:00+00', '2026-07-12 23:59:59+00')
ON CONFLICT (code) DO UPDATE SET
  label = EXCLUDED.label,
  sort_order = EXCLUDED.sort_order,
  starts_at = EXCLUDED.starts_at,
  ends_at = EXCLUDED.ends_at;

-- ---------------------------------------------------------------------------
-- Teams (small sample; country_code uppercase per schema check)
-- ---------------------------------------------------------------------------

INSERT INTO public.teams (name, country_code, fifa_code)
VALUES
  ('United States', 'USA', 'USA'),
  ('Canada', 'CAN', 'CAN'),
  ('Mexico', 'MEX', 'MEX'),
  ('Brazil', 'BRA', 'BRA'),
  ('Argentina', 'ARG', 'ARG'),
  ('France', 'FRA', 'FRA'),
  ('Germany', 'GER', 'GER'),
  ('Spain', 'ESP', 'ESP')
ON CONFLICT (country_code) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Sample pool + scoring + participants (idempotent for this pool id)
-- ---------------------------------------------------------------------------

DELETE FROM public.pools WHERE id = 'a0000001-0000-4000-8000-000000000001';

INSERT INTO public.pools (
  id,
  name,
  lock_at,
  is_public,
  join_code,
  entry_fee_cents,
  prize_distribution_json,
  group_advance_exact_points,
  group_advance_wrong_slot_points,
  tie_break_note
)
VALUES (
  'a0000001-0000-4000-8000-000000000001',
  'AshBracket 2026',
  '2026-06-10 23:59:00+00',
  true,
  'ASH2026',
  2500,
  '[
    {"place": 1, "label": "1st place", "percent": 50},
    {"place": 2, "label": "2nd place", "percent": 25},
    {"place": 3, "label": "3rd place", "percent": 15},
    {"place": 4, "label": "4th place", "percent": 10}
  ]'::jsonb,
  5,
  2.5,
  'If two or more users finish with the same total score, the prize money for the tied positions is combined and split equally among those tied users.

Examples:
• If two users tie for 1st, they split 1st and 2nd prize money evenly.
• If three users tie across 2nd to 4th, they split the combined 2nd, 3rd, and 4th prize money evenly.'
);

-- Legacy spreadsheet scoring: knockout + per-bonus rows. Group stage uses pool columns above.
INSERT INTO public.scoring_rules (pool_id, prediction_kind, bonus_key, points)
VALUES
  ('a0000001-0000-4000-8000-000000000001', 'round_of_32', NULL, 4),
  ('a0000001-0000-4000-8000-000000000001', 'round_of_16', NULL, 5),
  ('a0000001-0000-4000-8000-000000000001', 'quarterfinalist', NULL, 10),
  ('a0000001-0000-4000-8000-000000000001', 'semifinalist', NULL, 20),
  ('a0000001-0000-4000-8000-000000000001', 'finalist', NULL, 50),
  ('a0000001-0000-4000-8000-000000000001', 'champion', NULL, 100),
  ('a0000001-0000-4000-8000-000000000001', 'third_place_qualifier', NULL, 3),
  ('a0000001-0000-4000-8000-000000000001', 'bonus_pick', 'most_goals', 50),
  ('a0000001-0000-4000-8000-000000000001', 'bonus_pick', 'most_yellow_cards', 10),
  ('a0000001-0000-4000-8000-000000000001', 'bonus_pick', 'most_red_cards', 10)
ON CONFLICT (pool_id, prediction_kind, bonus_key) DO UPDATE SET
  points = EXCLUDED.points;

INSERT INTO public.participants (
  pool_id,
  display_name,
  email,
  is_paid,
  paid_at,
  notes
)
VALUES
  (
    'a0000001-0000-4000-8000-000000000001',
    'Jordan Lee',
    'jordan@example.com',
    true,
    '2026-03-15 14:30:00+00',
    NULL
  ),
  (
    'a0000001-0000-4000-8000-000000000001',
    'Sam Rivera',
    'sam@example.com',
    false,
    NULL,
    'Invited — payment pending'
  ),
  (
    'a0000001-0000-4000-8000-000000000001',
    'Morgan Quinn',
    'morgan@example.com',
    true,
    '2026-03-18 09:00:00+00',
    'Paid via organizer (cash)'
  );
