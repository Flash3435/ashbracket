import type { SupabaseClient } from "@supabase/supabase-js";
import { winnerFromMatchScores } from "../matchOutcome";
import type {
  LiveScoresApplyMatchDetail,
  OfficialMatchScorePatchInput,
  ScoreChangePreviewRow,
} from "./types";

type DbMatchRow = {
  id: string;
  match_code: string;
  home_team_id: string | null;
  away_team_id: string | null;
  home_goals: number | null;
  away_goals: number | null;
  home_penalties: number | null;
  away_penalties: number | null;
  winner_team_id: string | null;
  status: string;
  provider_fixture_id: string | null;
  sync_locked: boolean;
};

function formatScore(
  home: number | null,
  away: number | null,
  homePen: number | null,
  awayPen: number | null,
): string {
  if (home == null || away == null) return "—";
  const base = `${home}–${away}`;
  if (homePen != null && awayPen != null) return `${base} (${homePen}–${awayPen} pens)`;
  return base;
}

function expectedWinnerTeamId(row: DbMatchRow, patch: OfficialMatchScorePatchInput): string | null {
  return winnerFromMatchScores({
    homeTeamId: row.home_team_id,
    awayTeamId: row.away_team_id,
    homeGoals: patch.homeGoals,
    awayGoals: patch.awayGoals,
    homePenalties: patch.homePenalties ?? null,
    awayPenalties: patch.awayPenalties ?? null,
  });
}

function verifyPatchAgainstRow(
  row: DbMatchRow,
  patch: OfficialMatchScorePatchInput,
): { verified: boolean; reason: string | null } {
  if (row.sync_locked) {
    return { verified: false, reason: "sync_locked" };
  }

  const expectedStatus = patch.status ?? "finished";
  const expectedWinner = expectedWinnerTeamId(row, patch);

  const scoreOk =
    row.home_goals === patch.homeGoals &&
    row.away_goals === patch.awayGoals &&
    (patch.homePenalties === undefined || row.home_penalties === patch.homePenalties) &&
    (patch.awayPenalties === undefined || row.away_penalties === patch.awayPenalties);
  const statusOk = row.status === expectedStatus;
  const winnerOk = row.winner_team_id === expectedWinner;

  if (scoreOk && statusOk && winnerOk) {
    return { verified: true, reason: null };
  }

  const parts: string[] = [];
  if (!scoreOk) parts.push("score mismatch");
  if (!statusOk) parts.push(`status is ${row.status}, expected ${expectedStatus}`);
  if (!winnerOk) parts.push("winner mismatch");
  return { verified: false, reason: parts.join("; ") };
}

export async function loadEditionMatchesByCode(
  supabase: SupabaseClient,
  editionId: string,
  matchCodes: string[],
): Promise<{ rows: DbMatchRow[] } | { error: string }> {
  if (matchCodes.length === 0) return { rows: [] };

  const { data, error } = await supabase
    .from("tournament_matches")
    .select(
      "id, match_code, home_team_id, away_team_id, home_goals, away_goals, home_penalties, away_penalties, winner_team_id, status, provider_fixture_id, sync_locked",
    )
    .eq("edition_id", editionId)
    .in("match_code", matchCodes);

  if (error) return { error: error.message };
  return { rows: (data ?? []) as DbMatchRow[] };
}

