/**
 * Load WC 2026 teams + group-stage matches (requires service role; bypasses RLS).
 *
 * Usage (from ashbracket/):
 *   export SUPABASE_SERVICE_ROLE_KEY="..."
 *   export NEXT_PUBLIC_SUPABASE_URL="https://....supabase.co"
 *   npm run seed:wc2026
 */

import { createClient } from "@supabase/supabase-js";
import { seedOfficialWc2026 } from "../lib/tournament/seedOfficialWc2026";

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error(
      "Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment.",
    );
    process.exit(1);
  }

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

main();
