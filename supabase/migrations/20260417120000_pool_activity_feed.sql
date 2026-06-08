-- Phase 1 pool activity feed: timeline rows for joins, pick milestones, daily Ash recap.

-- ---------------------------------------------------------------------------
-- participants: first time picks reached "complete" (see lib/communications/picksCompleteness)
-- ---------------------------------------------------------------------------

ALTER TABLE public.participants
  ADD COLUMN IF NOT EXISTS picks_first_submitted_at timestamptz;

COMMENT ON COLUMN public.participants.picks_first_submitted_at IS
  'Set once when required picks first become complete; used for activity feed first submit vs update.';

-- ---------------------------------------------------------------------------
-- pool_activity
-- ---------------------------------------------------------------------------

CREATE TABLE public.pool_activity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pool_id uuid NOT NULL REFERENCES public.pools (id) ON DELETE CASCADE,
  participant_id uuid REFERENCES public.participants (id) ON DELETE SET NULL,
  actor_user_id uuid,
  type text NOT NULL CHECK (
    type IN (
      'participant_joined',
      'participant_submitted_picks',
      'participant_updated_picks',
      'ash_daily_recap'
    )
  ),
  body_text text NOT NULL,
  metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  related_path text,
  is_ai_generated boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_pool_activity_pool_created_desc
  ON public.pool_activity (pool_id, created_at DESC);

CREATE INDEX idx_pool_activity_pool_type_created_desc
  ON public.pool_activity (pool_id, type, created_at DESC);

CREATE INDEX idx_pool_activity_participant_id
  ON public.pool_activity (participant_id)
  WHERE participant_id IS NOT NULL;

-- One stored Ash recap per pool per calendar day (recap_date in metadata_json, YYYY-MM-DD).
CREATE UNIQUE INDEX pool_activity_ash_recap_one_per_pool_day
  ON public.pool_activity (pool_id, ((metadata_json->>'recap_date')))
  WHERE type = 'ash_daily_recap'
    AND metadata_json ? 'recap_date'
    AND length(trim(metadata_json->>'recap_date')) > 0;

CREATE TRIGGER pool_activity_set_updated_at
  BEFORE UPDATE ON public.pool_activity
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.pool_activity IS
  'Pool-scoped activity timeline; Phase 1 is read-only system events + daily recap.';

ALTER TABLE public.pool_activity ENABLE ROW LEVEL SECURITY;

-- Pool members and global app admins may read; writes are server-side (service role) only.
CREATE POLICY pool_activity_select_member_or_admin
  ON public.pool_activity
  FOR SELECT
  TO authenticated
  USING (
    public.ashbracket_is_admin()
    OR EXISTS (
      SELECT 1
      FROM public.participants p
      WHERE p.pool_id = pool_activity.pool_id
        AND p.user_id = auth.uid()
    )
  );
