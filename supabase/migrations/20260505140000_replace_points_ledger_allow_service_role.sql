-- Participant pick saves are recomputed on the server after verifying the user
-- owns the participant row. The session user is usually not a pool manager, so
-- replace_points_ledger_for_pool must accept the trusted service_role client
-- (same privilege model as other server-only service_role operations).

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
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    IF auth.uid() IS NULL OR NOT public.ashbracket_can_manage_pool(p_pool_id) THEN
      RAISE EXCEPTION 'not authorized to replace points ledger'
        USING ERRCODE = '42501';
    END IF;
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

REVOKE ALL ON FUNCTION public.replace_points_ledger_for_pool(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.replace_points_ledger_for_pool(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.replace_points_ledger_for_pool(uuid, jsonb) TO service_role;

COMMENT ON FUNCTION public.replace_points_ledger_for_pool(uuid, jsonb) IS
  'Replace all points_ledger rows for a pool. Callers: pool managers / global admins (authenticated), or trusted server using service_role after authorization in application code.';
