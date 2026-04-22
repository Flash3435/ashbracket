import { createClient } from "@/lib/supabase/server";
import { safeRedirectPath } from "@/lib/auth/safeRedirectPath";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Email confirmation landing (Supabase Auth PKCE).
 * Configure this path under Supabase → Authentication → URL Configuration → Redirect URLs.
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = safeRedirectPath(
    url.searchParams.get("next") ?? undefined,
    "/join",
  );
  const origin = url.origin;

  if (!code) {
    return NextResponse.redirect(
      `${origin}/login?error=auth_confirm&next=${encodeURIComponent(next)}`,
    );
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(
      `${origin}/login?error=auth_confirm&next=${encodeURIComponent(next)}`,
    );
  }

  return NextResponse.redirect(`${origin}${next}`);
}
