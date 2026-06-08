-- World Cup simulation isolation: edition-scoped results, pool ↔ edition binding, clone helper.
-- Live pools continue to use the official edition; simulation pools use a separate edition + results set.

-- ---------------------------------------------------------------------------
-- tournament_editions: simulation flag
-- ---------------------------------------------------------------------------

ALTER TABLE public.tournament_editions
  ADD COLUMN IF NOT EXISTS is_simulation boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.tournament_editions.is_simulation IS
  'When true, this edition is for test/simulation only and must not drive live pool scoring.';

-- Official WC 2026 row (if present) stays live.
UPDATE public.tournament_editions
SET is_simulation = false
WHERE code = 'fifa_wc_2026';

-- ---------------------------------------------------------------------------
-- pools: edition binding + simulation mode
-- ---------------------------------------------------------------------------

ALTER TABLE public.pools
  ADD COLUMN IF NOT EXISTS tournament_edition_id uuid
    REFERENCES public.tournament_editions (id) ON DELETE RESTRICT;

ALTER TABLE public.pools
  ADD COLUMN IF NOT EXISTS is_simulation boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.pools.tournament_edition_id IS
  'Tournament edition whose results score this pool. Required for new pools; backfilled to official edition.';

COMMENT ON COLUMN public.pools.is_simulation IS
  'Test/simulation pool: picks and ledger are pool-scoped; results come from a simulation edition only.';

-- Backfill existing pools to the official live edition.
UPDATE public.pools p
SET
  tournament_edition_id = e.id,
  is_simulation = false
FROM public.tournament_editions e
WHERE e.code = 'fifa_wc_2026'
  AND p.tournament_edition_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_pools_tournament_edition_id
  ON public.pools (tournament_edition_id);

CREATE INDEX IF NOT EXISTS idx_pools_is_simulation
  ON public.pools (is_simulation)
  WHERE is_simulation IS TRUE;

-- Require edition on all pools once official edition exists.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.tournament_editions WHERE code = 'fifa_wc_2026') THEN
    IF EXISTS (SELECT 1 FROM public.pools WHERE tournament_edition_id IS NULL) THEN
      RAISE EXCEPTION 'pools.tournament_edition_id backfill incomplete';
    END IF;
    ALTER TABLE public.pools
      ALTER COLUMN tournament_edition_id SET NOT NULL;
  END IF;
END $$;

-- Pool simulation flag must match its edition (CHECK cannot reference other tables).
CREATE OR REPLACE FUNCTION public.enforce_pool_simulation_edition_consistency()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_edition_sim boolean;
BEGIN
  SELECT te.is_simulation INTO v_edition_sim
  FROM public.tournament_editions te
  WHERE te.id = NEW.tournament_edition_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'tournament edition not found';
  END IF;

  IF NEW.is_simulation IS DISTINCT FROM v_edition_sim THEN
    RAISE EXCEPTION 'pool is_simulation must match tournament_editions.is_simulation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS pools_simulation_edition_consistency ON public.pools;
CREATE TRIGGER pools_simulation_edition_consistency
  BEFORE INSERT OR UPDATE OF tournament_edition_id, is_simulation
  ON public.pools
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_pool_simulation_edition_consistency();

-- ---------------------------------------------------------------------------
-- results: per-edition outcomes (was global)
-- ---------------------------------------------------------------------------

ALTER TABLE public.results
  ADD COLUMN IF NOT EXISTS edition_id uuid
    REFERENCES public.tournament_editions (id) ON DELETE CASCADE;

-- Attach existing rows to the official live edition when present.
UPDATE public.results r
SET edition_id = e.id
FROM public.tournament_editions e
WHERE e.code = 'fifa_wc_2026'
  AND r.edition_id IS NULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.results WHERE edition_id IS NULL) THEN
    RAISE EXCEPTION 'results.edition_id backfill incomplete — install fifa_wc_2026 edition first';
  END IF;
  ALTER TABLE public.results
    ALTER COLUMN edition_id SET NOT NULL;
