-- Direct pool management for participant moves: pool_admins OR pool creator.
-- Backfill missing pool_admins rows for historical pools.

CREATE OR REPLACE FUNCTION public.ashbracket_is_direct_pool_manager(target_pool_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.ashbracket_private_pool_membership(target_pool_id, false)
    OR EXISTS (
      SELECT 1
      FROM public.pools p
      WHERE p.id = target_pool_id
        AND p.created_by_user_id = auth.uid()
    );
$$;

REVOKE ALL ON FUNCTION public.ashbracket_is_direct_pool_manager(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ashbracket_is_direct_pool_manager(uuid) TO authenticated;

COMMENT ON FUNCTION public.ashbracket_is_direct_pool_manager(uuid) IS
  'Session user may directly manage a pool via pool_admins or pools.created_by_user_id. Excludes global app admins.';

CREATE OR REPLACE FUNCTION public.ashbracket_list_directly_managed_pools()
RETURNS SETOF public.pools
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.*
  FROM public.pools p
  WHERE public.ashbracket_is_direct_pool_manager(p.id);
$$;

COMMENT ON FUNCTION public.ashbracket_list_directly_managed_pools() IS
  'Pools the session user directly manages via pool_admins or created_by_user_id. Excludes global-admin-only visibility.';

INSERT INTO public.pool_admins (pool_id, user_id, role)
SELECT p.id, p.created_by_user_id, 'owner'
FROM public.pools p
WHERE p.created_by_user_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.pool_admins pa
    WHERE pa.pool_id = p.id
      AND pa.user_id = p.created_by_user_id
  )
ON CONFLICT (pool_id, user_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.move_world_cup_participant_to_pool(
  p_participant_id uuid,
  p_source_pool_id uuid,
  p_destination_pool_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_participant public.participants%ROWTYPE;
  v_source_pool public.pools%ROWTYPE;
  v_dest_pool public.pools%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  IF p_source_pool_id = p_destination_pool_id THEN
    RAISE EXCEPTION 'source and destination pools must differ';
  END IF;

  IF NOT public.ashbracket_is_direct_pool_manager(p_source_pool_id) THEN
    RAISE EXCEPTION 'not authorized for source pool' USING ERRCODE = '42501';
  END IF;

  IF NOT public.ashbracket_is_direct_pool_manager(p_destination_pool_id) THEN
    RAISE EXCEPTION 'not authorized for destination pool' USING ERRCODE = '42501';
  END IF;

  SELECT *
  INTO v_participant
  FROM public.participants
  WHERE id = p_participant_id
    AND pool_id = p_source_pool_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'participant not found in source pool';
  END IF;

  SELECT *
  INTO v_source_pool
  FROM public.pools
  WHERE id = p_source_pool_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'pools are not compatible';
  END IF;

  SELECT *
  INTO v_dest_pool
  FROM public.pools
  WHERE id = p_destination_pool_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'pools are not compatible';
  END IF;

  IF v_source_pool.tournament_edition_id IS NULL
     OR v_dest_pool.tournament_edition_id IS NULL
     OR v_source_pool.tournament_edition_id <> v_dest_pool.tournament_edition_id
     OR v_source_pool.is_simulation IS DISTINCT FROM v_dest_pool.is_simulation THEN
    RAISE EXCEPTION 'pools are not compatible';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.participants d
    WHERE d.pool_id = p_destination_pool_id
      AND (
        (v_participant.user_id IS NOT NULL AND d.user_id = v_participant.user_id)
        OR (
          length(trim(coalesce(v_participant.email, ''))) > 0
          AND length(trim(coalesce(d.email, ''))) > 0
          AND lower(trim(d.email)) = lower(trim(v_participant.email))
        )
        OR lower(trim(d.display_name)) = lower(trim(v_participant.display_name))
      )
  ) THEN
    RAISE EXCEPTION 'participant already exists in destination pool';
  END IF;

  DELETE FROM public.points_ledger
  WHERE participant_id = p_participant_id;

  UPDATE public.predictions
  SET pool_id = p_destination_pool_id,
      updated_at = now()
  WHERE participant_id = p_participant_id
    AND pool_id = p_source_pool_id;

  UPDATE public.pool_activity
  SET pool_id = p_destination_pool_id,
      updated_at = now()
  WHERE participant_id = p_participant_id
    AND pool_id = p_source_pool_id;

  UPDATE public.participants
  SET pool_id = p_destination_pool_id,
      updated_at = now()
  WHERE id = p_participant_id;

  RETURN jsonb_build_object(
    'participant_id', p_participant_id,
    'display_name', v_participant.display_name,
    'destination_pool_name', v_dest_pool.name
  );
END;
$$;

COMMENT ON FUNCTION public.move_world_cup_participant_to_pool(uuid, uuid, uuid) IS
  'Moves a World Cup participant between compatible pools. Caller must be pool_admins or pool creator on both pools.';
