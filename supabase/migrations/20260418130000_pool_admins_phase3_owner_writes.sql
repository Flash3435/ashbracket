-- Phase 3: pool owners may manage pool_admins rows for their pool; last-owner safety;
-- email lookup for adding admins (authorized callers only).

-- ---------------------------------------------------------------------------
-- A. RLS: allow pool owners (and global admins via existing policy) to mutate
-- ---------------------------------------------------------------------------

CREATE POLICY pool_admins_insert_pool_owner
  ON public.pool_admins
  FOR INSERT
  TO authenticated
  WITH CHECK (public.ashbracket_is_pool_owner(pool_id));

CREATE POLICY pool_admins_update_pool_owner
  ON public.pool_admins
  FOR UPDATE
  TO authenticated
  USING (public.ashbracket_is_pool_owner(pool_id))
  WITH CHECK (public.ashbracket_is_pool_owner(pool_id));

CREATE POLICY pool_admins_delete_pool_owner
  ON public.pool_admins
  FOR DELETE
  TO authenticated
  USING (public.ashbracket_is_pool_owner(pool_id));

-- ---------------------------------------------------------------------------
-- B. Enforce at least one owner per pool (hard guard; app also validates)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.pool_admins_enforce_at_least_one_owner()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_other_owners int;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.role = 'owner' THEN
      SELECT count(*)::int INTO v_other_owners
      FROM public.pool_admins pa
      WHERE pa.pool_id = OLD.pool_id
        AND pa.role = 'owner'
        AND pa.id <> OLD.id;
      IF v_other_owners = 0 THEN
        RAISE EXCEPTION 'cannot remove the last pool owner'
          USING ERRCODE = '23514';
      END IF;
    END IF;
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.role = 'owner' AND NEW.role IS DISTINCT FROM 'owner' THEN
      SELECT count(*)::int INTO v_other_owners
      FROM public.pool_admins pa
      WHERE pa.pool_id = OLD.pool_id
        AND pa.role = 'owner'
        AND pa.id <> OLD.id;
      IF v_other_owners = 0 THEN
        RAISE EXCEPTION 'cannot demote the last pool owner'
          USING ERRCODE = '23514';
      END IF;
    END IF;
    RETURN NEW;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS pool_admins_at_least_one_owner ON public.pool_admins;
CREATE TRIGGER pool_admins_at_least_one_owner
  BEFORE DELETE OR UPDATE OF role ON public.pool_admins
  FOR EACH ROW
  EXECUTE FUNCTION public.pool_admins_enforce_at_least_one_owner();

-- ---------------------------------------------------------------------------
-- C. Resolve auth user id by email (only when caller may manage pool admins)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.ashbracket_find_user_id_by_email_for_pool(
  p_pool_id uuid,
  p_email text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_uid uuid;
  v_email text := lower(trim(p_email));
BEGIN
  IF auth.uid() IS NULL OR NOT public.ashbracket_is_pool_owner(p_pool_id) THEN
    RAISE EXCEPTION 'not authorized'
      USING ERRCODE = '42501';
  END IF;
  IF v_email IS NULL OR length(v_email) < 3 THEN
    RETURN NULL;
  END IF;

  SELECT u.id INTO v_uid
  FROM auth.users u
  WHERE lower(trim(u.email)) = v_email
  LIMIT 1;

  RETURN v_uid;
END;
$$;

REVOKE ALL ON FUNCTION public.ashbracket_find_user_id_by_email_for_pool(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ashbracket_find_user_id_by_email_for_pool(uuid, text) TO authenticated;

COMMENT ON FUNCTION public.ashbracket_find_user_id_by_email_for_pool(uuid, text) IS
  'Returns auth.users id for an email when the caller may manage pool admins for the pool; null if not found.';
