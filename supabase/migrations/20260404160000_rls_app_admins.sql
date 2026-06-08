-- Row Level Security: anonymous users get no access; one (or more) app admins listed in app_admins.
--
-- Bootstrap (run once in Supabase SQL Editor as a privileged user, after your Auth user exists):
--   INSERT INTO public.app_admins (user_id) VALUES ('<uuid-from-auth.users>');

-- ---------------------------------------------------------------------------
-- Admin whitelist (who may manage pool data)
-- ---------------------------------------------------------------------------

CREATE TABLE public.app_admins (
  user_id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE
);

ALTER TABLE public.app_admins ENABLE ROW LEVEL SECURITY;

-- Lets a signed-in user see only their own row, so EXISTS checks in other policies work under RLS.
CREATE POLICY app_admins_select_own_row
  ON public.app_admins
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- No INSERT/UPDATE/DELETE for anon or authenticated: add admins via SQL Editor (or service role).

-- ---------------------------------------------------------------------------
-- Single gate for policies on domain tables
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.ashbracket_is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.app_admins a
    WHERE a.user_id = auth.uid()
  );
$$;

REVOKE ALL ON FUNCTION public.ashbracket_is_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ashbracket_is_admin() TO authenticated;

-- ---------------------------------------------------------------------------
-- Enable RLS + one policy per table (all operations for admins only)
-- ---------------------------------------------------------------------------

ALTER TABLE public.pools ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.predictions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scoring_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.points_ledger ENABLE ROW LEVEL SECURITY;

CREATE POLICY pools_admins_all
  ON public.pools
  FOR ALL
  TO authenticated
  USING (public.ashbracket_is_admin())
  WITH CHECK (public.ashbracket_is_admin());

CREATE POLICY participants_admins_all
  ON public.participants
  FOR ALL
  TO authenticated
  USING (public.ashbracket_is_admin())
  WITH CHECK (public.ashbracket_is_admin());

CREATE POLICY predictions_admins_all
  ON public.predictions
  FOR ALL
  TO authenticated
  USING (public.ashbracket_is_admin())
  WITH CHECK (public.ashbracket_is_admin());

CREATE POLICY results_admins_all
  ON public.results
  FOR ALL
  TO authenticated
  USING (public.ashbracket_is_admin())
  WITH CHECK (public.ashbracket_is_admin());

CREATE POLICY scoring_rules_admins_all
  ON public.scoring_rules
  FOR ALL
  TO authenticated
  USING (public.ashbracket_is_admin())
  WITH CHECK (public.ashbracket_is_admin());

CREATE POLICY points_ledger_admins_all
  ON public.points_ledger
  FOR ALL
  TO authenticated
  USING (public.ashbracket_is_admin())
  WITH CHECK (public.ashbracket_is_admin());
