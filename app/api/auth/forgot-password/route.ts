import {
  assertPasswordResetRedirectUrl,
  buildPasswordResetRedirectUrl,
  logPasswordResetRedirect,
} from "@/lib/auth/passwordResetRedirect";
import { isValidEmailFormat } from "@/lib/auth/authFormValidation";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  let body: { email?: string };
  try {
    body = (await request.json()) as { email?: string };
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid request." },
      { status: 400 },
    );
  }

  const trimmed = body.email?.trim() ?? "";
  if (!isValidEmailFormat(trimmed)) {
    return NextResponse.json(
      { ok: false, error: "Enter a valid email address." },
      { status: 400 },
    );
  }

  const redirectTo = buildPasswordResetRedirectUrl();
  try {
    assertPasswordResetRedirectUrl(redirectTo);
  } catch (e) {
    console.error("[forgot-password] invalid redirect URL:", e);
    return NextResponse.json(
      { ok: false, error: "Password reset is temporarily unavailable." },
      { status: 500 },
    );
  }

  logPasswordResetRedirect(redirectTo);
  console.info("[forgot-password] resetPasswordForEmail redirectTo:", redirectTo);

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(trimmed, {
    redirectTo,
  });

  if (error) {
    console.error("[forgot-password] supabase error:", error.message);
  }

  return NextResponse.json({
    ok: true,
    ...(process.env.NODE_ENV === "development" ? { redirectTo } : {}),
  });
}
