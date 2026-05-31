import { createClient } from "@/lib/supabase/server";
import { safeRedirectPath } from "@/lib/auth/safeRedirectPath";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Email confirmation landing (Supabase Auth PKCE).
 * Configure this path under Supabase → Authentication → URL Configuration → Redirect URLs.
 * Also allow `/reset-password` and `/forgot-password` for password recovery emails.
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const rawNext = url.searchParams.get("next") ?? undefined;
  const next = safeRedirectPath(rawNext, "/join");
  const origin = url.origin;
  const loginPath =
    rawNext && (rawNext === "/nhl" || rawNext.startsWith("/nhl/"))
      ? "/nhl/login"
      : "/login";

  if (!code) {
    return NextResponse.redirect(
      `${origin}${loginPath}?error=auth_confirm&next=${encodeURIComponent(next)}`,
    );
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(
      `${origin}${loginPath}?error=auth_confirm&next=${encodeURIComponent(next)}`,
    );
  }

  return NextResponse.redirect(`${origin}${next}`);
}
