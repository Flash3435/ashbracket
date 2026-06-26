-- Official WC 2026 Round of 32 shell fixtures (M73–M88).
-- Canonical kickoffs from lib/tournament/wc2026KnockoutFixtures.json.
-- Teams are published progressively via publishConfirmedRoundOf32Fixtures.

INSERT INTO public.tournament_matches (
  edition_id,
  match_code,
  stage_code,
  group_code,
  round_index,
  kickoff_at,
  status,
  home_team_id,
  away_team_id
)
SELECT
  te.id,
  v.match_code,
  'round_of_32',
  NULL,
  v.round_index,
  v.kickoff_at,
  'scheduled',
  NULL,
  NULL
FROM public.tournament_editions AS te
CROSS JOIN (
  VALUES
    ('M73', 0, '2026-06-28T19:00:00Z'::timestamptz),
    ('M74', 1, '2026-06-29T20:30:00Z'::timestamptz),
    ('M75', 2, '2026-06-30T01:00:00Z'::timestamptz),
    ('M76', 3, '2026-06-29T17:00:00Z'::timestamptz),
    ('M77', 4, '2026-06-30T21:00:00Z'::timestamptz),
    ('M78', 5, '2026-06-30T17:00:00Z'::timestamptz),
    ('M79', 6, '2026-07-01T02:00:00Z'::timestamptz),
    ('M80', 7, '2026-07-01T16:00:00Z'::timestamptz),
    ('M81', 8, '2026-07-02T00:00:00Z'::timestamptz),
    ('M82', 9, '2026-07-01T20:00:00Z'::timestamptz),
    ('M83', 10, '2026-07-02T23:00:00Z'::timestamptz),
    ('M84', 11, '2026-07-02T19:00:00Z'::timestamptz),
    ('M85', 12, '2026-07-03T03:00:00Z'::timestamptz),
    ('M86', 13, '2026-07-03T22:00:00Z'::timestamptz),
    ('M87', 14, '2026-07-04T01:30:00Z'::timestamptz),
    ('M88', 15, '2026-07-03T18:00:00Z'::timestamptz)
) AS v(match_code, round_index, kickoff_at)
WHERE te.code = 'fifa_wc_2026'
  AND te.is_simulation IS NOT TRUE
ON CONFLICT (edition_id, match_code) DO UPDATE
SET
  stage_code = EXCLUDED.stage_code,
  round_index = EXCLUDED.round_index,
  kickoff_at = EXCLUDED.kickoff_at,
  updated_at = now()
WHERE public.tournament_matches.home_team_id IS NULL
  AND public.tournament_matches.away_team_id IS NULL;
