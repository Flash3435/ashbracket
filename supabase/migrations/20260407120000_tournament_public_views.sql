-- Public read-only surfaces for official tournament progress (anon + authenticated).
-- Base tables `tournament_editions` / `tournament_matches` remain admin-only via RLS.

CREATE OR REPLACE VIEW public.tournament_editions_public
WITH (security_invoker = false)
AS
SELECT
  id,
  code,
  name,
  starts_on,
  ends_on
FROM public.tournament_editions;

CREATE OR REPLACE VIEW public.tournament_public_matches
WITH (security_invoker = false)
AS
SELECT
  m.id AS match_id,
  m.edition_id,
  e.code AS edition_code,
  m.match_code,
  m.stage_code,
  COALESCE(ts.label, m.stage_code) AS stage_label,
  COALESCE(ts.sort_order, 0) AS stage_sort_order,
  m.group_code,
  m.round_index,
  m.kickoff_at,
  m.status,
  m.home_goals,
  m.away_goals,
  m.home_penalties,
  m.away_penalties,
  ht.name AS home_team_name,
  ht.country_code AS home_country_code,
  at.name AS away_team_name,
  at.country_code AS away_country_code,
  wt.name AS winner_team_name,
  wt.country_code AS winner_country_code
FROM public.tournament_matches m
INNER JOIN public.tournament_editions e ON e.id = m.edition_id
LEFT JOIN public.tournament_stages ts ON ts.code = m.stage_code
LEFT JOIN public.teams ht ON ht.id = m.home_team_id
LEFT JOIN public.teams at ON at.id = m.away_team_id
LEFT JOIN public.teams wt ON wt.id = m.winner_team_id;

COMMENT ON VIEW public.tournament_editions_public IS
  'Edition metadata for public tournament pages (no internal timestamps).';

COMMENT ON VIEW public.tournament_public_matches IS
  'Official schedule and scores with team labels. Omits sync_locked, last_sync_at, and scoring-slot admin fields.';

GRANT SELECT ON public.tournament_editions_public TO anon, authenticated;
GRANT SELECT ON public.tournament_public_matches TO anon, authenticated;
