-- Participant self-service: join codes, register/claim RPCs, RLS for own rows and future picks.

-- ---------------------------------------------------------------------------
-- Join codes on pools (nullable = not self-joinable)
-- ---------------------------------------------------------------------------

ALTER TABLE public.pools
  ADD COLUMN IF NOT EXISTS join_code text;

CREATE UNIQUE INDEX IF NOT EXISTS pools_join_code_unique
  ON public.pools (join_code)
  WHERE join_code IS NOT NULL;

COMMENT ON COLUMN public.pools.join_code IS
  'If set, participants may register or claim via RPC after presenting this code (case-insensitive match).';

UPDATE public.pools
SET join_code = 'ASH2026'
WHERE id = 'a0000001-0000-4000-8000-000000000001'
  AND join_code IS NULL;

-- ---------------------------------------------------------------------------
-- Peek pool by code (anon + authenticated; no auth required)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.peek_joinable_pool(p_join_code text)
RETURNS TABLE (pool_id uuid, pool_name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.name
  FROM public.pools p
  WHERE p.join_code IS NOT NULL
    AND lower(trim(p.join_code)) = lower(trim(p_join_code))
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.peek_joinable_pool(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.peek_joinable_pool(text) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- Register: new participant row linked to auth.uid()
-- ---------------------------------------------------------------------------

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

  SELECT u.email INTO v_email
  FROM auth.users u
  WHERE u.id = v_uid;

  INSERT INTO public.participants (pool_id, user_id, display_name, email)
  VALUES (p_pool_id, v_uid, v_name, v_email)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.register_pool_participant(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.register_pool_participant(uuid, text, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- Claim: attach auth user to an existing unclaimed row (same display name)
-- ---------------------------------------------------------------------------

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
    RAISE EXCEPTION 'no matching unclaimed profile; create a new one or check the name';
  END IF;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_pool_participant(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_pool_participant(uuid, text, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- RLS: joinable pools readable by signed-in users (pool name for UI)
-- ---------------------------------------------------------------------------

CREATE POLICY pools_select_joinable
  ON public.pools
  FOR SELECT
  TO authenticated
  USING (join_code IS NOT NULL);

-- ---------------------------------------------------------------------------
-- RLS: participants — read/update own row (admins keep existing FOR ALL)
-- ---------------------------------------------------------------------------

CREATE POLICY participants_select_own
  ON public.participants
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY participants_update_own
  ON public.participants
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- RLS: predictions — own participant rows (prepares self-service picks)
-- ---------------------------------------------------------------------------

CREATE POLICY predictions_participant_select
  ON public.predictions
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.participants p
      WHERE p.id = participant_id AND p.user_id = auth.uid()
    )
  );

CREATE POLICY predictions_participant_insert
  ON public.predictions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.participants p
      WHERE p.id = participant_id
        AND p.user_id = auth.uid()
        AND p.pool_id = pool_id
    )
  );

CREATE POLICY predictions_participant_update
  ON public.predictions
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.participants p
      WHERE p.id = participant_id AND p.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.participants p
      WHERE p.id = participant_id AND p.user_id = auth.uid()
    )
  );

CREATE POLICY predictions_participant_delete
  ON public.predictions
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.participants p
      WHERE p.id = participant_id AND p.user_id = auth.uid()
    )
  );
