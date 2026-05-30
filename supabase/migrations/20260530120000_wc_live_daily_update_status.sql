-- Last successful live daily score update per tournament edition.
-- Written after the organizer runs the one-step live daily update action.

CREATE TABLE public.wc_live_daily_update_status (
  edition_id uuid PRIMARY KEY REFERENCES public.tournament_editions (id) ON DELETE CASCADE,
  last_success_at timestamptz NOT NULL,
  finished_match_count int NOT NULL DEFAULT 0,
  derived_results_count int NOT NULL DEFAULT 0,
  pools_recalculated int NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER wc_live_daily_update_status_set_updated_at
  BEFORE UPDATE ON public.wc_live_daily_update_status
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.wc_live_daily_update_status IS
  'World Cup football: timestamp and counts from the last successful live daily score update (admin one-step action).';

ALTER TABLE public.wc_live_daily_update_status ENABLE ROW LEVEL SECURITY;

CREATE POLICY wc_live_daily_update_status_select
  ON public.wc_live_daily_update_status
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.app_admins a
      WHERE a.user_id = auth.uid()
    )
  );

CREATE POLICY wc_live_daily_update_status_insert
  ON public.wc_live_daily_update_status
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.app_admins a
      WHERE a.user_id = auth.uid()
    )
  );

CREATE POLICY wc_live_daily_update_status_update
  ON public.wc_live_daily_update_status
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.app_admins a
      WHERE a.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.app_admins a
      WHERE a.user_id = auth.uid()
    )
  );

GRANT SELECT, INSERT, UPDATE ON public.wc_live_daily_update_status TO authenticated;

-- Public read surface: official live editions only (not simulation).
CREATE OR REPLACE VIEW public.wc_live_daily_update_public
WITH (security_invoker = false)
AS
SELECT
  s.edition_id,
  e.code AS edition_code,
  s.last_success_at
FROM public.wc_live_daily_update_status s
INNER JOIN public.tournament_editions e ON e.id = s.edition_id
WHERE e.is_simulation = false;

COMMENT ON VIEW public.wc_live_daily_update_public IS
  'Last live daily score update timestamp for public leaderboard/rules pages. Live editions only.';

GRANT SELECT ON public.wc_live_daily_update_public TO anon, authenticated;
