-- NHL Draft 2026 Pick'em: per-user entries and ranked top-10 picks.
-- Isolated from World Cup predictions and NHL playoff pick tables.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

CREATE TABLE public.nhl_draft26_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  display_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT nhl_draft26_entries_user_unique UNIQUE (user_id)
);

CREATE INDEX idx_nhl_draft26_entries_user_id
  ON public.nhl_draft26_entries (user_id);

CREATE TRIGGER nhl_draft26_entries_set_updated_at
  BEFORE UPDATE ON public.nhl_draft26_entries
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.nhl_draft26_entries IS
  'One NHL Draft 2026 Pick''em entry per auth user.';

CREATE TABLE public.nhl_draft26_picks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id uuid NOT NULL REFERENCES public.nhl_draft26_entries (id) ON DELETE CASCADE,
  pick_number integer NOT NULL,
  prospect_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT nhl_draft26_picks_entry_pick_unique UNIQUE (entry_id, pick_number),
  CONSTRAINT nhl_draft26_picks_entry_prospect_unique UNIQUE (entry_id, prospect_id),
  CONSTRAINT nhl_draft26_picks_pick_number_range CHECK (pick_number BETWEEN 1 AND 10)
);

CREATE INDEX idx_nhl_draft26_picks_entry_id
  ON public.nhl_draft26_picks (entry_id);

CREATE TRIGGER nhl_draft26_picks_set_updated_at
  BEFORE UPDATE ON public.nhl_draft26_picks
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.nhl_draft26_picks IS
  'Ranked top-10 prospect picks (pick_number 1 = first overall) for an NHL Draft 2026 entry.';

-- ---------------------------------------------------------------------------
-- Atomic save (delete + insert in one transaction)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.nhl_draft26_save_picks(p_pick_prospect_ids text[])
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
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

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

  INSERT INTO public.nhl_draft26_entries (user_id)
  VALUES (v_user_id)
  ON CONFLICT (user_id) DO UPDATE
    SET updated_at = now()
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

REVOKE ALL ON FUNCTION public.nhl_draft26_save_picks(text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.nhl_draft26_save_picks(text[]) TO authenticated;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

ALTER TABLE public.nhl_draft26_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nhl_draft26_picks ENABLE ROW LEVEL SECURITY;

CREATE POLICY nhl_draft26_entries_select_own
  ON public.nhl_draft26_entries
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY nhl_draft26_entries_insert_own
  ON public.nhl_draft26_entries
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY nhl_draft26_entries_update_own
  ON public.nhl_draft26_entries
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY nhl_draft26_entries_admin_select
  ON public.nhl_draft26_entries
  FOR SELECT
  TO authenticated
  USING (public.ashbracket_is_admin());

CREATE POLICY nhl_draft26_picks_select_own
  ON public.nhl_draft26_picks
  FOR SELECT
  TO authenticated
  USING (
    entry_id IN (
      SELECT e.id
      FROM public.nhl_draft26_entries e
      WHERE e.user_id = auth.uid()
    )
  );

CREATE POLICY nhl_draft26_picks_insert_own
  ON public.nhl_draft26_picks
  FOR INSERT
  TO authenticated
  WITH CHECK (
    entry_id IN (
      SELECT e.id
      FROM public.nhl_draft26_entries e
      WHERE e.user_id = auth.uid()
    )
  );

CREATE POLICY nhl_draft26_picks_update_own
  ON public.nhl_draft26_picks
  FOR UPDATE
  TO authenticated
  USING (
    entry_id IN (
      SELECT e.id
      FROM public.nhl_draft26_entries e
      WHERE e.user_id = auth.uid()
    )
  )
  WITH CHECK (
    entry_id IN (
      SELECT e.id
      FROM public.nhl_draft26_entries e
      WHERE e.user_id = auth.uid()
    )
  );

CREATE POLICY nhl_draft26_picks_delete_own
  ON public.nhl_draft26_picks
  FOR DELETE
  TO authenticated
  USING (
    entry_id IN (
      SELECT e.id
      FROM public.nhl_draft26_entries e
      WHERE e.user_id = auth.uid()
    )
  );

CREATE POLICY nhl_draft26_picks_admin_select
  ON public.nhl_draft26_picks
  FOR SELECT
  TO authenticated
  USING (public.ashbracket_is_admin());
