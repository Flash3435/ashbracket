-- Phase 1: pool-level administrators (additive). Global admins remain in app_admins.
-- ashbracket_is_admin() is an alias for ashbracket_is_global_admin() for backward compatibility.

-- ---------------------------------------------------------------------------
-- A. Schema: pool_admins + pools.created_by_user_id
-- ---------------------------------------------------------------------------

CREATE TABLE public.pool_admins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pool_id uuid NOT NULL REFERENCES public.pools (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'admin',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pool_admins_role_check CHECK (role IN ('owner', 'admin')),
  CONSTRAINT pool_admins_pool_user_unique UNIQUE (pool_id, user_id)
);

CREATE INDEX idx_pool_admins_pool_id ON public.pool_admins (pool_id);
CREATE INDEX idx_pool_admins_user_id ON public.pool_admins (user_id);

COMMENT ON TABLE public.pool_admins IS
  'Pool-scoped admin membership (owner vs admin). Global admins in app_admins retain full access.';

CREATE TRIGGER pool_admins_set_updated_at
  BEFORE UPDATE ON public.pool_admins
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.pools
  ADD COLUMN IF NOT EXISTS created_by_user_id uuid REFERENCES auth.users (id) ON DELETE SET NULL;

COMMENT ON COLUMN public.pools.created_by_user_id IS
  'Auth user who created this pool; null for legacy or manually seeded rows.';

