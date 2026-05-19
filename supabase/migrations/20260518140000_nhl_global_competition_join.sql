-- NHL global competition: direct edition join (no invite required) + backfill existing pickers.

COMMENT ON TABLE public.nhl_memberships IS
  'One competition entry per auth user per NHL edition (global leaderboard). Separate from World Cup pool participants.';

-- ---------------------------------------------------------------------------
-- Join active edition (authenticated; idempotent)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.join_nhl_active_edition()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_edition_id uuid;
  v_mid uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  SELECT e.id
  INTO v_edition_id
  FROM public.nhl_editions e
  WHERE e.is_active = true
  ORDER BY e.created_at DESC
  LIMIT 1;

  IF v_edition_id IS NULL THEN
    RAISE EXCEPTION 'no active NHL edition';
  END IF;

  SELECT m.id
  INTO v_mid
  FROM public.nhl_memberships m
  WHERE m.user_id = v_uid
    AND m.edition_id = v_edition_id
  LIMIT 1;

  IF v_mid IS NOT NULL THEN
    RETURN v_mid;
  END IF;

  INSERT INTO public.nhl_memberships (user_id, edition_id)
  VALUES (v_uid, v_edition_id)
  RETURNING id INTO v_mid;

  RETURN v_mid;
END;
$$;

COMMENT ON FUNCTION public.join_nhl_active_edition() IS
  'Creates (or returns) the caller''s membership for the active NHL edition. No invite token required.';

REVOKE ALL ON FUNCTION public.join_nhl_active_edition() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.join_nhl_active_edition() TO authenticated;

-- ---------------------------------------------------------------------------
-- Backfill: users with picks but no membership row yet
-- ---------------------------------------------------------------------------

INSERT INTO public.nhl_memberships (user_id, edition_id)
SELECT DISTINCT src.user_id, src.edition_id
FROM (
  SELECT p.user_id, p.edition_id
  FROM public.nhl_r1_series_picks p
  UNION
  SELECT p.user_id, p.edition_id
  FROM public.nhl_r2_series_picks p
) AS src
WHERE NOT EXISTS (
  SELECT 1
  FROM public.nhl_memberships m
  WHERE m.user_id = src.user_id
    AND m.edition_id = src.edition_id
);
