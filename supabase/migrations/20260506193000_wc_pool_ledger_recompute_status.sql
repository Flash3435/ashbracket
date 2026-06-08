-- Internal World Cup diagnostics: last successful points_ledger recompute per pool.
-- Written from application code after replace_points_ledger_for_pool succeeds.
-- Readable by global admins and pool managers (same gate as pool admin surfaces).

CREATE TABLE public.wc_pool_ledger_recompute_status (
  pool_id uuid PRIMARY KEY REFERENCES public.pools (id) ON DELETE CASCADE,
  last_success_at timestamptz NOT NULL,
  last_trigger text NOT NULL CHECK (
    last_trigger IN (
      'participant_save',
      'tournament_sync',
      'admin_manual_recompute',
      'admin_pick_edit',
      'admin_result_edit',
      'admin_recompute_all_pools'
    )
  ),
  last_status text NOT NULL DEFAULT 'ok' CHECK (last_status IN ('ok', 'error')),
  last_error text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER wc_pool_ledger_recompute_status_set_updated_at
  BEFORE UPDATE ON public.wc_pool_ledger_recompute_status
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.wc_pool_ledger_recompute_status IS
  'World Cup football: last successful leaderboard (points_ledger) recompute per pool. Admin diagnostics only; not shown to public participants.';

COMMENT ON COLUMN public.wc_pool_ledger_recompute_status.last_trigger IS
  'Application-defined source of the last successful recompute (participant_save, tournament_sync, admin_*, etc.).';

ALTER TABLE public.wc_pool_ledger_recompute_status ENABLE ROW LEVEL SECURITY;

CREATE POLICY wc_pool_ledger_recompute_status_select
  ON public.wc_pool_ledger_recompute_status
  FOR SELECT
  TO authenticated
  USING (public.ashbracket_can_manage_pool(pool_id));

CREATE POLICY wc_pool_ledger_recompute_status_insert
  ON public.wc_pool_ledger_recompute_status
  FOR INSERT
  TO authenticated
  WITH CHECK (public.ashbracket_can_manage_pool(pool_id));

CREATE POLICY wc_pool_ledger_recompute_status_update
  ON public.wc_pool_ledger_recompute_status
  FOR UPDATE
  TO authenticated
  USING (public.ashbracket_can_manage_pool(pool_id))
  WITH CHECK (public.ashbracket_can_manage_pool(pool_id));

GRANT SELECT, INSERT, UPDATE ON public.wc_pool_ledger_recompute_status TO authenticated;
