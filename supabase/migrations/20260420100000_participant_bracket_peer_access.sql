-- Read-only bracket snapshot for pool peers: header RPC + predictions SELECT for same-pool members.
-- Public pools continue to use predictions_public / leaderboard_public for anonymous reads.

-- ---------------------------------------------------------------------------
-- RLS: pool participants may SELECT any predictions row in pools they belong to
-- (enables private-pool members to view teammates' picks via the app server client).
-- ---------------------------------------------------------------------------

CREATE POLICY predictions_select_same_pool_peers
  ON public.predictions
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.participants p_self
      WHERE p_self.user_id = auth.uid()
        AND p_self.pool_id = predictions.pool_id
    )
  );

COMMENT ON POLICY predictions_select_same_pool_peers ON public.predictions IS
  'Allows authenticated pool members to read all predictions rows in their pool (standings / peer bracket views).';

-- ---------------------------------------------------------------------------
-- SECURITY DEFINER: safe header for bracket snapshot (no participants table widen)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.ashbracket_participant_bracket_header(
  p_participant_id uuid
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'display_name', pt.display_name,
    'pool_id', pt.pool_id,
    'pool_name', pl.name,
    'lock_at', pl.lock_at,
    'is_public', pl.is_public
  )
  FROM public.participants pt
  INNER JOIN public.pools pl ON pl.id = pt.pool_id
  WHERE pt.id = p_participant_id
    AND (
      pl.is_public IS TRUE
      OR public.ashbracket_can_manage_pool(pt.pool_id)
      OR (
        auth.uid() IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM public.participants pv
          WHERE pv.user_id = auth.uid()
            AND pv.pool_id = pt.pool_id
        )
      )
    );
$$;

COMMENT ON FUNCTION public.ashbracket_participant_bracket_header(uuid) IS
  'Returns pool + display metadata for a participant when the caller may view that bracket (public pool, same-pool member, or pool manager).';

REVOKE ALL ON FUNCTION public.ashbracket_participant_bracket_header(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ashbracket_participant_bracket_header(uuid) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- Backfill activity links (historical rows pointed at account-owned summary)
-- ---------------------------------------------------------------------------

UPDATE public.pool_activity pa
SET related_path =
  '/participant/' || pa.participant_id::text || '/snapshot?from=activity'
WHERE pa.participant_id IS NOT NULL
  AND pa.related_path IS NOT NULL
  AND pa.related_path LIKE '/account/picks/summary?participant=%';
