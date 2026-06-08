-- Pool invite links: opaque token on unclaimed rows, peek + claim RPCs.
-- Raw token is long random (stored server-side only; app must not expose via list APIs).

ALTER TABLE public.participants
  ADD COLUMN IF NOT EXISTS invite_token text,
  ADD COLUMN IF NOT EXISTS invite_last_sent_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS participants_invite_token_unique
  ON public.participants (invite_token)
  WHERE invite_token IS NOT NULL;

COMMENT ON COLUMN public.participants.invite_token IS
  'Opaque invite secret; cleared when the participant claims the row.';

COMMENT ON COLUMN public.participants.invite_last_sent_at IS
  'Last time an organizer sent (or resent) the invite email for this row.';

ALTER TABLE public.participants
  ADD COLUMN IF NOT EXISTS invite_pending boolean
  GENERATED ALWAYS AS (invite_token IS NOT NULL AND user_id IS NULL) STORED;

COMMENT ON COLUMN public.participants.invite_pending IS
  'True when an invite link is active for this row (no auth user linked yet).';

-- ---------------------------------------------------------------------------
-- Peek invite (anon + authenticated): pool + display name for UX
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.peek_participant_invite(p_token text)
RETURNS TABLE (pool_id uuid, pool_name text, display_name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.name, pr.display_name
  FROM public.participants pr
  INNER JOIN public.pools p ON p.id = pr.pool_id
  WHERE pr.invite_token = trim(p_token)
    AND length(trim(p_token)) >= 16
    AND pr.user_id IS NULL
    AND p.join_code IS NOT NULL
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.peek_participant_invite(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.peek_participant_invite(text) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- Claim invite: bind auth user to the pre-created row (email must match)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.claim_pool_participant_invite(p_token text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_email text;
  v_trim text := trim(p_token);
  v_id uuid;
  v_pool uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  IF length(v_trim) < 16 THEN
    RAISE EXCEPTION 'invalid invite';
  END IF;

  SELECT u.email INTO v_email
  FROM auth.users u
  WHERE u.id = v_uid;

  IF v_email IS NULL OR length(trim(v_email)) < 3 THEN
    RAISE EXCEPTION 'account email missing';
  END IF;

  SELECT pr.pool_id INTO v_pool
  FROM public.participants pr
  INNER JOIN public.pools po ON po.id = pr.pool_id
  WHERE pr.invite_token = v_trim
    AND pr.user_id IS NULL
    AND po.join_code IS NOT NULL
  LIMIT 1;

  IF v_pool IS NULL THEN
    RAISE EXCEPTION 'invalid or expired invite, or sign in with the email the organizer used';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.participants x
    WHERE x.user_id = v_uid AND x.pool_id = v_pool
  ) THEN
    RAISE EXCEPTION 'already registered in this pool';
  END IF;

  UPDATE public.participants pr
  SET
    user_id = v_uid,
    email = lower(trim(v_email)),
    invite_token = NULL,
    updated_at = now()
  FROM public.pools po
  WHERE pr.pool_id = po.id
    AND pr.invite_token = v_trim
    AND pr.user_id IS NULL
    AND po.join_code IS NOT NULL
    AND pr.email IS NOT NULL
    AND length(trim(pr.email)) > 0
    AND lower(trim(pr.email)) = lower(trim(v_email))
  RETURNING pr.id INTO v_id;

  IF v_id IS NULL THEN
    RAISE EXCEPTION 'invalid or expired invite, or sign in with the email the organizer used';
  END IF;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_pool_participant_invite(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_pool_participant_invite(text) TO authenticated;
