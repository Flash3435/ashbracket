-- Pool setting: show template AshBot commentary on the activity feed (default on).

ALTER TABLE public.pools
  ADD COLUMN IF NOT EXISTS ashbot_enabled boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.pools.ashbot_enabled IS
  'When true, the pool activity feed shows short template AshBot commentary on supported events.';
