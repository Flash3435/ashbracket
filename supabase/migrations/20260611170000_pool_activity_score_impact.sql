-- AshBot score-impact activity rows after successful ledger recompute.

ALTER TABLE public.pool_activity
  DROP CONSTRAINT IF EXISTS pool_activity_type_check;

ALTER TABLE public.pool_activity
  ADD CONSTRAINT pool_activity_type_check CHECK (
    type IN (
      'participant_joined',
      'participant_submitted_picks',
      'participant_updated_picks',
      'ash_daily_recap',
      'announcement',
      'pool_milestone',
      'pool_insight',
      'ash_score_impact'
    )
  );

CREATE UNIQUE INDEX IF NOT EXISTS pool_activity_score_impact_one_per_pool_source_key
  ON public.pool_activity (pool_id, ((metadata_json->>'source_key')))
  WHERE type = 'ash_score_impact'
    AND metadata_json ? 'source_key'
    AND length(trim(metadata_json->>'source_key')) > 0;

COMMENT ON INDEX public.pool_activity_score_impact_one_per_pool_source_key IS
  'Prevents duplicate AshBot score-impact rows for the same pool/recompute signature.';
