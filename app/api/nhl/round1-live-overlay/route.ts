import { createClient } from "@/lib/supabase/server";
import {
  fetchNhleBracketJsonForOverlay,
  overlayRound1SeriesRowsFromBracket,
} from "@/lib/nhl/nhleBracketOverlay";
import { fetchActiveNhlEdition, fetchNhlSeriesRowsForEdition } from "@/lib/nhl/queries";
import { syncWinnerDisplayFieldsFromSeeds } from "@/lib/nhl/nhlSeriesRowLabels";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Same-origin JSON for client-side NHL picks: merges NHLE bracket onto DB series rows.
 * Avoids relying on RSC-time outbound fetch to NHLE (some hosts block or cache oddly).
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const { edition, error: edErr } = await fetchActiveNhlEdition(supabase);
    if (edErr || !edition) {
      return NextResponse.json({ ok: false, error: "no_active_edition" }, { status: 404 });
    }

    const { rows, error: rowErr } = await fetchNhlSeriesRowsForEdition(supabase, edition.id);
    if (rowErr) {
      return NextResponse.json({ ok: false, error: rowErr }, { status: 502 });
    }

    const bracket = await fetchNhleBracketJsonForOverlay();
    if (!bracket) {
      return NextResponse.json({
        ok: true,
        nhle: "unavailable",
        rows: rows.map(syncWinnerDisplayFieldsFromSeeds),
      });
    }

    const merged = overlayRound1SeriesRowsFromBracket(rows, bracket).map(syncWinnerDisplayFieldsFromSeeds);
    return NextResponse.json({ ok: true, nhle: "ok", rows: merged });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
