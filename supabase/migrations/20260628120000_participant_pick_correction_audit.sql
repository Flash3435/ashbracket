-- Admin audit trail for post-kickoff knockout pick corrections.

CREATE TABLE public.participant_pick_correction_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pool_id uuid NOT NULL REFERENCES public.pools (id) ON DELETE CASCADE,
  participant_id uuid NOT NULL REFERENCES public.participants (id) ON DELETE CASCADE,
  actor_user_id uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  actor_email text,
  match_code text NOT NULL,
  old_team_id uuid REFERENCES public.teams (id) ON DELETE SET NULL,
  new_team_id uuid NOT NULL REFERENCES public.teams (id) ON DELETE RESTRICT,
  old_team_country_code text,
  new_team_country_code text,
  reason text NOT NULL,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_participant_pick_correction_audit_pool_id
  ON public.participant_pick_correction_audit (pool_id, created_at DESC);

CREATE INDEX idx_participant_pick_correction_audit_participant_id
  ON public.participant_pick_correction_audit (participant_id, created_at DESC);

COMMENT ON TABLE public.participant_pick_correction_audit IS
  'Append-only audit trail when pool managers correct locked knockout picks after kickoff.';

ALTER TABLE public.participant_pick_correction_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY participant_pick_correction_audit_select_manage
  ON public.participant_pick_correction_audit
  FOR SELECT
  TO authenticated
  USING (public.ashbracket_can_manage_pool(pool_id));

CREATE POLICY participant_pick_correction_audit_insert_manage
  ON public.participant_pick_correction_audit
  FOR INSERT
  TO authenticated
  WITH CHECK (
    actor_user_id = auth.uid()
    AND public.ashbracket_can_manage_pool(pool_id)
  );
