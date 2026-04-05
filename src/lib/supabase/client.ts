/**
 * Browser Supabase module — use `createClient()` from Client Components only.
 */
import { createBrowserClient } from "@supabase/ssr";
import { getSupabaseAnonKey } from "../../../lib/supabase/anonKey";

/**
 * Supabase client for Client Components and other browser-only code.
 * Uses the publishable/anon key; session cookies are handled by @supabase/ssr.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    getSupabaseAnonKey(),
  );
}
