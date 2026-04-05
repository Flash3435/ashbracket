-- AshBracket initial schema (PostgreSQL / Supabase)
-- prediction_kind values align with src/types/domain.ts

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

CREATE TABLE public.pools (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pool_id uuid NOT NULL REFERENCES public.pools (id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  display_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  country_code char(2) NOT NULL,
  fifa_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT teams_country_code_upper CHECK (country_code = upper(country_code))
);

CREATE TABLE public.tournament_stages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL,
  label text NOT NULL,
  sort_order int NOT NULL,
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tournament_stages_code_unique UNIQUE (code)
);

CREATE TABLE public.predictions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pool_id uuid NOT NULL REFERENCES public.pools (id) ON DELETE CASCADE,
  participant_id uuid NOT NULL REFERENCES public.participants (id) ON DELETE CASCADE,
  prediction_kind text NOT NULL CHECK (
    prediction_kind IN (
      'group_winner',
      'group_runner_up',
      'quarterfinalist',
      'semifinalist',
      'finalist',
      'champion',
      'bonus_pick'
    )
  ),
  team_id uuid REFERENCES public.teams (id) ON DELETE RESTRICT,
  tournament_stage_id uuid REFERENCES public.tournament_stages (id) ON DELETE SET NULL,
  group_code text,
  slot_key text,
  bonus_key text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT predictions_group_code_upper CHECK (
    group_code IS NULL OR group_code = upper(group_code)
  )
);

CREATE TABLE public.results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_stage_id uuid NOT NULL REFERENCES public.tournament_stages (id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (
    kind IN (
      'group_winner',
      'group_runner_up',
      'quarterfinalist',
      'semifinalist',
      'finalist',
      'champion',
      'bonus_pick'
    )
  ),
  team_id uuid NOT NULL REFERENCES public.teams (id) ON DELETE RESTRICT,
  group_code text,
  slot_key text,
  resolved_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT results_group_code_upper CHECK (
    group_code IS NULL OR group_code = upper(group_code)
  )
);

CREATE TABLE public.scoring_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pool_id uuid NOT NULL REFERENCES public.pools (id) ON DELETE CASCADE,
  prediction_kind text NOT NULL CHECK (
    prediction_kind IN (
      'group_winner',
      'group_runner_up',
      'quarterfinalist',
      'semifinalist',
      'finalist',
      'champion',
      'bonus_pick'
    )
  ),
  points int NOT NULL CHECK (points >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT scoring_rules_pool_kind_unique UNIQUE (pool_id, prediction_kind)
);

CREATE TABLE public.points_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pool_id uuid NOT NULL REFERENCES public.pools (id) ON DELETE CASCADE,
  participant_id uuid NOT NULL REFERENCES public.participants (id) ON DELETE CASCADE,
  points_delta int NOT NULL,
  prediction_kind text,
  prediction_id uuid REFERENCES public.predictions (id) ON DELETE SET NULL,
  result_id uuid REFERENCES public.results (id) ON DELETE SET NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT points_ledger_prediction_kind_ok CHECK (
    prediction_kind IS NULL
    OR prediction_kind IN (
      'group_winner',
      'group_runner_up',
      'quarterfinalist',
      'semifinalist',
      'finalist',
      'champion',
      'bonus_pick'
    )
  )
);

-- ---------------------------------------------------------------------------
-- Uniqueness: one pick per participant per logical slot
-- ---------------------------------------------------------------------------

CREATE UNIQUE INDEX predictions_one_per_slot ON public.predictions (
  participant_id,
  pool_id,
  prediction_kind,
  tournament_stage_id,
  group_code,
  slot_key,
  bonus_key
)
NULLS NOT DISTINCT;

CREATE UNIQUE INDEX results_one_per_slot ON public.results (
  tournament_stage_id,
  kind,
  group_code,
  slot_key
)
NULLS NOT DISTINCT;

-- ---------------------------------------------------------------------------
-- Indexes for common queries
-- ---------------------------------------------------------------------------

CREATE INDEX idx_participants_pool_id ON public.participants (pool_id);
CREATE INDEX idx_participants_user_id ON public.participants (user_id)
  WHERE user_id IS NOT NULL;

CREATE INDEX idx_predictions_pool_participant ON public.predictions (pool_id, participant_id);
CREATE INDEX idx_predictions_participant_id ON public.predictions (participant_id);
CREATE INDEX idx_predictions_team_id ON public.predictions (team_id)
  WHERE team_id IS NOT NULL;

CREATE INDEX idx_results_tournament_stage_id ON public.results (tournament_stage_id);
CREATE INDEX idx_results_team_id ON public.results (team_id);

CREATE INDEX idx_scoring_rules_pool_id ON public.scoring_rules (pool_id);

CREATE INDEX idx_points_ledger_pool_participant ON public.points_ledger (pool_id, participant_id);
CREATE INDEX idx_points_ledger_participant_created ON public.points_ledger (participant_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------

CREATE TRIGGER pools_set_updated_at
  BEFORE UPDATE ON public.pools
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER participants_set_updated_at
  BEFORE UPDATE ON public.participants
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER teams_set_updated_at
  BEFORE UPDATE ON public.teams
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER tournament_stages_set_updated_at
  BEFORE UPDATE ON public.tournament_stages
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER predictions_set_updated_at
  BEFORE UPDATE ON public.predictions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER scoring_rules_set_updated_at
  BEFORE UPDATE ON public.scoring_rules
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
