-- NHL Phase 2: isolated Stanley Cup playoff data model (does not modify World Cup tables).
-- RLS: global app admins only (same gate as tournament_editions / tournament_matches).

-- ---------------------------------------------------------------------------
-- Editions
-- ---------------------------------------------------------------------------

CREATE TABLE public.nhl_editions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  season_label text NOT NULL,
  is_active boolean NOT NULL DEFAULT false,
  lock_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER nhl_editions_set_updated_at
  BEFORE UPDATE ON public.nhl_editions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.nhl_editions IS
  'NHL playoff product edition (e.g. one Stanley Cup year). Isolated from World Cup tournament_editions.';

-- ---------------------------------------------------------------------------
-- Teams (per edition; not public.teams)
-- ---------------------------------------------------------------------------

CREATE TABLE public.nhl_teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  edition_id uuid NOT NULL REFERENCES public.nhl_editions (id) ON DELETE CASCADE,
  team_name text NOT NULL,
  team_slug text NOT NULL,
  abbreviation text NOT NULL,
  conference text NOT NULL CHECK (conference IN ('east', 'west')),
  division text,
  seed integer CHECK (seed IS NULL OR (seed >= 1 AND seed <= 16)),
  logo_path text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT nhl_teams_edition_slug_unique UNIQUE (edition_id, team_slug),
  CONSTRAINT nhl_teams_edition_abbr_unique UNIQUE (edition_id, abbreviation)
);

CREATE INDEX idx_nhl_teams_edition_id ON public.nhl_teams (edition_id);

COMMENT ON TABLE public.nhl_teams IS
  'NHL clubs for a given nhl_editions row. Scoped by edition_id.';

-- ---------------------------------------------------------------------------
-- Series / bracket slots
-- ---------------------------------------------------------------------------

CREATE TABLE public.nhl_series (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  edition_id uuid NOT NULL REFERENCES public.nhl_editions (id) ON DELETE CASCADE,
  round_code text NOT NULL CHECK (round_code IN ('R1', 'R2', 'CF', 'SCF')),
  round_order smallint NOT NULL CHECK (round_order >= 1 AND round_order <= 4),
  side_or_conference text CHECK (
    side_or_conference IS NULL
    OR side_or_conference IN ('east', 'west', 'cup')
  ),
  slot_index smallint NOT NULL CHECK (slot_index >= 1 AND slot_index <= 8),
  higher_seed_team_id uuid REFERENCES public.nhl_teams (id) ON DELETE SET NULL,
  lower_seed_team_id uuid REFERENCES public.nhl_teams (id) ON DELETE SET NULL,
  winner_team_id uuid REFERENCES public.nhl_teams (id) ON DELETE SET NULL,
  games_won_by_higher_seed smallint NOT NULL DEFAULT 0 CHECK (games_won_by_higher_seed >= 0),
  games_won_by_lower_seed smallint NOT NULL DEFAULT 0 CHECK (games_won_by_lower_seed >= 0),
  best_of smallint NOT NULL DEFAULT 7 CHECK (best_of IN (5, 7)),
  status text NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'in_progress', 'complete')
  ),
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT nhl_series_bracket_slot_unique UNIQUE (edition_id, round_code, side_or_conference, slot_index)
);

CREATE INDEX idx_nhl_series_edition_round ON public.nhl_series (edition_id, round_order, side_or_conference, slot_index);

CREATE TRIGGER nhl_series_set_updated_at
  BEFORE UPDATE ON public.nhl_series
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.nhl_series IS
  'Playoff series / bracket slot for an edition. Team FKs nullable until matchups are set.';

-- ---------------------------------------------------------------------------
-- RLS (global admins via ashbracket_is_admin)
-- ---------------------------------------------------------------------------

ALTER TABLE public.nhl_editions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nhl_teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nhl_series ENABLE ROW LEVEL SECURITY;

CREATE POLICY nhl_editions_global_admins_all
  ON public.nhl_editions
  FOR ALL
  TO authenticated
  USING (public.ashbracket_is_admin())
  WITH CHECK (public.ashbracket_is_admin());

CREATE POLICY nhl_teams_global_admins_all
  ON public.nhl_teams
  FOR ALL
  TO authenticated
  USING (public.ashbracket_is_admin())
  WITH CHECK (public.ashbracket_is_admin());

CREATE POLICY nhl_series_global_admins_all
  ON public.nhl_series
  FOR ALL
  TO authenticated
  USING (public.ashbracket_is_admin())
  WITH CHECK (public.ashbracket_is_admin());