END $$;

DROP INDEX IF EXISTS public.results_one_per_slot;

CREATE UNIQUE INDEX results_one_per_slot_per_edition ON public.results (
  edition_id,
  tournament_stage_id,
  kind,
  group_code,
  slot_key
)
NULLS NOT DISTINCT;

CREATE INDEX IF NOT EXISTS idx_results_edition_id ON public.results (edition_id);

COMMENT ON COLUMN public.results.edition_id IS
  'Tournament edition this outcome belongs to. Live and simulation editions have independent result rows.';

-- ---------------------------------------------------------------------------
-- Public views: hide simulation editions from anonymous tournament pages
-- ---------------------------------------------------------------------------

CREATE OR REPLACE VIEW public.tournament_editions_public
WITH (security_invoker = false)
AS
SELECT
  id,
  code,
  name,
  starts_on,
  ends_on
FROM public.tournament_editions
WHERE is_simulation IS NOT TRUE;

CREATE OR REPLACE VIEW public.tournament_public_matches
WITH (security_invoker = false)
AS
SELECT
  m.id AS match_id,
  m.edition_id,
  e.code AS edition_code,
  m.match_code,
  m.stage_code,
  COALESCE(ts.label, m.stage_code) AS stage_label,
  COALESCE(ts.sort_order, 0) AS stage_sort_order,
  m.group_code,
  m.round_index,
  m.kickoff_at,
  m.status,
  m.home_goals,
  m.away_goals,
  m.home_penalties,
  m.away_penalties,
  ht.name AS home_team_name,
  ht.country_code AS home_country_code,
  at.name AS away_team_name,
  at.country_code AS away_country_code,
  wt.name AS winner_team_name,
  wt.country_code AS winner_country_code
FROM public.tournament_matches m
INNER JOIN public.tournament_editions e ON e.id = m.edition_id
LEFT JOIN public.tournament_stages ts ON ts.code = m.stage_code
LEFT JOIN public.teams ht ON ht.id = m.home_team_id
LEFT JOIN public.teams at ON at.id = m.away_team_id
LEFT JOIN public.teams wt ON wt.id = m.winner_team_id
WHERE e.is_simulation IS NOT TRUE;

