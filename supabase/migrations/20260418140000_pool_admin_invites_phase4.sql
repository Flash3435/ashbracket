-- Phase 4: pending pool admin invites (email-scoped), claim on sign-in, audit log.

-- ---------------------------------------------------------------------------
-- A. pool_admin_invites
-- ---------------------------------------------------------------------------

CREATE TABLE public.pool_admin_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pool_id uuid NOT NULL REFERENCES public.pools (id) ON DELETE CASCADE,
  invited_email text NOT NULL,
  role text NOT NULL,
  invited_by_user_id uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  claimed_by_user_id uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  claimed_at timestamptz,
  revoked_at timestamptz,
  invite_last_sent_at timestamptz,
  CONSTRAINT pool_admin_invites_role_check CHECK (role IN ('owner', 'admin'))
);

CREATE INDEX idx_pool_admin_invites_pool_id ON public.pool_admin_invites (pool_id);
CREATE INDEX idx_pool_admin_invites_invited_email ON public.pool_admin_invites (invited_email);

-- One active pending invite per pool + normalized email (not claimed, not revoked).
CREATE UNIQUE INDEX pool_admin_invites_active_pool_email_uq
  ON public.pool_admin_invites (pool_id, invited_email)
  WHERE revoked_at IS NULL AND claimed_at IS NULL;

COMMENT ON TABLE public.pool_admin_invites IS
  'Pending pool admin/owner assignment by email; claimed when auth user email matches.';

CREATE OR REPLACE FUNCTION public.pool_admin_invites_normalize_email()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.invited_email := lower(trim(NEW.invited_email));
  IF NEW.invited_email IS NULL OR length(NEW.invited_email) < 3 THEN
    RAISE EXCEPTION 'invalid invited email';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS pool_admin_invites_normalize_email_trg ON public.pool_admin_invites;
CREATE TRIGGER pool_admin_invites_normalize_email_trg
  BEFORE INSERT OR UPDATE OF invited_email ON public.pool_admin_invites
  FOR EACH ROW
  EXECUTE FUNCTION public.pool_admin_invites_normalize_email();

ALTER TABLE public.pool_admin_invites ENABLE ROW LEVEL SECURITY;

CREATE POLICY pool_admin_invites_select_manage
  ON public.pool_admin_invites
  FOR SELECT
  TO authenticated
  USING (public.ashbracket_can_manage_pool(pool_id));

CREATE POLICY pool_admin_invites_insert_owner
  ON public.pool_admin_invites
  FOR INSERT
  TO authenticated
  WITH CHECK (public.ashbracket_is_pool_owner(pool_id));

CREATE POLICY pool_admin_invites_update_owner
  ON public.pool_admin_invites
  FOR UPDATE
  TO authenticated
  USING (public.ashbracket_is_pool_owner(pool_id))
  WITH CHECK (public.ashbracket_is_pool_owner(pool_id));

-- ---------------------------------------------------------------------------
-- B. pool_admin_audit_log
-- ---------------------------------------------------------------------------

CREATE TABLE public.pool_admin_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pool_id uuid NOT NULL REFERENCES public.pools (id) ON DELETE CASCADE,
  actor_user_id uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  target_user_id uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  target_email text,
  action text NOT NULL,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_pool_admin_audit_log_pool_id ON public.pool_admin_audit_log (pool_id);
CREATE INDEX idx_pool_admin_audit_log_created_at ON public.pool_admin_audit_log (pool_id, created_at DESC);

COMMENT ON TABLE public.pool_admin_audit_log IS
  'Append-only audit trail for pool admin membership and invite actions.';

ALTER TABLE public.pool_admin_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY pool_admin_audit_log_select_manage
  ON public.pool_admin_audit_log
  FOR SELECT
  TO authenticated
  USING (public.ashbracket_can_manage_pool(pool_id));

CREATE POLICY pool_admin_audit_log_insert_owner
  ON public.pool_admin_audit_log
  FOR INSERT
  TO authenticated
  WITH CHECK (
    actor_user_id = auth.uid()
    AND public.ashbracket_is_pool_owner(pool_id)
  );

-- ---------------------------------------------------------------------------
-- C. Claim pending invites (email match; idempotent)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.ashbracket_claim_pending_pool_admin_invites_for_user()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_email text;
  r record;
  n int := 0;
BEGIN
  IF v_uid IS NULL THEN
    RETURN 0;
  END IF;

  SELECT lower(trim(u.email)) INTO v_email
  FROM auth.users u
  WHERE u.id = v_uid;

  IF v_email IS NULL OR length(v_email) < 3 THEN
    RETURN 0;
  END IF;

  FOR r IN
    SELECT i.id, i.pool_id, i.role
    FROM public.pool_admin_invites i
    WHERE i.invited_email = v_email
      AND i.revoked_at IS NULL
      AND i.claimed_at IS NULL
    FOR UPDATE OF i SKIP LOCKED
  LOOP
    INSERT INTO public.pool_admins AS pa (pool_id, user_id, role)
    VALUES (r.pool_id, v_uid, r.role)
    ON CONFLICT (pool_id, user_id) DO UPDATE SET
      role = CASE
        WHEN pa.role = 'owner' THEN 'owner'
        WHEN EXCLUDED.role = 'owner' THEN 'owner'
        ELSE pa.role
      END,
      updated_at = now();

    UPDATE public.pool_admin_invites
    SET
      claimed_by_user_id = v_uid,
      claimed_at = now()
    WHERE id = r.id
      AND claimed_at IS NULL
      AND revoked_at IS NULL;

    INSERT INTO public.pool_admin_audit_log (
      pool_id,
      actor_user_id,
      target_user_id,
      target_email,
      action,
      metadata
    )
    VALUES (
      r.pool_id,
      v_uid,
      v_uid,
      v_email,
      'claim_invite',
      jsonb_build_object(
        'invite_id', r.id,
        'invited_role', r.role
      )
    );

    n := n + 1;
  END LOOP;

  RETURN n;
END;
$$;

REVOKE ALL ON FUNCTION public.ashbracket_claim_pending_pool_admin_invites_for_user() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ashbracket_claim_pending_pool_admin_invites_for_user() TO authenticated;

COMMENT ON FUNCTION public.ashbracket_claim_pending_pool_admin_invites_for_user() IS
  'Claims pending pool admin invites for the session user email; idempotent.';
