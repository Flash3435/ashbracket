-- Lets the app know when the official Round of 32 bracket (all 32 seeded slots) is
-- published in `results`, without granting public SELECT on `results` (admin-only RLS).

CREATE OR REPLACE FUNCTION public.official_round_of_32_complete(p_tournament_stage_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)::int >= 32
  FROM public.results r
  WHERE r.tournament_stage_id = p_tournament_stage_id
    AND r.kind = 'round_of_32'
    AND r.team_id IS NOT NULL
    AND r.group_code IS NULL;
$$;

COMMENT ON FUNCTION public.official_round_of_32_complete(uuid) IS
  'True when at least 32 official round_of_32 result rows exist with a team_id. Used to unlock participant knockout bracket picks (Option A UX).';

REVOKE ALL ON FUNCTION public.official_round_of_32_complete(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.official_round_of_32_complete(uuid) TO anon, authenticated;
