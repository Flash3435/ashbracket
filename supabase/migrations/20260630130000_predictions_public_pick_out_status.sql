-- Expose knockout "pick out" status on public pool pick reads (no admin metadata).
DROP VIEW IF EXISTS public.predictions_public;

CREATE OR REPLACE VIEW public.predictions_public
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
  t.country_code AS team_country_code,
  (
    pr.team_id IS NOT NULL
    AND btrim(pr.value_text) LIKE 'ab_pick_status:%'
    AND (
      substring(btrim(pr.value_text) from 16)::jsonb ->> 'status'
    ) = 'out'
  ) AS pick_is_out
FROM public.predictions pr
INNER JOIN public.participants par ON par.id = pr.participant_id
INNER JOIN public.pools pl ON pl.id = pr.pool_id AND pl.is_public IS TRUE
LEFT JOIN public.tournament_stages ts ON ts.id = pr.tournament_stage_id
LEFT JOIN public.teams t ON t.id = pr.team_id;

COMMENT ON VIEW public.predictions_public IS
  'Picks for participants in public pools only. Includes pick_is_out for historical locked invalid knockout picks.';

GRANT SELECT ON public.predictions_public TO anon, authenticated;
