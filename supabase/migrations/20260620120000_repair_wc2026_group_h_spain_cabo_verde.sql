-- Repair official WC2026 Group H opener: Spain vs Cabo Verde (WC2026-G-H-01).
-- Live score sync missed this row (provider home/away reversal); KSA–URU (H-02) was applied.
-- Official result: 0–0 draw (15 June 2026, Atlanta).

UPDATE public.tournament_matches AS m
SET
  home_goals = 0,
  away_goals = 0,
  home_penalties = NULL,
  away_penalties = NULL,
  winner_team_id = NULL,
  status = 'finished'
FROM public.tournament_editions AS te
WHERE m.edition_id = te.id
  AND te.code = 'fifa_wc_2026'
  AND te.is_simulation IS NOT TRUE
  AND m.match_code = 'WC2026-G-H-01'
  AND m.stage_code = 'group'
  AND m.group_code = 'H'
  AND m.status = 'scheduled'
  AND m.home_goals IS NULL
  AND m.away_goals IS NULL;
