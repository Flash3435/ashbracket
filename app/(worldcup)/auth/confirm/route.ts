import { createClient } from "@/lib/supabase/server";
import { safeRedirectPath } from "@/lib/auth/safeRedirectPath";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Email confirmation landing (Supabase Auth PKCE).
 * Configure this path under Supabase → Authentication → URL Configuration → Redirect URLs.
 * Password reset emails use `redirect_to` → `/auth/confirm?next=/reset-password` (see `passwordResetRedirect.ts`).
 * Allow that path and `/forgot-password` under Supabase → Authentication → URL Configuration.
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
      : rawNext &&
          (rawNext === "/nhldraft26" || rawNext.startsWith("/nhldraft26/"))
        ? "/nhldraft26/login"
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
