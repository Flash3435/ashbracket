import { createHash } from "node:crypto";
import type { ScoreChangePreviewRow } from "./types";

export type ApplyPlanScoreOperation = {
  kind: "score";
  matchCode: string;
  matchId: string;
  providerFixtureId: string | null;
  homeGoals: number;
  awayGoals: number;
  homePenalties: number | null;
  awayPenalties: number | null;
  status: "finished";
};

export type ApplyPlanCardOperation = {
  kind: "cards";
  matchCode: string;
  matchId: string;
  providerFixtureId: string | null;
  homeYellowCards: number;
  awayYellowCards: number;
  homeRedCards: number;
  awayRedCards: number;
};

export type ApplyPlanManualCardConflict = {
  kind: "manual_card_conflict";
  matchCode: string;
  matchId: string;
  providerFixtureId: string | null;
};

export type ApplyPlanOperation =
  | ApplyPlanScoreOperation
  | ApplyPlanCardOperation
  | ApplyPlanManualCardConflict;

export type ApplyPlanMismatch = {
  submittedSignature: string;
  rebuiltSignature: string;
  submittedOperations: ApplyPlanOperation[];
  rebuiltOperations: ApplyPlanOperation[];
  changedMatchCodes: string[];
  addedMatchCodes: string[];
  removedMatchCodes: string[];
};

function serializeOperation(op: ApplyPlanOperation): string {
  switch (op.kind) {
    case "score":
      return [
        "score",
        op.matchCode,
        op.matchId,
        op.providerFixtureId ?? "",
        op.homeGoals,
        op.awayGoals,
        op.homePenalties ?? "",
        op.awayPenalties ?? "",
        op.status,
      ].join("\0");
    case "cards":
      return [
        "cards",
        op.matchCode,
        op.matchId,
        op.providerFixtureId ?? "",
        op.homeYellowCards,
        op.awayYellowCards,
        op.homeRedCards,
        op.awayRedCards,
      ].join("\0");
    case "manual_card_conflict":
      return [
        "manual_card_conflict",
        op.matchCode,
        op.matchId,
        op.providerFixtureId ?? "",
      ].join("\0");
  }
}

/** Material Step A operations only — excludes live/unplanned rows and unstable provider UI fields. */
export function extractApplyPlanOperations(
  rows: ScoreChangePreviewRow[],
): ApplyPlanOperation[] {
  const ops: ApplyPlanOperation[] = [];

  for (const row of rows) {
    if (row.willUpdate) {
      if (row.fetchedHomeGoals == null || row.fetchedAwayGoals == null) continue;
      ops.push({
        kind: "score",
        matchCode: row.matchCode,
        matchId: row.matchId,
        providerFixtureId: row.providerFixtureId,
        homeGoals: row.fetchedHomeGoals,
        awayGoals: row.fetchedAwayGoals,
        homePenalties: row.fetchedHomePenalties ?? null,
        awayPenalties: row.fetchedAwayPenalties ?? null,
        status: "finished",
      });
    }

    if (row.cardWillUpdate) {
      if (
        row.fetchedHomeYellowCards == null ||
        row.fetchedAwayYellowCards == null ||
        row.fetchedHomeRedCards == null ||
        row.fetchedAwayRedCards == null
      ) {
        continue;
      }
      ops.push({
        kind: "cards",
        matchCode: row.matchCode,
        matchId: row.matchId,
        providerFixtureId: row.providerFixtureId,
        homeYellowCards: row.fetchedHomeYellowCards,
        awayYellowCards: row.fetchedAwayYellowCards,
        homeRedCards: row.fetchedHomeRedCards,
        awayRedCards: row.fetchedAwayRedCards,
      });
    }

    if (row.cardReason === "manual_conflict") {
      ops.push({
        kind: "manual_card_conflict",
        matchCode: row.matchCode,
        matchId: row.matchId,
        providerFixtureId: row.providerFixtureId,
      });
    }
  }

  ops.sort((a, b) => {
    const byCode = a.matchCode.localeCompare(b.matchCode);
    if (byCode !== 0) return byCode;
    return a.kind.localeCompare(b.kind);
  });

  return ops;
}

export function computeApplyPlanSignatureFromOperations(
  operations: ApplyPlanOperation[],
): string {
  const payload = [...operations]
    .sort((a, b) => {
      const byCode = a.matchCode.localeCompare(b.matchCode);
      if (byCode !== 0) return byCode;
      return a.kind.localeCompare(b.kind);
    })
    .map(serializeOperation)
    .join("\n");
  return createHash("sha256").update(payload).digest("hex").slice(0, 16);
}

/** Stable apply-plan id shown as previewId in admin UI. */
export function computeApplyPlanSignature(rows: ScoreChangePreviewRow[]): string {
  return computeApplyPlanSignatureFromOperations(extractApplyPlanOperations(rows));
}

function operationsByMatchCode(
  ops: ApplyPlanOperation[],
): Map<string, ApplyPlanOperation[]> {
  const map = new Map<string, ApplyPlanOperation[]>();
  for (const op of ops) {
    const list = map.get(op.matchCode) ?? [];
    list.push(op);
    map.set(op.matchCode, list);
  }
  return map;
}

function operationsEqual(a: ApplyPlanOperation, b: ApplyPlanOperation): boolean {
  return serializeOperation(a) === serializeOperation(b);
}

function sortOps(list: ApplyPlanOperation[]): ApplyPlanOperation[] {
  return [...list].sort((a, b) => a.kind.localeCompare(b.kind));
}

export function diffApplyPlanOperations(
  submitted: ApplyPlanOperation[],
  rebuilt: ApplyPlanOperation[],
): ApplyPlanMismatch {
  const submittedByCode = operationsByMatchCode(submitted);
  const rebuiltByCode = operationsByMatchCode(rebuilt);
  const allCodes = new Set([...submittedByCode.keys(), ...rebuiltByCode.keys()]);

  const changedMatchCodes: string[] = [];
  const addedMatchCodes: string[] = [];
  const removedMatchCodes: string[] = [];

  for (const matchCode of [...allCodes].sort()) {
    const sub = sortOps(submittedByCode.get(matchCode) ?? []);
    const reb = sortOps(rebuiltByCode.get(matchCode) ?? []);

    if (sub.length === 0 && reb.length > 0) {
      addedMatchCodes.push(matchCode);
      changedMatchCodes.push(matchCode);
      continue;
    }
    if (sub.length > 0 && reb.length === 0) {
      removedMatchCodes.push(matchCode);
      changedMatchCodes.push(matchCode);
      continue;
    }

    if (sub.length !== reb.length) {
      changedMatchCodes.push(matchCode);
      continue;
    }

    for (let i = 0; i < sub.length; i += 1) {
      if (!operationsEqual(sub[i]!, reb[i]!)) {
        changedMatchCodes.push(matchCode);
        break;
      }
    }
  }

  return {
    submittedSignature: computeApplyPlanSignatureFromOperations(submitted),
    rebuiltSignature: computeApplyPlanSignatureFromOperations(rebuilt),
    submittedOperations: submitted,
    rebuiltOperations: rebuilt,
    changedMatchCodes,
    addedMatchCodes,
    removedMatchCodes,
  };
}

export function buildApplyPlanStaleErrorMessage(mismatch: ApplyPlanMismatch): string {
  const parts = [
    "Provider apply plan changed since preview — fetch latest scores and cards again and confirm the new plan.",
  ];
  if (mismatch.changedMatchCodes.length > 0) {
    parts.push(`Changed matches: ${mismatch.changedMatchCodes.join(", ")}.`);
  }
  return parts.join(" ");
}
