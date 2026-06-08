-- Track admin reminder sends (e.g. incomplete bracket nudges before lock).

CREATE TABLE public.pool_reminder_sends (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pool_id uuid NOT NULL REFERENCES public.pools (id) ON DELETE CASCADE,
  reminder_type text NOT NULL,
  recipient_count integer NOT NULL CHECK (recipient_count >= 0),
  sent_at timestamptz NOT NULL DEFAULT now(),
  sent_by_user_id uuid REFERENCES auth.users (id) ON DELETE SET NULL
);

CREATE INDEX idx_pool_reminder_sends_pool_type_sent
  ON public.pool_reminder_sends (pool_id, reminder_type, sent_at DESC);

COMMENT ON TABLE public.pool_reminder_sends IS
  'Append-only log of pool organizer reminder emails (incomplete picks, etc.).';

ALTER TABLE public.pool_reminder_sends ENABLE ROW LEVEL SECURITY;

CREATE POLICY pool_reminder_sends_select_manage
  ON public.pool_reminder_sends
  FOR SELECT
  TO authenticated
  USING (public.ashbracket_can_manage_pool(pool_id));

CREATE POLICY pool_reminder_sends_insert_manage
  ON public.pool_reminder_sends
  FOR INSERT
  TO authenticated
  WITH CHECK (public.ashbracket_can_manage_pool(pool_id));
