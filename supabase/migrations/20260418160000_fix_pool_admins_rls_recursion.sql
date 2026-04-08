-- Fix infinite recursion on pool_admins RLS: policies and helper functions must not
-- query pool_admins under the invoker (RLS re-evaluates policies on the same table).
-- Use SECURITY DEFINER membership checks (table owner bypasses RLS in Postgres).

-- ---------------------------------------------------------------------------
-- Internal: membership without RLS recursion (session user via auth.uid())
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.ashbracket_private_pool_membership(
  p_pool_id uuid,
  p_require_owner boolean
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.pool_admins pa
    WHERE pa.pool_id = p_pool_id
      AND pa.user_id = auth.uid()
      AND (NOT p_require_owner OR pa.role = 'owner')
  );
$$;

REVOKE ALL ON FUNCTION public.ashbracket_private_pool_membership(uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ashbracket_private_pool_membership(uuid, boolean) TO authenticated;

COMMENT ON FUNCTION public.ashbracket_private_pool_membership(uuid, boolean) IS
  'Authorizes pool_admins access without RLS self-query recursion; do not use for unrelated privilege checks.';

-- ---------------------------------------------------------------------------
-- Replace public helpers to use private membership (no pool_admins RLS in subquery)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.ashbracket_can_manage_pool(target_pool_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT public.ashbracket_is_global_admin()
    OR public.ashbracket_private_pool_membership(target_pool_id, false);
$$;

CREATE OR REPLACE FUNCTION public.ashbracket_is_pool_owner(target_pool_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT public.ashbracket_is_global_admin()
    OR public.ashbracket_private_pool_membership(target_pool_id, true);
$$;

-- ---------------------------------------------------------------------------
-- pool_admins SELECT: replace self-referencing EXISTS policy
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS pool_admins_select_same_pool ON public.pool_admins;

CREATE POLICY pool_admins_select_same_pool
  ON public.pool_admins
  FOR SELECT
  TO authenticated
  USING (public.ashbracket_private_pool_membership(pool_id, false));