ALTER TABLE public.pool_admins ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- B. Helper functions (session user via auth.uid(); invoker reads app_admins / pool_admins under RLS)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.ashbracket_is_global_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.app_admins a WHERE a.user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.ashbracket_can_manage_pool(target_pool_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT public.ashbracket_is_global_admin()
    OR EXISTS (
      SELECT 1 FROM public.pool_admins pa
      WHERE pa.pool_id = target_pool_id
        AND pa.user_id = auth.uid()
    );
$$;

CREATE OR REPLACE FUNCTION public.ashbracket_is_pool_owner(target_pool_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT public.ashbracket_is_global_admin()
    OR EXISTS (
      SELECT 1 FROM public.pool_admins pa
      WHERE pa.pool_id = target_pool_id
        AND pa.user_id = auth.uid()
        AND pa.role = 'owner'
    );
$$;

-- Backward-compatible name: global app_admins only (unchanged semantics for existing call sites).
CREATE OR REPLACE FUNCTION public.ashbracket_is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT public.ashbracket_is_global_admin();
$$;

REVOKE ALL ON FUNCTION public.ashbracket_is_global_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ashbracket_is_global_admin() TO authenticated;

REVOKE ALL ON FUNCTION public.ashbracket_can_manage_pool(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ashbracket_can_manage_pool(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.ashbracket_is_pool_owner(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ashbracket_is_pool_owner(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- C. RLS: pool-scoped tables — pool managers OR global admins
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS pools_admins_all ON public.pools;

CREATE POLICY pools_select_manage
  ON public.pools
  FOR SELECT
  TO authenticated
  USING (public.ashbracket_can_manage_pool(id));

CREATE POLICY pools_insert_global_admin
  ON public.pools
  FOR INSERT
  TO authenticated
  WITH CHECK (public.ashbracket_is_global_admin());

CREATE POLICY pools_update_manage
  ON public.pools
  FOR UPDATE
  TO authenticated
  USING (public.ashbracket_can_manage_pool(id))
  WITH CHECK (public.ashbracket_can_manage_pool(id));

CREATE POLICY pools_delete_manage
  ON public.pools
  FOR DELETE
  TO authenticated
  USING (public.ashbracket_can_manage_pool(id));

DROP POLICY IF EXISTS participants_admins_all ON public.participants;

CREATE POLICY participants_manage_pool
  ON public.participants
  FOR ALL
  TO authenticated
  USING (public.ashbracket_can_manage_pool(pool_id))
  WITH CHECK (public.ashbracket_can_manage_pool(pool_id));

DROP POLICY IF EXISTS predictions_admins_all ON public.predictions;

CREATE POLICY predictions_manage_pool
  ON public.predictions
  FOR ALL
  TO authenticated
  USING (public.ashbracket_can_manage_pool(pool_id))
  WITH CHECK (public.ashbracket_can_manage_pool(pool_id));

DROP POLICY IF EXISTS scoring_rules_admins_all ON public.scoring_rules;

CREATE POLICY scoring_rules_manage_pool
  ON public.scoring_rules
  FOR ALL
  TO authenticated
  USING (public.ashbracket_can_manage_pool(pool_id))
  WITH CHECK (public.ashbracket_can_manage_pool(pool_id));

DROP POLICY IF EXISTS points_ledger_admins_all ON public.points_ledger;

CREATE POLICY points_ledger_manage_pool
  ON public.points_ledger
  FOR ALL
  TO authenticated
  USING (public.ashbracket_can_manage_pool(pool_id))
  WITH CHECK (public.ashbracket_can_manage_pool(pool_id));

-- Pool activity: pool managers or participants (member branch unchanged).
DROP POLICY IF EXISTS pool_activity_select_member_or_admin ON public.pool_activity;

CREATE POLICY pool_activity_select_member_or_admin
  ON public.pool_activity
  FOR SELECT
  TO authenticated
  USING (
    public.ashbracket_can_manage_pool(pool_id)
    OR EXISTS (
      SELECT 1
      FROM public.participants p
      WHERE p.id = pool_activity.participant_id
        AND p.user_id = auth.uid()
    )
  );

-- pool_admins: global = full CRUD; pool members = read peers in same pool (Phase 2 may refine writes).
CREATE POLICY pool_admins_global_all
  ON public.pool_admins
  FOR ALL
  TO authenticated
  USING (public.ashbracket_is_global_admin())
  WITH CHECK (public.ashbracket_is_global_admin());

CREATE POLICY pool_admins_select_same_pool
  ON public.pool_admins
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.pool_admins pa
      WHERE pa.pool_id = pool_admins.pool_id
        AND pa.user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- D. RPC: create pool + owner row (bypasses RLS; idempotent membership)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_pool_with_owner(
  p_name text,
  p_join_code text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_pool_id uuid;
  v_name text := trim(p_name);
  v_code text := CASE
    WHEN p_join_code IS NULL THEN NULL
    WHEN length(trim(p_join_code)) = 0 THEN NULL
    ELSE trim(p_join_code)
  END;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  IF length(v_name) < 1 OR length(v_name) > 200 THEN
    RAISE EXCEPTION 'invalid pool name';
  END IF;

  INSERT INTO public.pools (name, created_by_user_id, join_code)
  VALUES (v_name, v_uid, v_code)
  RETURNING id INTO v_pool_id;

  INSERT INTO public.pool_admins (pool_id, user_id, role)
  VALUES (v_pool_id, v_uid, 'owner')
  ON CONFLICT (pool_id, user_id) DO NOTHING;

  RETURN v_pool_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_pool_with_owner(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_pool_with_owner(text, text) TO authenticated;

COMMENT ON FUNCTION public.create_pool_with_owner(text, text) IS
  'Creates a pool, sets created_by_user_id, and ensures caller is pool_admins owner (idempotent).';

-- ---------------------------------------------------------------------------
-- E. RPC: pools the current user may manage (excludes unrelated joinable pools)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.ashbracket_list_managed_pools()
RETURNS SETOF public.pools
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT p.*
  FROM public.pools p
  WHERE public.ashbracket_can_manage_pool(p.id);
$$;

REVOKE ALL ON FUNCTION public.ashbracket_list_managed_pools() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ashbracket_list_managed_pools() TO authenticated;

-- ---------------------------------------------------------------------------
-- F. SECURITY DEFINER ledger RPC: allow pool managers (not only global admins)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.replace_points_ledger_for_pool(
  p_pool_id uuid,
  p_rows jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.ashbracket_can_manage_pool(p_pool_id) THEN
    RAISE EXCEPTION 'not authorized to replace points ledger'
      USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.points_ledger WHERE pool_id = p_pool_id;

  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' THEN
    RETURN;
  END IF;

  IF COALESCE(jsonb_array_length(p_rows), 0) = 0 THEN
    RETURN;
  END IF;

  INSERT INTO public.points_ledger (
    pool_id,
    participant_id,
    points_delta,
    prediction_kind,
    prediction_id,
    result_id,
    note
  )
  SELECT
    p_pool_id,
    (elem->>'participant_id')::uuid,
    (elem->>'points_delta')::numeric(10, 2),
    elem->>'prediction_kind',
    (elem->>'prediction_id')::uuid,
    (elem->>'result_id')::uuid,
    elem->>'note'
  FROM jsonb_array_elements(p_rows) AS elem;
END;
$$;
