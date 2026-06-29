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

/** Intended Step A write target for one match — ignores DB diagnostics and operation labels. */
export type ApplyPlanMatchIntent = {
  matchCode: string;
  score?: {
    homeGoals: number;
    awayGoals: number;
    homePenalties: number | null;
    awayPenalties: number | null;
    status: "finished";
  };
  cards?: {
    homeYellowCards: number;
    awayYellowCards: number;
    homeRedCards: number;
    awayRedCards: number;
  };
  manualCardConflict?: true;
};

export type ApplyPlanMismatch = {
  submittedSignature: string;
  rebuiltSignature: string;
  submittedOperations: ApplyPlanOperation[];
  rebuiltOperations: ApplyPlanOperation[];
  submittedOperationCount: number;
  rebuiltOperationCount: number;
  submittedMaterialIntents: ApplyPlanMatchIntent[];
  rebuiltMaterialIntents: ApplyPlanMatchIntent[];
  changedMatchCodes: string[];
  addedMatchCodes: string[];
  removedMatchCodes: string[];
};

function serializeScoreIntent(
  score: NonNullable<ApplyPlanMatchIntent["score"]>,
): string {
  return [
    score.homeGoals,
    score.awayGoals,
    score.homePenalties ?? "",
    score.awayPenalties ?? "",
    score.status,
  ].join("\0");
}

function serializeCardIntent(
  cards: NonNullable<ApplyPlanMatchIntent["cards"]>,
): string {
  return [
    cards.homeYellowCards,
    cards.awayYellowCards,
    cards.homeRedCards,
    cards.awayRedCards,
  ].join("\0");
}

function serializeMatchIntent(intent: ApplyPlanMatchIntent): string {
  const parts = [intent.matchCode];
  if (intent.score) {
    parts.push("score", serializeScoreIntent(intent.score));
  }
  if (intent.cards) {
    parts.push("cards", serializeCardIntent(intent.cards));
  }
  if (intent.manualCardConflict) {
    parts.push("manual_card_conflict");
  }
  return parts.join("\0");
}

export function operationsToMatchIntents(
  operations: ApplyPlanOperation[],
): Map<string, ApplyPlanMatchIntent> {
  const map = new Map<string, ApplyPlanMatchIntent>();
  for (const op of operations) {
    const intent = map.get(op.matchCode) ?? { matchCode: op.matchCode };
    switch (op.kind) {
      case "score":
        intent.score = {
          homeGoals: op.homeGoals,
          awayGoals: op.awayGoals,
          homePenalties: op.homePenalties,
          awayPenalties: op.awayPenalties,
          status: op.status,
        };
        break;
      case "cards":
        intent.cards = {
          homeYellowCards: op.homeYellowCards,
          awayYellowCards: op.awayYellowCards,
          homeRedCards: op.homeRedCards,
          awayRedCards: op.awayRedCards,
        };
        break;
      case "manual_card_conflict":
        intent.manualCardConflict = true;
        break;
    }
    map.set(op.matchCode, intent);
  }
  return map;
}

export function matchIntentsFromOperations(
  operations: ApplyPlanOperation[],
): ApplyPlanMatchIntent[] {
  return [...operationsToMatchIntents(operations).values()].sort((a, b) =>
    a.matchCode.localeCompare(b.matchCode),
  );
}

function matchIntentsEqual(
  a: ApplyPlanMatchIntent | undefined,
  b: ApplyPlanMatchIntent | undefined,
): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  if (a.manualCardConflict !== b.manualCardConflict) return false;
  if (a.score && b.score) {
    if (serializeScoreIntent(a.score) !== serializeScoreIntent(b.score)) return false;
  } else if (a.score || b.score) {
    return false;
  }
  if (a.cards && b.cards) {
    if (serializeCardIntent(a.cards) !== serializeCardIntent(b.cards)) return false;
  } else if (a.cards || b.cards) {
    return false;
  }
  return true;
}

/** Material Step A operations only — excludes live/unplanned rows and unstable provider UI fields. */
export function extractApplyPlanOperations(
  rows: ScoreChangePreviewRow[],
): ApplyPlanOperation[] {
  const ops: ApplyPlanOperation[] = [];

  for (const row of rows) {
    if (row.willUpdate) {
      if (row.fetchedHomeGoals == null || row.fetchedAwayGoals == null) continue;
      if (row.fetchedStatus !== "finished") continue;
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
      if (row.fetchedStatus !== "finished") continue;
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
      if (row.fetchedStatus !== "finished") continue;
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
  const intents = matchIntentsFromOperations(operations);
  const payload = intents.map(serializeMatchIntent).join("\n");
  return createHash("sha256").update(payload).digest("hex").slice(0, 16);
}

/** Stable apply-plan id shown as previewId in admin UI. */
export function computeApplyPlanSignature(rows: ScoreChangePreviewRow[]): string {
  return computeApplyPlanSignatureFromOperations(extractApplyPlanOperations(rows));
}

export function diffApplyPlanOperations(
  submitted: ApplyPlanOperation[],
  rebuilt: ApplyPlanOperation[],
): ApplyPlanMismatch {
  const submittedIntents = operationsToMatchIntents(submitted);
  const rebuiltIntents = operationsToMatchIntents(rebuilt);
  const allCodes = new Set([...submittedIntents.keys(), ...rebuiltIntents.keys()]);

  const changedMatchCodes: string[] = [];
  const addedMatchCodes: string[] = [];
  const removedMatchCodes: string[] = [];

  for (const matchCode of [...allCodes].sort()) {
    const sub = submittedIntents.get(matchCode);
    const reb = rebuiltIntents.get(matchCode);

    if (!sub && reb) {
      addedMatchCodes.push(matchCode);
      changedMatchCodes.push(matchCode);
      continue;
    }
    if (sub && !reb) {
      removedMatchCodes.push(matchCode);
      changedMatchCodes.push(matchCode);
      continue;
    }
    if (!matchIntentsEqual(sub, reb)) {
      changedMatchCodes.push(matchCode);
    }
  }

  const submittedMaterialIntents = matchIntentsFromOperations(submitted);
  const rebuiltMaterialIntents = matchIntentsFromOperations(rebuilt);

  return {
    submittedSignature: computeApplyPlanSignatureFromOperations(submitted),
    rebuiltSignature: computeApplyPlanSignatureFromOperations(rebuilt),
    submittedOperations: submitted,
    rebuiltOperations: rebuilt,
    submittedOperationCount: submitted.length,
    rebuiltOperationCount: rebuilt.length,
    submittedMaterialIntents,
    rebuiltMaterialIntents,
    changedMatchCodes,
    addedMatchCodes,
    removedMatchCodes,
  };
}

export function applyPlanMaterialStatesMatch(
  submitted: ApplyPlanOperation[],
  rebuilt: ApplyPlanOperation[],
): boolean {
  return diffApplyPlanOperations(submitted, rebuilt).changedMatchCodes.length === 0;
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
