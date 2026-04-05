import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isAppAdmin } from "../auth/isAppAdmin";
import mwKeys from "./middleware-keys.json";

function copyAuthCookies(from: NextResponse, to: NextResponse) {
  from.cookies.getAll().forEach((c) => {
    to.cookies.set(c.name, c.value, c);
  });
}

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  // Bundled JSON from `scripts/sync-middleware-env.mjs` (npm predev/prebuild). Turbopack Edge
  // middleware often receives empty `process.env` in dev even when `.env.local` exists.
  const supabaseUrl =
    mwKeys.supabaseUrl.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
    "";
  const supabaseAnonKey =
    mwKeys.supabaseAnonKey.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ||
    "";
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      "Missing Supabase URL or anon key. From ashbracket run `node scripts/sync-middleware-env.mjs` then `npm run dev`, and ensure .env.local has NEXT_PUBLIC_SUPABASE_URL and a key.",
    );
  }

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => {
          supabaseResponse.cookies.set(name, value, options);
        });
        Object.entries(headers).forEach(([key, value]) => {
          supabaseResponse.headers.set(key, value);
        });
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (request.nextUrl.pathname.startsWith("/admin")) {
    if (!user) {
      const loginUrl = request.nextUrl.clone();
      loginUrl.pathname = "/login";
      loginUrl.searchParams.set(
        "next",
        `${request.nextUrl.pathname}${request.nextUrl.search}`,
      );
      const redirect = NextResponse.redirect(loginUrl);
      copyAuthCookies(supabaseResponse, redirect);
      return redirect;
    }

    const admin = await isAppAdmin(supabase, user.id);
    if (!admin) {
      const forbiddenUrl = request.nextUrl.clone();
      forbiddenUrl.pathname = "/login";
      forbiddenUrl.searchParams.set("error", "forbidden");
      const redirect = NextResponse.redirect(forbiddenUrl);
      copyAuthCookies(supabaseResponse, redirect);
      return redirect;
    }
  }

  return supabaseResponse;
}
