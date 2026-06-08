import { revalidateNhlPublicSurfaces } from "@/lib/nhl/revalidateNhlPublicSurfaces";
import { syncNhlSeriesFromNhleBracket } from "@/lib/nhl/syncNhlSeriesFromNhleBracket";
import { NextResponse } from "next/server";

function unauthorized() {
  return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
}

/** Vercel Cron and manual triggers send `Authorization: Bearer <CRON_SECRET>`. */
function cronSecretMatches(req: Request): boolean {
  const expected = process.env.CRON_SECRET?.trim();
  if (!expected) return false;
  const auth = req.headers.get("authorization") ?? "";
  const token = /^Bearer\s+(.+)$/i.exec(auth)?.[1]?.trim();
  return token === expected;
}

/**
 * Automated Round 1 series sync from the public NHLE bracket API into `nhl_series`.
 *
 * Enable with env: `NHL_PLAYOFF_SYNC_ENABLED=true`, `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`.
 * Opt-in playoff year: `NHL_PLAYOFF_BRACKET_YEAR` (default `2026`).
 */
export async function GET(req: Request) {
  if (process.env.NHL_PLAYOFF_SYNC_ENABLED?.trim() !== "true") {
    return NextResponse.json(
      { ok: false, error: "NHL_PLAYOFF_SYNC_ENABLED is not true — sync is disabled." },
      { status: 503 },
    );
  }

  if (!cronSecretMatches(req)) {
    return unauthorized();
  }

  const result = await syncNhlSeriesFromNhleBracket();

  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 502 });
  }

  revalidateNhlPublicSurfaces();

  return NextResponse.json({
    ok: true,
    playoffYear: result.playoffYear,
    round1Updated: result.round1Updated,
    round1Skipped: result.round1Skipped,
    errors: result.errors,
  });
}