export function buildApplyVerificationDetails(input: {
  previewRows: ScoreChangePreviewRow[];
  patches: OfficialMatchScorePatchInput[];
  dbRows: DbMatchRow[];
  writtenMatchCodes: string[];
  skipped: Array<{ matchCode: string; reason: string }>;
}): LiveScoresApplyMatchDetail[] {
  const patchByCode = new Map(input.patches.map((p) => [p.matchCode, p]));
  const dbByCode = new Map(input.dbRows.map((r) => [r.match_code, r]));
  const skippedByCode = new Map(input.skipped.map((s) => [s.matchCode, s.reason]));
  const writtenSet = new Set(input.writtenMatchCodes);

  const plannedCodes = input.previewRows.filter((r) => r.willUpdate).map((r) => r.matchCode);

  return plannedCodes.map((matchCode) => {
    const previewRow = input.previewRows.find((r) => r.matchCode === matchCode)!;
    const patch = patchByCode.get(matchCode);
    const db = dbByCode.get(matchCode);
    const skippedReason = skippedByCode.get(matchCode);

    if (!patch) {
      return {
        matchCode,
        matchId: previewRow.matchId,
        planned: true,
        written: false,
        verified: false,
        reason: skippedReason ?? "patch missing",
        expectedScore: formatScore(
          previewRow.fetchedHomeGoals,
          previewRow.fetchedAwayGoals,
          previewRow.fetchedHomePenalties,
          previewRow.fetchedAwayPenalties,
        ),
        actualScore: db
          ? formatScore(db.home_goals, db.away_goals, db.home_penalties, db.away_penalties)
          : null,
        expectedStatus: "finished",
        actualStatus: db?.status ?? null,
        expectedWinnerTeamId: null,
        actualWinnerTeamId: db?.winner_team_id ?? null,
      };
    }

    if (!db) {
      return {
        matchCode,
        matchId: previewRow.matchId,
        planned: true,
        written: false,
        verified: false,
        reason: skippedReason ?? "match row not found in database",
        expectedScore: formatScore(patch.homeGoals, patch.awayGoals, patch.homePenalties ?? null, patch.awayPenalties ?? null),
        actualScore: null,
        expectedStatus: patch.status ?? "finished",
        actualStatus: null,
        expectedWinnerTeamId: null,
        actualWinnerTeamId: null,
      };
    }

    const written = writtenSet.has(matchCode);
    const verification = verifyPatchAgainstRow(db, patch);

    return {
      matchCode,
      matchId: db.id,
      planned: true,
      written,
      verified: verification.verified,
      reason: verification.reason ?? skippedReason ?? (written ? null : "not written"),
      expectedScore: formatScore(patch.homeGoals, patch.awayGoals, patch.homePenalties ?? null, patch.awayPenalties ?? null),
      actualScore: formatScore(db.home_goals, db.away_goals, db.home_penalties, db.away_penalties),
      expectedStatus: patch.status ?? "finished",
      actualStatus: db.status,
      expectedWinnerTeamId: expectedWinnerTeamId(db, patch),
      actualWinnerTeamId: db.winner_team_id,
    };
  });
}

export async function verifyAppliedLiveScorePatches(
  supabase: SupabaseClient,
  editionId: string,
  previewRows: ScoreChangePreviewRow[],
  patches: OfficialMatchScorePatchInput[],
  writtenMatchCodes: string[],
  skipped: Array<{ matchCode: string; reason: string }>,
): Promise<
  | { ok: true; details: LiveScoresApplyMatchDetail[]; failedVerification: number }
  | { ok: false; error: string; details: LiveScoresApplyMatchDetail[]; failedVerification: number }
> {
  const plannedCodes = previewRows.filter((r) => r.willUpdate).map((r) => r.matchCode);
  const loaded = await loadEditionMatchesByCode(supabase, editionId, plannedCodes);
  if ("error" in loaded) {
    return { ok: false, error: loaded.error, details: [], failedVerification: plannedCodes.length };
  }

  const details = buildApplyVerificationDetails({
    previewRows,
    patches,
    dbRows: loaded.rows,
    writtenMatchCodes,
    skipped,
  });

  const failedVerification = details.filter((d) => d.planned && !d.verified).length;
  if (failedVerification > 0) {
    const failedCodes = details
      .filter((d) => !d.verified)
      .map((d) => `${d.matchCode}${d.reason ? ` (${d.reason})` : ""}`)
      .join(", ");
    return {
      ok: false,
      error: `${failedVerification} planned update${failedVerification === 1 ? "" : "s"} did not persist: ${failedCodes}`,
      details,
      failedVerification,
    };
  }

  return { ok: true, details, failedVerification: 0 };
}
