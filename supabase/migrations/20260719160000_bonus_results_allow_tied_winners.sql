-- Allow multiple winning teams per tournament bonus category (tied leaders).
-- Non-bonus result kinds keep one-row-per-slot uniqueness.
-- Bonus picks: one row per (edition, stage, category, team).

DROP INDEX IF EXISTS public.results_one_per_slot_per_edition;

CREATE UNIQUE INDEX results_one_per_slot_per_edition_non_bonus
ON public.results (
  edition_id,
  tournament_stage_id,
  kind,
  group_code,
  slot_key
)
NULLS NOT DISTINCT
WHERE kind IS DISTINCT FROM 'bonus_pick';

CREATE UNIQUE INDEX results_one_bonus_team_per_edition
ON public.results (
  edition_id,
  tournament_stage_id,
  kind,
  slot_key,
  team_id
)
NULLS NOT DISTINCT
WHERE kind = 'bonus_pick';

COMMENT ON INDEX public.results_one_bonus_team_per_edition IS
  'Tournament bonus categories may have multiple winning teams when stats are tied for first.';
