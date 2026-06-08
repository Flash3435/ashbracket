-- Include invited email in peek_participant_invite for invite-based signup UX.
-- Same row visibility rules as before; email is only returned for valid pending invites.
--
-- PostgreSQL does not allow changing the OUT/RETURNS TABLE signature with
-- CREATE OR REPLACE; drop and recreate.

DROP FUNCTION IF EXISTS public.peek_participant_invite(text);

CREATE FUNCTION public.peek_participant_invite(p_token text)
RETURNS TABLE (
  pool_id uuid,
  pool_name text,
  display_name text,
  invited_email text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.id,
    p.name,
    pr.display_name,
    CASE
      WHEN pr.email IS NOT NULL AND length(trim(pr.email)) > 0
      THEN lower(trim(pr.email))
      ELSE NULL
    END
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
