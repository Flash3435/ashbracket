-- Pool insight cards: engagement trends (pre-lock) and aggregate pick stats (post-lock).

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
      'pool_insight'
    )
  );

-- One insight row per pool per source_key (e.g. prelock_completion_percent_75).
CREATE UNIQUE INDEX pool_activity_insight_one_per_pool_source_key
  ON public.pool_activity (pool_id, ((metadata_json->>'source_key')))
  WHERE type = 'pool_insight'
    AND metadata_json ? 'source_key'
    AND length(trim(metadata_json->>'source_key')) > 0;
