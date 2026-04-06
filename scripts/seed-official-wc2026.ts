/**
 * Load WC 2026 teams + group-stage matches (requires service role; bypasses RLS).
 *
 * Usage (from ashbracket/):
 *   npm run seed:wc2026
 *
 * Reads `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` from the
 * environment, or from `.env.local` if those are not already set.
 *
 * Supabase Dashboard → Project Settings → API:
 *   - Project URL → NEXT_PUBLIC_SUPABASE_URL
 *   - service_role (secret) → SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from "@supabase/supabase-js";
import { seedOfficialWc2026 } from "../lib/tournament/seedOfficialWc2026";
import { loadEnvLocal } from "./loadEnvLocal";

function validateSupabaseEnv(url: string, key: string): void {
  const lowerUrl = url.toLowerCase();
  if (
    lowerUrl.includes("your_project") ||
    lowerUrl.includes("your-project") ||
    url.includes("YOUR_PROJECT")
  ) {
    console.error(
      "NEXT_PUBLIC_SUPABASE_URL still looks like a placeholder (e.g. YOUR_PROJECT).\n" +
        "Use your real Project URL from Supabase → Settings → API (ends in .supabase.co).",
    );
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
      "SUPABASE_SERVICE_ROLE_KEY does not look like a real JWT (service_role secret).\n" +
        "Copy the full service_role key from Supabase → Settings → API (not the anon key).",
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
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.\n" +
        "Add them to ashbracket/.env.local or export them in the shell before running.",
    );
    process.exit(1);
  }

  validateSupabaseEnv(url, key);

  const supabase = createClient(url, key);
  const out = await seedOfficialWc2026(supabase);
  if (!out.ok) {
    console.error(out.error);
    process.exit(1);
  }
  console.log(
    `OK: edition_id=${out.editionId} matches_upserted=${out.matchCount}`,
  );
}

main().catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error("Seed failed:", msg);
  if (err instanceof Error && err.cause instanceof Error) {
    console.error("Cause:", err.cause.message);
  }
  if (msg.includes("fetch failed") || msg === "fetch failed") {
    console.error(
      "\n\"fetch failed\" usually means the URL is wrong or unreachable (wrong host, no network, or TLS).\n" +
        "Confirm NEXT_PUBLIC_SUPABASE_URL matches your Supabase project (https://xxxxx.supabase.co).",
    );
  }
  process.exit(1);
});
