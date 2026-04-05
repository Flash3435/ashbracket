/**
 * Server Supabase module — use `createClient()` from Server Components, actions, or route handlers.
 */
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getSupabaseAnonKey } from "../../../lib/supabase/anonKey";

/**
 * Supabase client for Server Components, Server Actions, and Route Handlers.
 * Reads/writes auth cookies via Next’s cookie store when the runtime allows it.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    getSupabaseAnonKey(),
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // Called from a Server Component where cookies are read-only; refreshing sessions belongs in middleware or a Route Handler.
          }
        },
      },
    },
  );
}
