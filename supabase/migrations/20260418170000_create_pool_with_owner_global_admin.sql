-- create_pool_with_owner: global admins only, optional is_public, join code
-- auto-generation with uniqueness, explicit join codes validated and uppercased.

DROP FUNCTION IF EXISTS public.create_pool_with_owner(text, text);

CREATE OR REPLACE FUNCTION public.create_pool_with_owner(
  p_name text,
  p_join_code text DEFAULT NULL,
  p_is_public boolean DEFAULT false
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
  v_code text;
  v_base text;
  v_candidate text;
  v_n int := 0;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  IF NOT public.ashbracket_is_global_admin() THEN
    RAISE EXCEPTION 'only global administrators may create pools'
      USING ERRCODE = '42501';
  END IF;
  IF length(v_name) < 1 OR length(v_name) > 200 THEN
    RAISE EXCEPTION 'invalid pool name';
  END IF;

  IF p_join_code IS NULL OR length(trim(p_join_code)) = 0 THEN
    v_base := upper(regexp_replace(trim(p_name), '[^a-zA-Z0-9]+', '-', 'g'));
    v_base := trim(both '-' from v_base);
    IF v_base IS NULL OR length(v_base) < 1 THEN
      v_base := 'POOL';
    END IF;
    IF length(v_base) > 24 THEN
      v_base := left(v_base, 24);
    END IF;
    v_candidate := v_base;
    LOOP
      IF length(v_candidate) > 40 THEN
        RAISE EXCEPTION 'could not allocate a unique join code';
      END IF;
      IF NOT EXISTS (
        SELECT 1
        FROM public.pools p
        WHERE p.join_code IS NOT NULL
          AND upper(trim(p.join_code)) = v_candidate
      ) THEN
        v_code := v_candidate;
        EXIT;
      END IF;
      v_n := v_n + 1;
      IF v_n > 99 THEN
        RAISE EXCEPTION 'could not allocate a unique join code';
      END IF;
      v_candidate := v_base || '-' || v_n::text;
    END LOOP;
  ELSE
    v_code := upper(trim(p_join_code));
    IF length(v_code) < 3 OR length(v_code) > 40 THEN
      RAISE EXCEPTION 'join code must be between 3 and 40 characters';
    END IF;
    IF v_code !~ '^[A-Z0-9_-]+$' THEN
      RAISE EXCEPTION 'join code may only contain letters, digits, hyphens, and underscores';
    END IF;
    IF EXISTS (
      SELECT 1
      FROM public.pools p
      WHERE p.join_code IS NOT NULL
        AND upper(trim(p.join_code)) = v_code
    ) THEN
      RAISE EXCEPTION 'join code is already in use';
    END IF;
  END IF;

  INSERT INTO public.pools (name, created_by_user_id, join_code, is_public)
  VALUES (v_name, v_uid, v_code, COALESCE(p_is_public, false))
  RETURNING id INTO v_pool_id;

  INSERT INTO public.pool_admins (pool_id, user_id, role)
  VALUES (v_pool_id, v_uid, 'owner')
  ON CONFLICT (pool_id, user_id) DO NOTHING;

  RETURN v_pool_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_pool_with_owner(text, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_pool_with_owner(text, text, boolean) TO authenticated;

COMMENT ON FUNCTION public.create_pool_with_owner(text, text, boolean) IS
  'Global admins only: creates a pool with created_by_user_id, join code (provided or generated), is_public, and owner pool_admins row.';
