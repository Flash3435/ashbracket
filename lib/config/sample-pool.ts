/**
 * Default pool id for local seed (`ashbracket/supabase/seed.sql`) and demos.
 * In production, set `NEXT_PUBLIC_SAMPLE_POOL_ID` to your public pool UUID so
 * `/rules` and the public leaderboard query the same pool as Supabase.
 */
export const DEFAULT_SAMPLE_POOL_ID =
  "a0000001-0000-4000-8000-000000000001";

function samplePoolIdFromEnv(): string | undefined {
  const raw = process.env.NEXT_PUBLIC_SAMPLE_POOL_ID?.trim();
  return raw && raw.length > 0 ? raw : undefined;
}

/** Pool id for public `/rules`, leaderboard, and admin sample-pool flows. */
export const SAMPLE_POOL_ID = samplePoolIdFromEnv() ?? DEFAULT_SAMPLE_POOL_ID;

/**
 * True when `poolId` is the configured sample pool, ignoring case/whitespace.
 * Production env UUIDs may not match Postgres casing; PostgREST usually returns lowercase.
 */
export function poolIdsMatchConfiguredSample(poolId: string): boolean {
  return (
    poolId.trim().toLowerCase() === SAMPLE_POOL_ID.trim().toLowerCase()
  );
}

/** Default join code for the sample pool (seed + migration). */
export const SAMPLE_POOL_JOIN_CODE = "ASH2026" as const;
