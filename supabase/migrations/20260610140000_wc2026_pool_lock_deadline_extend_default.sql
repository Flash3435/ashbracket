-- World Cup 2026 live pools: default pick lock for newly created pools only.
-- June 11, 2026 12:00 p.m. Eastern Time (2026-06-11 16:00:00+00).
-- Does not UPDATE existing pool rows.

-- ---------------------------------------------------------------------------
-- create_pool_for_current_user
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_pool_for_current_user(
  p_name text,
  p_join_code text DEFAULT NULL,
  p_is_public boolean DEFAULT false
)
RETURNS jsonb
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
  v_official_id uuid;
  v_wc_lock timestamptz := '2026-06-11 16:00:00+00'::timestamptz;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated'
      USING ERRCODE = '28000';
  END IF;
  IF length(v_name) < 1 OR length(v_name) > 200 THEN
    RAISE EXCEPTION 'invalid pool name'
      USING ERRCODE = '22023';
  END IF;

  SELECT id INTO v_official_id
  FROM public.tournament_editions
  WHERE code = 'fifa_wc_2026' AND is_simulation IS NOT TRUE
  LIMIT 1;

  IF v_official_id IS NULL THEN
    RAISE EXCEPTION 'official tournament edition is not installed'
      USING ERRCODE = 'P0001';
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
        RAISE EXCEPTION 'could not allocate a unique join code'
          USING ERRCODE = 'P0001';
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
        RAISE EXCEPTION 'could not allocate a unique join code'
          USING ERRCODE = 'P0001';
      END IF;
      v_candidate := v_base || '-' || v_n::text;
    END LOOP;
  ELSE
    v_code := upper(trim(p_join_code));
    IF length(v_code) < 3 OR length(v_code) > 40 THEN
      RAISE EXCEPTION 'join code must be between 3 and 40 characters'
        USING ERRCODE = '22023';
    END IF;
    IF v_code !~ '^[A-Z0-9_-]+$' THEN
      RAISE EXCEPTION 'join code may only contain letters, digits, hyphens, and underscores'
        USING ERRCODE = '22023';
    END IF;
    IF EXISTS (
      SELECT 1
      FROM public.pools p
      WHERE p.join_code IS NOT NULL
        AND upper(trim(p.join_code)) = v_code
    ) THEN
      RAISE EXCEPTION 'join code is already in use'
        USING ERRCODE = '23505';
    END IF;
  END IF;

  INSERT INTO public.pools (
    name,
    created_by_user_id,
    join_code,
    is_public,
    tournament_edition_id,
    is_simulation,
    lock_at
  )
  VALUES (
    v_name,
    v_uid,
    v_code,
    COALESCE(p_is_public, false),
    v_official_id,
    false,
    v_wc_lock
  )
  RETURNING id INTO v_pool_id;

  INSERT INTO public.pool_admins (pool_id, user_id, role)
  VALUES (v_pool_id, v_uid, 'owner')
  ON CONFLICT (pool_id, user_id) DO NOTHING;

  RETURN jsonb_build_object(
    'pool_id', v_pool_id,
    'pool_name', v_name,
    'join_code', v_code
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- create_pool_with_owner
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_pool_with_owner(
  p_name text,
  p_join_code text DEFAULT NULL,
  p_is_public boolean DEFAULT false,
  p_tournament_edition_id uuid DEFAULT NULL,
  p_is_simulation boolean DEFAULT false
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
  v_edition_id uuid;
  v_edition_sim boolean;
  v_edition_code text;
  v_official_id uuid;
  v_wc_lock timestamptz := '2026-06-11 16:00:00+00'::timestamptz;
  v_lock_at timestamptz;
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

  SELECT id INTO v_official_id
  FROM public.tournament_editions
  WHERE code = 'fifa_wc_2026'
  LIMIT 1;

  IF p_is_simulation THEN
    IF p_tournament_edition_id IS NULL THEN
      RAISE EXCEPTION 'simulation pools require a simulation tournament edition';
    END IF;
    v_edition_id := p_tournament_edition_id;
  ELSE
    IF p_tournament_edition_id IS NOT NULL THEN
      v_edition_id := p_tournament_edition_id;
    ELSE
      v_edition_id := v_official_id;
    END IF;
    IF v_edition_id IS NULL THEN
      RAISE EXCEPTION 'official tournament edition is not installed (run WC2026 seed)';
    END IF;
  END IF;

  SELECT is_simulation, code
  INTO v_edition_sim, v_edition_code
  FROM public.tournament_editions
  WHERE id = v_edition_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'tournament edition not found';
  END IF;

  IF p_is_simulation AND NOT v_edition_sim THEN
    RAISE EXCEPTION 'simulation pools must use a simulation tournament edition';
  END IF;

  IF NOT p_is_simulation AND v_edition_sim THEN
    RAISE EXCEPTION 'live pools cannot use a simulation tournament edition';
  END IF;

  IF COALESCE(p_is_simulation, false) THEN
    v_lock_at := NULL;
  ELSIF v_edition_code = 'fifa_wc_2026' AND v_edition_sim IS NOT TRUE THEN
    v_lock_at := v_wc_lock;
  ELSE
    v_lock_at := NULL;
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

  INSERT INTO public.pools (
    name,
    created_by_user_id,
    join_code,
    is_public,
    tournament_edition_id,
    is_simulation,
    lock_at
  )
  VALUES (
    v_name,
    v_uid,
    v_code,
    COALESCE(p_is_public, false),
    v_edition_id,
    COALESCE(p_is_simulation, false),
    v_lock_at
  )
  RETURNING id INTO v_pool_id;

  INSERT INTO public.pool_admins (pool_id, user_id, role)
  VALUES (v_pool_id, v_uid, 'owner')
  ON CONFLICT (pool_id, user_id) DO NOTHING;

  RETURN v_pool_id;
END;
$$;
