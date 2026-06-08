-- Operator support for production simulation pilots (global admins only).

CREATE TABLE public.admin_pilot_standings_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pool_id uuid NOT NULL REFERENCES public.pools(id) ON DELETE CASCADE,
  label text NOT NULL,
  captured_at timestamptz NOT NULL DEFAULT now(),
  captured_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ledger_recomputed_at timestamptz,
  summary_hash text NOT NULL,
  rows jsonb NOT NULL
);

CREATE INDEX admin_pilot_standings_snapshots_pool_captured_idx
  ON public.admin_pilot_standings_snapshots (pool_id, captured_at DESC);

COMMENT ON TABLE public.admin_pilot_standings_snapshots IS
  'Pre/post pilot standings captures for live pool comparison. Global admins only.';

CREATE TABLE public.admin_pilot_verification_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL,
  pool_id uuid REFERENCES public.pools(id) ON DELETE SET NULL,
  message text NOT NULL,
  payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX admin_pilot_verification_events_created_idx
  ON public.admin_pilot_verification_events (created_at DESC);

COMMENT ON TABLE public.admin_pilot_verification_events IS
  'Short operator-visible log for production pilot steps. Global admins only.';

ALTER TABLE public.admin_pilot_standings_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_pilot_verification_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY admin_pilot_standings_snapshots_admins_all
  ON public.admin_pilot_standings_snapshots
  FOR ALL
  TO authenticated
  USING (public.ashbracket_is_admin())
  WITH CHECK (public.ashbracket_is_admin());

CREATE POLICY admin_pilot_verification_events_admins_all
  ON public.admin_pilot_verification_events
  FOR ALL
  TO authenticated
  USING (public.ashbracket_is_admin())
  WITH CHECK (public.ashbracket_is_admin());
