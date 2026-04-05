-- Atomically replace all points_ledger rows for one pool (delete + insert in one transaction).
-- Callable only by authenticated users listed in app_admins.

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
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.app_admins a WHERE a.user_id = auth.uid()
  ) THEN
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
    (elem->>'points_delta')::int,
    elem->>'prediction_kind',
    (elem->>'prediction_id')::uuid,
    (elem->>'result_id')::uuid,
    elem->>'note'
  FROM jsonb_array_elements(p_rows) AS elem;
END;
$$;

REVOKE ALL ON FUNCTION public.replace_points_ledger_for_pool(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.replace_points_ledger_for_pool(uuid, jsonb) TO authenticated;