-- ---------------------------------------------------------------------------
-- clone_tournament_edition_for_simulation: copy schedule shape, blank scores
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.clone_tournament_edition_for_simulation(
  p_source_edition_code text,
  p_new_code text DEFAULT NULL,
  p_new_name text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_source_id uuid;
  v_source_name text;
  v_new_id uuid;
  v_code text;
  v_name text;
  v_suffix text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  IF NOT public.ashbracket_is_global_admin() THEN
    RAISE EXCEPTION 'only global administrators may clone tournament editions'
      USING ERRCODE = '42501';
  END IF;

  SELECT id, name INTO v_source_id, v_source_name
  FROM public.tournament_editions
  WHERE code = trim(p_source_edition_code);

  IF v_source_id IS NULL THEN
    RAISE EXCEPTION 'source edition not found: %', p_source_edition_code;
  END IF;

  v_suffix := to_char(clock_timestamp(), 'YYYYMMDD') || '_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 6);

  v_code := COALESCE(
    NULLIF(trim(p_new_code), ''),
    trim(p_source_edition_code) || '_sim_' || v_suffix
  );

  v_name := COALESCE(
    NULLIF(trim(p_new_name), ''),
    v_source_name || ' (simulation ' || v_suffix || ')'
  );

  IF EXISTS (SELECT 1 FROM public.tournament_editions WHERE code = v_code) THEN
    RAISE EXCEPTION 'edition code already exists: %', v_code;
  END IF;

  INSERT INTO public.tournament_editions (code, name, starts_on, ends_on, is_simulation)
  SELECT v_code, v_name, starts_on, ends_on, true
  FROM public.tournament_editions
  WHERE id = v_source_id
  RETURNING id INTO v_new_id;

  INSERT INTO public.tournament_matches (
    edition_id,
    match_code,
    stage_code,
    group_code,
    round_index,
    kickoff_at,
    status,
    home_team_id,
    away_team_id,
    home_goals,
    away_goals,
    home_penalties,
    away_penalties,
    winner_team_id,
    home_advance_from_match_id,
    away_advance_from_match_id,
    scoring_result_kind,
    scoring_slot_key,
    scoring_stage_code,
    sync_locked
  )
  SELECT
    v_new_id,
    m.match_code,
    m.stage_code,
    m.group_code,
    m.round_index,
    m.kickoff_at,
    'scheduled',
    m.home_team_id,
    m.away_team_id,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    m.scoring_result_kind,
    m.scoring_slot_key,
    m.scoring_stage_code,
    false
  FROM public.tournament_matches m
  WHERE m.edition_id = v_source_id;

  RETURN v_new_id;
END;
$$;

REVOKE ALL ON FUNCTION public.clone_tournament_edition_for_simulation(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.clone_tournament_edition_for_simulation(text, text, text) TO authenticated;

COMMENT ON FUNCTION public.clone_tournament_edition_for_simulation(text, text, text) IS
  'Global admins: clone match schedule from a source edition into a new simulation edition (no scores, no results).';

-- ---------------------------------------------------------------------------
-- create_pool_with_owner: optional simulation edition
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.create_pool_with_owner(text, text, boolean);

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
  v_official_id uuid;
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

  SELECT is_simulation INTO v_edition_sim
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
    is_simulation
  )
  VALUES (
    v_name,
    v_uid,
    v_code,
    COALESCE(p_is_public, false),
    v_edition_id,
    COALESCE(p_is_simulation, false)
  )
  RETURNING id INTO v_pool_id;

  INSERT INTO public.pool_admins (pool_id, user_id, role)
  VALUES (v_pool_id, v_uid, 'owner')
  ON CONFLICT (pool_id, user_id) DO NOTHING;

  RETURN v_pool_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_pool_with_owner(text, text, boolean, uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_pool_with_owner(text, text, boolean, uuid, boolean) TO authenticated;

COMMENT ON FUNCTION public.create_pool_with_owner(text, text, boolean, uuid, boolean) IS
  'Global admins: create pool with edition binding. Simulation pools require a simulation edition id.';

-- ---------------------------------------------------------------------------
-- bootstrap_simulation_pool: clone edition + create simulation pool in one step
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.bootstrap_simulation_pool(
  p_pool_name text,
  p_source_edition_code text DEFAULT 'fifa_wc_2026',
  p_join_code text DEFAULT NULL,
  p_is_public boolean DEFAULT false
)
RETURNS TABLE (pool_id uuid, edition_id uuid, edition_code text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_edition_id uuid;
  v_edition_code text;
  v_pool_id uuid;
BEGIN
  v_edition_id := public.clone_tournament_edition_for_simulation(p_source_edition_code);

  SELECT code INTO v_edition_code
  FROM public.tournament_editions
  WHERE id = v_edition_id;

  v_pool_id := public.create_pool_with_owner(
    p_pool_name,
    p_join_code,
    p_is_public,
    v_edition_id,
    true
  );

  pool_id := v_pool_id;
  edition_id := v_edition_id;
  edition_code := v_edition_code;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.bootstrap_simulation_pool(text, text, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bootstrap_simulation_pool(text, text, text, boolean) TO authenticated;

COMMENT ON FUNCTION public.bootstrap_simulation_pool(text, text, text, boolean) IS
  'Global admins: clone a simulation edition from the live template and create a simulation pool tied to it.';

-- ---------------------------------------------------------------------------
-- create_pool_for_current_user: always bind to official live edition
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
    is_simulation
  )
  VALUES (
    v_name,
    v_uid,
    v_code,
    COALESCE(p_is_public, false),
    v_official_id,
    false
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
