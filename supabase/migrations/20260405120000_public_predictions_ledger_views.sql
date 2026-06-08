-- Public read-only views for participant detail (anon + authenticated SELECT).
-- Same pattern as leaderboard_public: security_invoker = false, owner reads base tables.
-- Excludes ledger `note` and any participant email / payment / notes columns.

CREATE VIEW public.predictions_public
WITH (security_invoker = false)
AS
SELECT
  pr.id AS prediction_id,
  pr.participant_id,
  pr.pool_id,
  pr.prediction_kind,
  pr.group_code,
  pr.slot_key,
  pr.bonus_key,
  ts.code AS stage_code,
  ts.label AS stage_label,
  ts.sort_order AS stage_sort_order,
  t.name AS team_name,
  t.country_code AS team_country_code
FROM public.predictions pr
INNER JOIN public.participants par ON par.id = pr.participant_id
INNER JOIN public.pools pl ON pl.id = pr.pool_id AND pl.is_public IS TRUE
LEFT JOIN public.tournament_stages ts ON ts.id = pr.tournament_stage_id
LEFT JOIN public.teams t ON t.id = pr.team_id;

COMMENT ON VIEW public.predictions_public IS
  'Picks for participants in public pools only. Team/stage labels only; no admin fields.';

GRANT SELECT ON public.predictions_public TO anon, authenticated;

CREATE VIEW public.points_ledger_public
WITH (security_invoker = false)
AS
SELECT
  l.id,
  l.participant_id,
  l.pool_id,
  l.points_delta,
  l.prediction_kind,
  l.created_at,
  l.prediction_id,
  l.result_id
FROM public.points_ledger l
INNER JOIN public.participants par ON par.id = l.participant_id
INNER JOIN public.pools pl ON pl.id = l.pool_id AND pl.is_public IS TRUE;

COMMENT ON VIEW public.points_ledger_public IS
  'Ledger rows for public pools only. Omits internal note text.';

GRANT SELECT ON public.points_ledger_public TO anon, authenticated;
