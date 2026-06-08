-- Aggregate pool stats for public pages (registered / paid counts, prize pool).
-- SECURITY DEFINER reads participant payment fields only inside this function;
-- no per-participant payment data is returned. Callable only for public pools.

CREATE OR REPLACE FUNCTION public.pool_public_stats(p_pool_id uuid)
RETURNS TABLE (
  registered_count bigint,
  paid_count bigint,
  entry_fee_cents integer,
  prize_pool_cents bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COALESCE(COUNT(par.id), 0)::bigint AS registered_count,
    COALESCE(
      COUNT(par.id) FILTER (WHERE par.is_paid IS TRUE),
      0
    )::bigint AS paid_count,
    pl.entry_fee_cents,
    CASE
      WHEN pl.entry_fee_cents IS NULL THEN NULL::bigint
      ELSE (
        COALESCE(
          COUNT(par.id) FILTER (WHERE par.is_paid IS TRUE),
          0
        ) * pl.entry_fee_cents
      )::bigint
    END AS prize_pool_cents
  FROM public.pools pl
  LEFT JOIN public.participants par ON par.pool_id = pl.id
  WHERE pl.id = p_pool_id
    AND pl.is_public IS TRUE
  GROUP BY pl.id, pl.entry_fee_cents;
$$;

COMMENT ON FUNCTION public.pool_public_stats(uuid) IS
  'Returns aggregate registration and payment stats for a public pool only. No per-user payment fields.';

REVOKE ALL ON FUNCTION public.pool_public_stats(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pool_public_stats(uuid) TO anon, authenticated;
