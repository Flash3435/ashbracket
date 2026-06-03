-- NHL Draft 2026: display name on save + public-safe leaderboard/entry RPCs.

-- ---------------------------------------------------------------------------
-- Display name validation (shared by save + future admin tools)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.nhl_draft26_normalize_display_name(p_display_name text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_name text;
BEGIN
  v_name := btrim(COALESCE(p_display_name, ''));
  IF length(v_name) < 3 OR length(v_name) > 24 THEN
    RAISE EXCEPTION 'invalid display name length';
  END IF;
  IF v_name !~ '^[A-Za-z0-9][A-Za-z0-9 _\-]*$' THEN
    RAISE EXCEPTION 'invalid display name characters';
  END IF;
  RETURN v_name;
END;
$$;

REVOKE ALL ON FUNCTION public.nhl_draft26_normalize_display_name(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.nhl_draft26_normalize_display_name(text) TO authenticated;

-- ---------------------------------------------------------------------------
-- Save picks + display name
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.nhl_draft26_save_picks(text[]);

CREATE OR REPLACE FUNCTION public.nhl_draft26_save_picks(
  p_pick_prospect_ids text[],
  p_display_name text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_entry_id uuid;
  v_len integer;
  v_i integer;
  v_display_name text;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  v_display_name := public.nhl_draft26_normalize_display_name(p_display_name);

  v_len := COALESCE(array_length(p_pick_prospect_ids, 1), 0);
  IF v_len <> 10 THEN
    RAISE EXCEPTION 'exactly 10 picks required';
  END IF;

  IF (
    SELECT count(DISTINCT x)
    FROM unnest(p_pick_prospect_ids) AS t(x)
  ) <> 10 THEN
    RAISE EXCEPTION 'duplicate prospect picks';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM unnest(p_pick_prospect_ids) AS t(x)
    WHERE x IS NULL OR btrim(x) = ''
  ) THEN
    RAISE EXCEPTION 'invalid prospect id';
  END IF;

  INSERT INTO public.nhl_draft26_entries (user_id, display_name)
  VALUES (v_user_id, v_display_name)
  ON CONFLICT (user_id) DO UPDATE
    SET display_name = EXCLUDED.display_name,
        updated_at = now()
  RETURNING id INTO v_entry_id;

  DELETE FROM public.nhl_draft26_picks
  WHERE entry_id = v_entry_id;

  FOR v_i IN 1..10 LOOP
    INSERT INTO public.nhl_draft26_picks (entry_id, pick_number, prospect_id)
    VALUES (v_entry_id, v_i, p_pick_prospect_ids[v_i]);
  END LOOP;

  RETURN v_entry_id;
END;
$$;

REVOKE ALL ON FUNCTION public.nhl_draft26_save_picks(text[], text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.nhl_draft26_save_picks(text[], text) TO authenticated;

-- ---------------------------------------------------------------------------
-- Public entries: display name set + exactly 10 picks
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.nhl_draft26_public_entry_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT e.id
  FROM public.nhl_draft26_entries e
  WHERE btrim(COALESCE(e.display_name, '')) <> ''
    AND (
      SELECT count(*)::integer
      FROM public.nhl_draft26_picks p
      WHERE p.entry_id = e.id
    ) = 10;
$$;

REVOKE ALL ON FUNCTION public.nhl_draft26_public_entry_ids() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.nhl_draft26_public_entry_ids() TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.fetch_nhl_draft26_public_entries()
RETURNS TABLE (
  entry_id uuid,
  display_name text,
  updated_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT e.id, btrim(e.display_name)::text, e.updated_at
  FROM public.nhl_draft26_entries e
  WHERE e.id IN (SELECT public.nhl_draft26_public_entry_ids())
  ORDER BY e.updated_at DESC, e.display_name ASC;
$$;

REVOKE ALL ON FUNCTION public.fetch_nhl_draft26_public_entries() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fetch_nhl_draft26_public_entries() TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.fetch_nhl_draft26_public_picks()
RETURNS TABLE (
  entry_id uuid,
  pick_number integer,
  prospect_id text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.entry_id, p.pick_number, p.prospect_id
  FROM public.nhl_draft26_picks p
  WHERE p.entry_id IN (SELECT public.nhl_draft26_public_entry_ids())
  ORDER BY p.entry_id, p.pick_number ASC;
$$;

REVOKE ALL ON FUNCTION public.fetch_nhl_draft26_public_picks() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fetch_nhl_draft26_public_picks() TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.fetch_nhl_draft26_public_entry(p_entry_id uuid)
RETURNS TABLE (
  entry_id uuid,
  display_name text,
  updated_at timestamptz,
  pick_number integer,
  prospect_id text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    e.id,
    btrim(e.display_name)::text,
    e.updated_at,
    p.pick_number,
    p.prospect_id
  FROM public.nhl_draft26_entries e
  INNER JOIN public.nhl_draft26_picks p ON p.entry_id = e.id
  WHERE e.id = p_entry_id
    AND e.id IN (SELECT public.nhl_draft26_public_entry_ids())
  ORDER BY p.pick_number ASC;
$$;

REVOKE ALL ON FUNCTION public.fetch_nhl_draft26_public_entry(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fetch_nhl_draft26_public_entry(uuid) TO anon, authenticated;
