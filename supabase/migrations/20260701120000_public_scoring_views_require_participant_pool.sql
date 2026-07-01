-- Public scoring views must scope rows to the participant's current pool.
-- Without `*.pool_id = par.pool_id`, orphan ledger/prediction rows from another pool
-- can appear on a participant profile while leaderboard_public totals stay 0.

DROP VIEW IF EXISTS public.predictions_public;
DROP VIEW IF EXISTS public.points_ledger_public;

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
INNER JOIN public.participants par
  ON par.id = pr.participant_id
  AND par.pool_id = pr.pool_id
INNER JOIN public.pools pl
  ON pl.id = par.pool_id
  AND pl.is_public IS TRUE
LEFT JOIN public.tournament_stages ts ON ts.id = pr.tournament_stage_id
LEFT JOIN public.teams t ON t.id = pr.team_id;

COMMENT ON VIEW public.predictions_public IS
  'Picks for participants in public pools only. Rows are limited to each participant''s current pool.';

GRANT SELECT ON public.predictions_public TO anon, authenticated;

CREATE OR REPLACE VIEW public.points_ledger_public
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
INNER JOIN public.participants par
  ON par.id = l.participant_id
  AND par.pool_id = l.pool_id
INNER JOIN public.pools pl
  ON pl.id = par.pool_id
  AND pl.is_public IS TRUE;

COMMENT ON VIEW public.points_ledger_public IS
  'Ledger rows for public pools only. Rows are limited to each participant''s current pool.';

GRANT SELECT ON public.points_ledger_public TO anon, authenticated;

-- Back up orphan rows before deletion (idempotent: skip rows already backed up).
CREATE TABLE IF NOT EXISTS public.scoring_orphan_ledger_backup_20260701 (
  LIKE public.points_ledger INCLUDING ALL
);

ALTER TABLE public.scoring_orphan_ledger_backup_20260701
  ADD COLUMN IF NOT EXISTS backed_up_at timestamptz NOT NULL DEFAULT now();

INSERT INTO public.scoring_orphan_ledger_backup_20260701 (
  id,
  pool_id,
  participant_id,
  points_delta,
  prediction_kind,
  prediction_id,
  result_id,
  note,
  created_at,
  backed_up_at
)
SELECT
  l.id,
  l.pool_id,
  l.participant_id,
  l.points_delta,
  l.prediction_kind,
  l.prediction_id,
  l.result_id,
  l.note,
  l.created_at,
  now()
FROM public.points_ledger l
INNER JOIN public.participants par ON par.id = l.participant_id
WHERE l.pool_id IS DISTINCT FROM par.pool_id
  AND NOT EXISTS (
    SELECT 1
    FROM public.scoring_orphan_ledger_backup_20260701 b
    WHERE b.id = l.id
  );

CREATE TABLE IF NOT EXISTS public.scoring_orphan_predictions_backup_20260701 (
  LIKE public.predictions INCLUDING ALL
);

ALTER TABLE public.scoring_orphan_predictions_backup_20260701
  ADD COLUMN IF NOT EXISTS backed_up_at timestamptz NOT NULL DEFAULT now();

INSERT INTO public.scoring_orphan_predictions_backup_20260701
SELECT
  pr.*,
  now() AS backed_up_at
FROM public.predictions pr
INNER JOIN public.participants par ON par.id = pr.participant_id
WHERE pr.pool_id IS DISTINCT FROM par.pool_id
  AND NOT EXISTS (
    SELECT 1
    FROM public.scoring_orphan_predictions_backup_20260701 b
    WHERE b.id = pr.id
  );

-- Remove historical orphan rows that cannot contribute to leaderboard totals.
-- Ledger lines are rebuildable via pool recompute from in-pool predictions.
DELETE FROM public.points_ledger l
USING public.participants par
WHERE l.participant_id = par.id
  AND l.pool_id IS DISTINCT FROM par.pool_id;

DELETE FROM public.predictions pr
USING public.participants par
WHERE pr.participant_id = par.id
  AND pr.pool_id IS DISTINCT FROM par.pool_id;

-- Prevent future pool/participant mismatches on write.
CREATE OR REPLACE FUNCTION public.ashbracket_enforce_participant_pool_match()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.participants par
    WHERE par.id = NEW.participant_id
      AND par.pool_id = NEW.pool_id
  ) THEN
    RAISE EXCEPTION
      'participant_id % is not a member of pool_id %',
      NEW.participant_id,
      NEW.pool_id
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS points_ledger_participant_pool_match ON public.points_ledger;
CREATE TRIGGER points_ledger_participant_pool_match
  BEFORE INSERT OR UPDATE OF pool_id, participant_id
  ON public.points_ledger
  FOR EACH ROW
  EXECUTE FUNCTION public.ashbracket_enforce_participant_pool_match();

DROP TRIGGER IF EXISTS predictions_participant_pool_match ON public.predictions;
CREATE TRIGGER predictions_participant_pool_match
  BEFORE INSERT OR UPDATE OF pool_id, participant_id
  ON public.predictions
  FOR EACH ROW
  EXECUTE FUNCTION public.ashbracket_enforce_participant_pool_match();
