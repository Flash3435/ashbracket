/**
 * Bootstrap NHL Phase 2 data (edition + starter teams + bracket skeleton) using the
 * service role key — bypasses RLS. Intended for local/dev after migrations.
 *
 * Usage (from ashbracket/):
 *   npm run seed:nhl-phase2
 *
 * Requires `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` (see seed-official-wc2026.ts).
 */

import { createClient } from "@supabase/supabase-js";
import { runNhlPhase2ServiceSeed } from "../lib/nhl/serviceSeedPhase2";
import { loadEnvLocal } from "./loadEnvLocal";

function validateSupabaseEnv(url: string, key: string): void {
  const lowerUrl = url.toLowerCase();
  if (
    lowerUrl.includes("your_project") ||
    lowerUrl.includes("your-project") ||
    url.includes("YOUR_PROJECT")
  ) {
    console.error("NEXT_PUBLIC_SUPABASE_URL still looks like a placeholder.");
    process.exit(1);
  }
  try {
    const u = new URL(url);
    if (u.protocol !== "https:") {
      console.error("NEXT_PUBLIC_SUPABASE_URL must use https://");
      process.exit(1);
    }
  } catch {
    console.error("NEXT_PUBLIC_SUPABASE_URL is not a valid URL.");
    process.exit(1);
  }

  const keyTrim = key.trim();
  if (keyTrim.length < 100 || /^your[-_]?service[-_]?role$/i.test(keyTrim)) {
    console.error(
      "SUPABASE_SERVICE_ROLE_KEY does not look like a real service_role JWT.",
    );
    process.exit(1);
  }
}

async function main() {
  loadEnvLocal();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) {
    console.error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env.",
    );
    process.exit(1);
  }

  validateSupabaseEnv(url, key);

  const supabase = createClient(url, key);
  const out = await runNhlPhase2ServiceSeed(supabase);
  for (const m of out.messages) {
    console.log(m);
  }
  if (!out.ok) {
    console.error(out.error ?? "Unknown error");
    process.exit(1);
  }
  console.log("OK: NHL Phase 2 seed finished.");
}

main().catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error("Seed failed:", msg);
  process.exit(1);
});
