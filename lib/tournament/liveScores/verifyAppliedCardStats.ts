import type { SupabaseClient } from "@supabase/supabase-js";
import { formatCardTotals } from "./loadMatchCardStatsForLiveScores";
import type {
  LiveScoresApplyCardDetail,
  ProviderCardPatchInput,
  ScoreChangePreviewRow,
} from "./types";

type DbStatRow = {
  match_id: string;
  team_id: string;
  yellow_cards: number | null;
  red_cards: number | null;
  source: string;
};

export function buildCardApplyVerificationDetails(input: {
  previewRows: ScoreChangePreviewRow[];
  patches: ProviderCardPatchInput[];
  dbRows: DbStatRow[];
  writtenMatchCodes: string[];
}): LiveScoresApplyCardDetail[] {
  const patchByCode = new Map(input.patches.map((p) => [p.matchCode, p]));
  const writtenSet = new Set(input.writtenMatchCodes);

  const rowsByMatch = new Map<string, DbStatRow[]>();
  for (const row of input.dbRows) {
    const list = rowsByMatch.get(row.match_id) ?? [];
    list.push(row);
    rowsByMatch.set(row.match_id, list);
  }

  return input.previewRows
    .filter((r) => r.cardWillUpdate)
    .map((row) => {
      const patch = patchByCode.get(row.matchCode);
      if (!patch) {
        return {
          matchCode: row.matchCode,
          matchId: row.matchId,
          planned: true,
          written: false,
          verified: false,
          reason: "card patch missing",
          expectedCards: null,
          actualCards: null,
        };
      }

      const expectedCards = formatCardTotals(
        patch.homeYellowCards,
        patch.awayYellowCards,
        patch.homeRedCards,
        patch.awayRedCards,
      );

      const dbForMatch = rowsByMatch.get(patch.matchId) ?? [];
      const providerRows = dbForMatch.filter((r) => r.source === "provider");
      const homeRow = providerRows.find((r) => r.team_id === patch.homeTeamId);
      const awayRow = providerRows.find((r) => r.team_id === patch.awayTeamId);

      const actualCards =
        homeRow && awayRow
          ? formatCardTotals(
              homeRow.yellow_cards,
              awayRow.yellow_cards,
              homeRow.red_cards,
              awayRow.red_cards,
            )
          : null;

      const verified =
        homeRow?.yellow_cards === patch.homeYellowCards &&
        awayRow?.yellow_cards === patch.awayYellowCards &&
        homeRow?.red_cards === patch.homeRedCards &&
        awayRow?.red_cards === patch.awayRedCards;

      const written = writtenSet.has(row.matchCode);

      return {
        matchCode: row.matchCode,
        matchId: row.matchId,
        planned: true,
        written,
        verified,
        reason: verified ? null : "provider card totals mismatch",
        expectedCards,
        actualCards,
      };
    });
}

export async function verifyAppliedProviderCardPatches(
  supabase: SupabaseClient,
  editionId: string,
  previewRows: ScoreChangePreviewRow[],
  patches: ProviderCardPatchInput[],
  writtenMatchCodes: string[],
): Promise<
  | { ok: true; details: LiveScoresApplyCardDetail[]; failedVerification: number }
  | { ok: false; error: string; details: LiveScoresApplyCardDetail[]; failedVerification: number }
> {
  const planned = previewRows.filter((r) => r.cardWillUpdate);
  if (planned.length === 0) {
    return { ok: true, details: [], failedVerification: 0 };
  }

  const matchIds = [...new Set(patches.map((p) => p.matchId))];
  const { data, error } = await supabase
    .from("tournament_match_team_stats")
    .select("match_id, team_id, yellow_cards, red_cards, source")
    .eq("edition_id", editionId)
    .in("match_id", matchIds)
    .eq("source", "provider");

  if (error) {
    return {
      ok: false,
      error: error.message,
      details: [],
      failedVerification: planned.length,
    };
  }

  const details = buildCardApplyVerificationDetails({
    previewRows,
    patches,
    dbRows: (data ?? []) as DbStatRow[],
    writtenMatchCodes,
  });

  const failedVerification = details.filter((d) => d.planned && !d.verified).length;
  if (failedVerification > 0) {
    const failedCodes = details
      .filter((d) => !d.verified)
      .map((d) => `${d.matchCode}${d.reason ? ` (${d.reason})` : ""}`)
      .join(", ");
    return {
      ok: false,
      error: `${failedVerification} planned card update${failedVerification === 1 ? "" : "s"} did not persist: ${failedCodes}`,
      details,
      failedVerification,
    };
  }

  return { ok: true, details, failedVerification: 0 };
}
