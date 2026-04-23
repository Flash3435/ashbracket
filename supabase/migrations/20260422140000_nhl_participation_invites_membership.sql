-- NHL product participation: isolated from World Cup pools/participants.
-- Shared Supabase Auth users link here via nhl_memberships; invites are NHL-only tokens.

-- ---------------------------------------------------------------------------
-- Membership (one row per user per NHL edition they joined)
-- ---------------------------------------------------------------------------

CREATE TABLE public.nhl_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  edition_id uuid NOT NULL REFERENCES public.nhl_editions (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT nhl_memberships_user_edition_unique UNIQUE (user_id, edition_id)
);

CREATE INDEX idx_nhl_memberships_user_id ON public.nhl_memberships (user_id);
CREATE INDEX idx_nhl_memberships_edition_id ON public.nhl_memberships (edition_id);

COMMENT ON TABLE public.nhl_memberships IS
  'NHL playoff product membership per auth user and edition. Separate from World Cup participants.';

-- ---------------------------------------------------------------------------
-- Email-targeted invite tokens (consumed when claimed)
-- ---------------------------------------------------------------------------

CREATE TABLE public.nhl_participation_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invite_token text NOT NULL,
  edition_id uuid NOT NULL REFERENCES public.nhl_editions (id) ON DELETE CASCADE,
  invited_email text NOT NULL,
  consumed_at timestamptz,
  consumed_by_user_id uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT nhl_participation_invites_token_len CHECK (char_length(invite_token) >= 16),
  CONSTRAINT nhl_participation_invites_email_nonblank CHECK (length(trim(invited_email)) > 0)
);

CREATE UNIQUE INDEX nhl_participation_invites_token_unique
  ON public.nhl_participation_invites (invite_token);

CREATE INDEX idx_nhl_participation_invites_edition
  ON public.nhl_participation_invites (edition_id);

COMMENT ON TABLE public.nhl_participation_invites IS
  'Opaque NHL invite secrets; consumed when an authenticated user claims with a matching email.';

-- ---------------------------------------------------------------------------
-- RLS: users read only their own memberships; no direct client writes
-- ---------------------------------------------------------------------------

ALTER TABLE public.nhl_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nhl_participation_invites ENABLE ROW LEVEL SECURITY;

CREATE POLICY nhl_memberships_select_own
  ON public.nhl_memberships
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- No policies on invites → deny all direct table access (RPCs use SECURITY DEFINER).

-- ---------------------------------------------------------------------------
-- Peek invite (anon + authenticated)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.peek_nhl_participation_invite(p_token text)
RETURNS TABLE (
  edition_id uuid,
  edition_name text,
  season_label text,
  invited_email text,
  already_claimed boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    e.id AS edition_id,
    e.name AS edition_name,
    e.season_label,
    CASE
      WHEN inv.consumed_at IS NULL THEN lower(trim(inv.invited_email))
      ELSE NULL::text
    END AS invited_email,
    CASE
      WHEN inv.consumed_at IS NOT NULL
        AND inv.consumed_by_user_id IS NOT NULL
        AND inv.consumed_by_user_id = auth.uid()
      THEN true
      ELSE false
    END AS already_claimed
  FROM public.nhl_participation_invites inv
  INNER JOIN public.nhl_editions e ON e.id = inv.edition_id
  WHERE inv.invite_token = trim(p_token)
    AND char_length(trim(p_token)) >= 16
    AND (
      inv.consumed_at IS NULL
      OR (
        inv.consumed_at IS NOT NULL
        AND inv.consumed_by_user_id IS NOT NULL
        AND inv.consumed_by_user_id = auth.uid()
      )
    )
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.peek_nhl_participation_invite(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.peek_nhl_participation_invite(text) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- Claim invite → membership row + consume token
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.claim_nhl_participation_invite(p_token text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_trim text := trim(p_token);
  v_email text;
  v_inv public.nhl_participation_invites%ROWTYPE;
  v_mid uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  IF char_length(v_trim) < 16 THEN
    RAISE EXCEPTION 'invalid invite';
  END IF;

  SELECT u.email INTO v_email
  FROM auth.users u
  WHERE u.id = v_uid;

  IF v_email IS NULL OR length(trim(v_email)) < 3 THEN
    RAISE EXCEPTION 'account email missing';
  END IF;

  SELECT * INTO v_inv
  FROM public.nhl_participation_invites i
  WHERE i.invite_token = v_trim
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'invalid or expired invite';
  END IF;

  IF v_inv.consumed_at IS NOT NULL THEN
    IF v_inv.consumed_by_user_id = v_uid THEN
      SELECT m.id INTO v_mid
      FROM public.nhl_memberships m
      WHERE m.user_id = v_uid AND m.edition_id = v_inv.edition_id
      LIMIT 1;
      IF v_mid IS NOT NULL THEN
        RETURN v_mid;
      END IF;
    END IF;
    RAISE EXCEPTION 'invite already used';
  END IF;

  IF lower(trim(v_inv.invited_email)) <> lower(trim(v_email)) THEN
    RAISE EXCEPTION 'sign in with the email this NHL invite was sent to';
  END IF;

  SELECT m.id INTO v_mid
  FROM public.nhl_memberships m
  WHERE m.user_id = v_uid AND m.edition_id = v_inv.edition_id
  LIMIT 1;

  IF v_mid IS NOT NULL THEN
    UPDATE public.nhl_participation_invites i
    SET
      consumed_at = now(),
      consumed_by_user_id = v_uid
    WHERE i.id = v_inv.id;
    RETURN v_mid;
  END IF;

  INSERT INTO public.nhl_memberships (user_id, edition_id)
  VALUES (v_uid, v_inv.edition_id)
  RETURNING id INTO v_mid;

  UPDATE public.nhl_participation_invites i
  SET
    consumed_at = now(),
    consumed_by_user_id = v_uid
  WHERE i.id = v_inv.id;

  RETURN v_mid;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_nhl_participation_invite(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_nhl_participation_invite(text) TO authenticated;
