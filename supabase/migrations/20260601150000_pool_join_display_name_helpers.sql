-- Helpers for smart pool join: peek unclaimed rows, detect taken joined names, block duplicate creates.

CREATE OR REPLACE FUNCTION public.peek_unclaimed_participants_for_join(
  p_pool_id uuid,
  p_join_code text,
  p_display_name text
)
RETURNS TABLE (participant_id uuid, display_name text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name text := trim(p_display_name);
BEGIN
  IF length(v_name) < 1 OR length(v_name) > 120 THEN
  RETURN;
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.pools p
    WHERE p.id = p_pool_id
      AND p.join_code IS NOT NULL
      AND lower(trim(p.join_code)) = lower(trim(p_join_code))
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT pr.id, pr.display_name
  FROM public.participants pr
  WHERE pr.pool_id = p_pool_id
    AND pr.user_id IS NULL
    AND lower(trim(pr.display_name)) = lower(v_name)
  ORDER BY pr.created_at ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.peek_unclaimed_participants_for_join(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.peek_unclaimed_participants_for_join(uuid, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.is_joined_display_name_taken(
  p_pool_id uuid,
  p_display_name text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.participants pr
    WHERE pr.pool_id = p_pool_id
      AND pr.user_id IS NOT NULL
      AND lower(trim(pr.display_name)) = lower(trim(p_display_name))
  );
$$;

REVOKE ALL ON FUNCTION public.is_joined_display_name_taken(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_joined_display_name_taken(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.register_pool_participant(
  p_pool_id uuid,
  p_join_code text,
  p_display_name text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_email text;
  v_id uuid;
  v_name text := trim(p_display_name);
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  IF length(v_name) < 1 OR length(v_name) > 120 THEN
    RAISE EXCEPTION 'invalid display name';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.pools p
    WHERE p.id = p_pool_id
      AND p.join_code IS NOT NULL
      AND lower(trim(p.join_code)) = lower(trim(p_join_code))
  ) THEN
    RAISE EXCEPTION 'invalid join code';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.participants x
    WHERE x.user_id = v_uid AND x.pool_id = p_pool_id
  ) THEN
    RAISE EXCEPTION 'already registered in this pool';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.participants pr
    WHERE pr.pool_id = p_pool_id
      AND pr.user_id IS NOT NULL
      AND lower(trim(pr.display_name)) = lower(v_name)
  ) THEN
    RAISE EXCEPTION 'display name already taken in this pool';
  END IF;

  SELECT u.email INTO v_email
  FROM auth.users u
  WHERE u.id = v_uid;

  INSERT INTO public.participants (pool_id, user_id, display_name, email)
  VALUES (p_pool_id, v_uid, v_name, v_email)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_pool_participant(
  p_pool_id uuid,
  p_join_code text,
  p_display_name text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_email text;
  v_id uuid;
  v_name text := trim(p_display_name);
  v_match_count int;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  IF length(v_name) < 1 OR length(v_name) > 120 THEN
    RAISE EXCEPTION 'invalid display name';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.pools p
    WHERE p.id = p_pool_id
      AND p.join_code IS NOT NULL
      AND lower(trim(p.join_code)) = lower(trim(p_join_code))
  ) THEN
    RAISE EXCEPTION 'invalid join code';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.participants x
    WHERE x.user_id = v_uid AND x.pool_id = p_pool_id
  ) THEN
    RAISE EXCEPTION 'already registered in this pool';
  END IF;

  SELECT count(*)::int INTO v_match_count
  FROM public.participants pr2
  WHERE pr2.pool_id = p_pool_id
    AND pr2.user_id IS NULL
    AND lower(trim(pr2.display_name)) = lower(v_name);

  IF v_match_count > 1 THEN
    RAISE EXCEPTION 'multiple unclaimed profiles for this name';
  END IF;

  SELECT u.email INTO v_email
  FROM auth.users u
  WHERE u.id = v_uid;

  UPDATE public.participants pr
  SET
    user_id = v_uid,
    email = COALESCE(pr.email, v_email),
    updated_at = now()
  WHERE pr.id = (
    SELECT pr2.id
    FROM public.participants pr2
    WHERE pr2.pool_id = p_pool_id
      AND pr2.user_id IS NULL
      AND lower(trim(pr2.display_name)) = lower(v_name)
    ORDER BY pr2.created_at ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED
  )
  RETURNING pr.id INTO v_id;

  IF v_id IS NULL THEN
    RAISE EXCEPTION 'no matching unclaimed profile';
  END IF;

  RETURN v_id;
END;
$$;
