-- Activity feed reactions + admin announcements.
-- Restores pool_activity SELECT for all pool participants (not only rows tied to their participant_id).

-- ---------------------------------------------------------------------------
-- Helper: pool participant membership (SECURITY DEFINER avoids participants RLS)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.ashbracket_private_is_pool_participant(p_pool_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.participants p
    WHERE p.pool_id = p_pool_id
      AND p.user_id = auth.uid()
  );
$$;

REVOKE ALL ON FUNCTION public.ashbracket_private_is_pool_participant(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ashbracket_private_is_pool_participant(uuid) TO authenticated;

COMMENT ON FUNCTION public.ashbracket_private_is_pool_participant(uuid) IS
  'True when auth.uid() has a participants row in the pool; used by activity feed RLS.';

-- ---------------------------------------------------------------------------
-- pool_activity: add announcement type
-- ---------------------------------------------------------------------------

ALTER TABLE public.pool_activity
  DROP CONSTRAINT IF EXISTS pool_activity_type_check;

ALTER TABLE public.pool_activity
  ADD CONSTRAINT pool_activity_type_check CHECK (
    type IN (
      'participant_joined',
      'participant_submitted_picks',
      'participant_updated_picks',
      'ash_daily_recap',
      'announcement'
    )
  );

-- ---------------------------------------------------------------------------
-- pool_activity SELECT: all pool members see the full feed
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS pool_activity_select_member_or_admin ON public.pool_activity;

CREATE POLICY pool_activity_select_member_or_admin
  ON public.pool_activity
  FOR SELECT
  TO authenticated
  USING (
    public.ashbracket_is_global_admin()
    OR public.ashbracket_can_manage_pool(pool_id)
    OR public.ashbracket_private_is_pool_participant(pool_id)
  );

-- ---------------------------------------------------------------------------
-- activity_reactions
-- ---------------------------------------------------------------------------

CREATE TABLE public.activity_reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id uuid NOT NULL REFERENCES public.pool_activity (id) ON DELETE CASCADE,
  pool_id uuid NOT NULL REFERENCES public.pools (id) ON DELETE CASCADE,
  participant_id uuid NOT NULL REFERENCES public.participants (id) ON DELETE CASCADE,
  reaction text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT activity_reactions_activity_participant_unique UNIQUE (activity_id, participant_id),
  CONSTRAINT activity_reactions_reaction_check CHECK (
    reaction IN ('👍', '😂', '🔥', '🏆', '👀', '😬')
  )
);

CREATE INDEX idx_activity_reactions_activity_id
  ON public.activity_reactions (activity_id);

CREATE INDEX idx_activity_reactions_pool_id
  ON public.activity_reactions (pool_id);

CREATE TRIGGER activity_reactions_set_updated_at
  BEFORE UPDATE ON public.activity_reactions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.activity_reactions IS
  'One emoji reaction per pool participant per activity feed item.';

ALTER TABLE public.activity_reactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY activity_reactions_select_pool_member
  ON public.activity_reactions
  FOR SELECT
  TO authenticated
  USING (
    public.ashbracket_is_global_admin()
    OR public.ashbracket_can_manage_pool(pool_id)
    OR public.ashbracket_private_is_pool_participant(pool_id)
  );

CREATE POLICY activity_reactions_insert_own
  ON public.activity_reactions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.participants p
      WHERE p.id = activity_reactions.participant_id
        AND p.pool_id = activity_reactions.pool_id
        AND p.user_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1
      FROM public.pool_activity pa
      WHERE pa.id = activity_reactions.activity_id
        AND pa.pool_id = activity_reactions.pool_id
    )
  );

CREATE POLICY activity_reactions_update_own
  ON public.activity_reactions
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.participants p
      WHERE p.id = activity_reactions.participant_id
        AND p.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.participants p
      WHERE p.id = activity_reactions.participant_id
        AND p.pool_id = activity_reactions.pool_id
        AND p.user_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1
      FROM public.pool_activity pa
      WHERE pa.id = activity_reactions.activity_id
        AND pa.pool_id = activity_reactions.pool_id
    )
  );

CREATE POLICY activity_reactions_delete_own
  ON public.activity_reactions
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.participants p
      WHERE p.id = activity_reactions.participant_id
        AND p.user_id = auth.uid()
    )
  );
