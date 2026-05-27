-- Scope the Round of 32 unlock RPC by edition so simulation editions never unlock
-- live participant flows (and vice versa).

DROP FUNCTION IF EXISTS public.official_round_of_32_complete(uuid);

CREATE OR REPLACE FUNCTION public.official_round_of_32_complete(
  p_tournament_stage_id uuid,
  p_edition_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)::int >= 32
  FROM public.results r
  WHERE r.tournament_stage_id = p_tournament_stage_id
    AND r.edition_id = p_edition_id
    AND r.kind = 'round_of_32'
    AND r.team_id IS NOT NULL
    AND r.group_code IS NULL;
$$;

COMMENT ON FUNCTION public.official_round_of_32_complete(uuid, uuid) IS
  'True when at least 32 round_of_32 result rows exist with a team_id for one tournament edition. Used to unlock participant knockout bracket picks safely for live and simulation editions.';

REVOKE ALL ON FUNCTION public.official_round_of_32_complete(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.official_round_of_32_complete(uuid, uuid) TO anon, authenticated;
