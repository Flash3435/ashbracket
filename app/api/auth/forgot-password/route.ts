import { sendPasswordResetEmail } from "@/lib/auth/sendPasswordResetEmail";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

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
  const supabase = await createClient();
  const result = await sendPasswordResetEmail(supabase, trimmed);

  if (!result.ok) {
    if (result.error === "Enter a valid email address.") {
      return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
    }
    if (result.error === "Password reset is temporarily unavailable.") {
      return NextResponse.json({ ok: false, error: result.error }, { status: 500 });
    }
  }

  return NextResponse.json({
    ok: true,
    ...(process.env.NODE_ENV === "development" && result.ok
      ? { redirectTo: result.redirectTo }
      : {}),
  });
}
