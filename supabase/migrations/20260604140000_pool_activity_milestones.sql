-- Pool milestone cards: completion thresholds, deadline/lock moments, post-lock insights.

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
      'pool_milestone'
    )
  );

-- One milestone row per pool per source_key (e.g. completion_50, lock_today).
CREATE UNIQUE INDEX pool_activity_milestone_one_per_pool_source_key
  ON public.pool_activity (pool_id, ((metadata_json->>'source_key')))
  WHERE type = 'pool_milestone'
    AND metadata_json ? 'source_key'
    AND length(trim(metadata_json->>'source_key')) > 0;
