import { PARTICIPANT_BRACKET_PICK_SECTIONS } from "./knockoutResultsConfig";
import type { KnockoutPickStatusAuditChange } from "./knockoutPickCorrection";
import type { Prediction, TournamentStage } from "../../src/types/domain";
import {
  decodeKnockoutPickStatusMetadata,
  encodeKnockoutPickStatusMetadata,
} from "../predictions/knockoutPickStatus";
import {
  isKnockoutProgressionKind,
  type KnockoutProgressionPredictionKind,
} from "../predictions/knockoutProgressionKinds";
import type { KnockoutPathPickClearReason } from "../predictions/pruneOfficialKnockoutPathPicks";

export type BackfillConfidence = "high" | "medium" | "low";

export type BackfillCandidateSource =
  | "audit_marked_out_picks"
  | "audit_cleared_summary";

export type CorrectionAuditRow = {
  id: string;
  poolId: string;
  participantId: string;
  matchCode: string;
  createdAt: string;
  actorEmail?: string | null;
  actorUserId?: string | null;
  metadata: Record<string, unknown> | null;
};

export type BackfillCandidate = {
  candidateId: string;
  poolId: string;
  participantId: string;
  predictionKind: KnockoutProgressionPredictionKind;
  slotKey: string | null;
  tournamentStageId: string;
  teamId: string;
  teamName: string;
  invalidReason: KnockoutPathPickClearReason;
  confidence: BackfillConfidence;
  source: BackfillCandidateSource;
  auditId: string;
  matchCode: string;
  auditCreatedAt: string;
  clearedSummaryLine: string | null;
  explanation: string;
};

export type BackfillSkipReason =
  | "active_conflict"
  | "already_out"
  | "bonus_row"
  | "group_row"
  | "missing_team_id"
  | "missing_stage"
  | "low_confidence"
  | "duplicate"
  | "not_reviewed"
  | "review_skipped";

export type BackfillRestoreUpsert = {
  pool_id: string;
  participant_id: string;
  prediction_kind: string;
  tournament_stage_id: string;
  group_code: null;
  slot_key: string | null;
  bonus_key: null;
  team_id: string;
  value_text: string;
};

export type BackfillPlanItem =
  | {
      action: "restore";
      candidate: BackfillCandidate;
      upsert: BackfillRestoreUpsert;
    }
  | {
      action: "add_status_only";
      candidate: BackfillCandidate;
      upsert: BackfillRestoreUpsert;
    }
  | {
      action: "skip";
      candidate: BackfillCandidate;
      reason: BackfillSkipReason;
      detail?: string;
    }
  | {
      action: "report_only";
      candidate: BackfillCandidate;
      reason: BackfillSkipReason;
      detail?: string;
    };

export type BackfillPlanSummary = {
  candidatesFound: number;
  highConfidence: number;
  mediumConfidence: number;
  lowConfidence: number;
  plannedRestores: number;
  plannedStatusOnly: number;
  skippedConflicts: number;
  manualReview: number;
};

export type BackfillPlanResult = {
  items: BackfillPlanItem[];
  summary: BackfillPlanSummary;
};

export type MediumReviewSuggestedAction =
  | "restore_as_out"
  | "skip"
  | "manual_review";

export type MediumCandidateReviewReport = {
  candidateId: string;
  participantId: string;
  participantName: string;
  poolId: string;
  poolName: string;
  auditId: string;
  auditTimestamp: string;
  auditActor: string | null;
  matchCode: string;
  predictionKind: KnockoutProgressionPredictionKind;
  slotKey: string | null;
  teamName: string;
  teamId: string;
  invalidReason: KnockoutPathPickClearReason;
  clearedSummaryLine: string | null;
  confidence: BackfillConfidence;
  confidenceExplanation: string;
  currentDbState: string;
  suggestedAction: MediumReviewSuggestedAction;
};

export type BackfillReviewDecision = {
  candidateId: string;
  decision: "restore_as_out" | "skip";
  note?: string;
};

export type BackfillReviewDecisionFile = {
  decisions: BackfillReviewDecision[];
};

export type BackfillReviewReportPayload = {
  reportVersion: 1;
  generatedAt: string;
  mediumCandidates: MediumCandidateReviewReport[];
  decisionTemplate: BackfillReviewDecision[];
};

const CLEARED_SUMMARY_LINE_RE = /^(.+?) \((.+?)\) — (.+)$/;

const VALID_CLEAR_REASONS = new Set<KnockoutPathPickClearReason>([
  "not_in_official_matchup",
  "upstream_incomplete",
  "not_in_r32_match",
  "restored_from_audit",
  "restored_from_reviewed_audit",
]);

const MEDIUM_CONFIDENCE_EXPLANATION =
  "Parsed from clearedSummary text; team/slot/kind inferred; no structured markedOutPicks proof the row was locked when cleared.";

function candidateKey(c: Pick<BackfillCandidate, "participantId" | "predictionKind" | "slotKey" | "tournamentStageId">): string {
  return [
    c.participantId,
    c.predictionKind,
    c.tournamentStageId,
    c.slotKey ?? "",
  ].join("\0");
}

export function computeBackfillCandidateId(
  candidate: Pick<
    BackfillCandidate,
    "auditId" | "participantId" | "predictionKind" | "slotKey" | "teamId"
  >,
): string {
  return [
    candidate.auditId,
    candidate.participantId,
    candidate.predictionKind,
    candidate.slotKey ?? "",
    candidate.teamId,
  ].join(":");
}

export function isNonKnockoutBracketPrediction(pred: Prediction): boolean {
  if (pred.bonusKey != null && pred.bonusKey !== "") return true;
  if (pred.groupCode != null && pred.groupCode !== "") return true;
  return !isKnockoutProgressionKind(pred.predictionKind);
}

export function tournamentStageIdForKnockoutPick(
  kind: KnockoutProgressionPredictionKind,
  stageByCode: Partial<Record<TournamentStage["code"], TournamentStage>>,
): string | null {
  const section = PARTICIPANT_BRACKET_PICK_SECTIONS.find((s) => s.kind === kind);
  if (!section) return null;
  const stage = stageByCode[section.stageCode as TournamentStage["code"]];
  return stage?.id ?? null;
}

function normalizeClearReason(raw: string): KnockoutPathPickClearReason {
  const trimmed = raw.trim() as KnockoutPathPickClearReason;
  if (VALID_CLEAR_REASONS.has(trimmed)) return trimmed;
  return "restored_from_audit";
}

function teamNameForId(
  teamId: string,
  teams: ReadonlyArray<{ id: string; name: string; countryCode: string }>,
): string {
  return teams.find((t) => t.id === teamId)?.name ?? teamId;
}

function readMarkedOutPicks(
  metadata: Record<string, unknown> | null | undefined,
): KnockoutPickStatusAuditChange[] {
  const raw = metadata?.markedOutPicks;
  if (!Array.isArray(raw)) return [];
  const out: KnockoutPickStatusAuditChange[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const rec = row as Record<string, unknown>;
    const predictionKind = String(rec.predictionKind ?? "").trim();
    const teamId = String(rec.teamId ?? "").trim();
    const reason = String(rec.reason ?? "").trim();
    if (!isKnockoutProgressionKind(predictionKind) || !teamId || !reason) continue;
    out.push({
      predictionKind,
      slotKey:
        rec.slotKey == null || rec.slotKey === ""
          ? null
          : String(rec.slotKey),
      teamId,
      reason: normalizeClearReason(reason),
    });
  }
  return out;
}

function readClearedSummary(
  metadata: Record<string, unknown> | null | undefined,
): string[] {
  const raw = metadata?.clearedSummary;
  if (!Array.isArray(raw)) return [];
  return raw
    .map((line) => (typeof line === "string" ? line.trim() : ""))
    .filter(Boolean);
}

export function inferKindAndSlotFromClearedLabel(
  label: string,
): { kind: KnockoutProgressionPredictionKind; slotKey: string | null } | null {
  const trimmed = label.trim();
  if (!trimmed) return null;
  if (/^champion$/i.test(trimmed)) {
    return { kind: "champion", slotKey: null };
  }

  const pickMatch = trimmed.match(/pick\s+(\d+)/i);
  const slotKey = pickMatch?.[1] ?? null;

  if (/quarter/i.test(trimmed)) {
    return { kind: "quarterfinalist", slotKey };
  }
  if (/semi/i.test(trimmed)) {
    return { kind: "semifinalist", slotKey };
  }
  if (/round of 32/i.test(trimmed)) {
    return { kind: "round_of_32", slotKey };
  }
  if (/round of 16/i.test(trimmed)) {
    return { kind: "round_of_16", slotKey };
  }
  if (/final/i.test(trimmed)) {
    return { kind: "finalist", slotKey };
  }

  return null;
}

export function teamIdFromDisplayLabel(
  teamLabel: string,
  teams: ReadonlyArray<{ id: string; name: string; countryCode: string }>,
): string | null {
  const normalized = teamLabel.trim().toLowerCase();
  if (!normalized) return null;

  const exactName = teams.filter(
    (t) => t.name.trim().toLowerCase() === normalized,
  );
  if (exactName.length === 1) return exactName[0]!.id;

  const byCode = teams.filter(
    (t) => t.countryCode.trim().toLowerCase() === normalized,
  );
  if (byCode.length === 1) return byCode[0]!.id;

  const fuzzy = teams.filter((t) =>
    t.name.trim().toLowerCase().includes(normalized),
  );
  if (fuzzy.length === 1) return fuzzy[0]!.id;

  return null;
}

export function buildRestoredOutValueText(
  restoredAt = new Date().toISOString(),
): string {
  return encodeKnockoutPickStatusMetadata({
    v: 1,
    status: "out",
    reason: "restored_from_audit",
    invalidatedAt: restoredAt,
  });
}

export function buildReviewedRestoredOutValueText(input: {
  auditId: string;
  reviewNote?: string;
  restoredAt?: string;
}): string {
  return encodeKnockoutPickStatusMetadata({
    v: 1,
    status: "out",
    reason: "restored_from_reviewed_audit",
    invalidatedAt: input.restoredAt ?? new Date().toISOString(),
    auditId: input.auditId,
    reviewNote: input.reviewNote?.trim() || undefined,
  });
}

function buildCandidateBase(input: {
  audit: CorrectionAuditRow;
  predictionKind: KnockoutProgressionPredictionKind;
  slotKey: string | null;
  tournamentStageId: string;
  teamId: string;
  teamName: string;
  invalidReason: KnockoutPathPickClearReason;
  confidence: BackfillConfidence;
  source: BackfillCandidateSource;
  clearedSummaryLine: string | null;
  explanation: string;
}): BackfillCandidate {
  const candidate = {
    poolId: input.audit.poolId,
    participantId: input.audit.participantId,
    predictionKind: input.predictionKind,
    slotKey: input.slotKey,
    tournamentStageId: input.tournamentStageId,
    teamId: input.teamId,
    teamName: input.teamName,
    invalidReason: input.invalidReason,
    confidence: input.confidence,
    source: input.source,
    auditId: input.audit.id,
    matchCode: input.audit.matchCode,
    auditCreatedAt: input.audit.createdAt,
    clearedSummaryLine: input.clearedSummaryLine,
    explanation: input.explanation,
  };
  return {
    ...candidate,
    candidateId: computeBackfillCandidateId({
      auditId: candidate.auditId,
      participantId: candidate.participantId,
      predictionKind: candidate.predictionKind,
      slotKey: candidate.slotKey,
      teamId: candidate.teamId,
    }),
  };
}

/** Prefer structured metadata; fall back to parsed clearedSummary lines. */
export function extractBackfillCandidatesFromAuditRows(input: {
  auditRows: CorrectionAuditRow[];
  stageByCode: Partial<Record<TournamentStage["code"], TournamentStage>>;
  teams: ReadonlyArray<{ id: string; name: string; countryCode: string }>;
}): BackfillCandidate[] {
  const byKey = new Map<string, BackfillCandidate>();

  for (const audit of input.auditRows) {
    for (const marked of readMarkedOutPicks(audit.metadata)) {
      const tournamentStageId = tournamentStageIdForKnockoutPick(
        marked.predictionKind as KnockoutProgressionPredictionKind,
        input.stageByCode,
      );
      if (!tournamentStageId) continue;

      const candidate = buildCandidateBase({
        audit,
        predictionKind: marked.predictionKind as KnockoutProgressionPredictionKind,
        slotKey: marked.slotKey,
        tournamentStageId,
        teamId: marked.teamId,
        teamName: teamNameForId(marked.teamId, input.teams),
        invalidReason: normalizeClearReason(marked.reason),
        confidence: "high",
        source: "audit_marked_out_picks",
        clearedSummaryLine: null,
        explanation:
          `Structured markedOutPicks from correction audit ${audit.id} (${audit.matchCode}).`,
      });
      byKey.set(candidateKey(candidate), candidate);
    }

    for (const line of readClearedSummary(audit.metadata)) {
      const parsed = CLEARED_SUMMARY_LINE_RE.exec(line);
      if (!parsed) continue;
      const [, label, teamLabel, reasonRaw] = parsed;
      const inferred = inferKindAndSlotFromClearedLabel(label ?? "");
      if (!inferred?.kind || (inferred.kind !== "champion" && !inferred.slotKey)) {
        continue;
      }
      const teamId = teamIdFromDisplayLabel(teamLabel ?? "", input.teams);
      if (!teamId) continue;
      const tournamentStageId = tournamentStageIdForKnockoutPick(
        inferred.kind,
        input.stageByCode,
      );
      if (!tournamentStageId) continue;

      const candidate = buildCandidateBase({
        audit,
        predictionKind: inferred.kind,
        slotKey: inferred.slotKey,
        tournamentStageId,
        teamId,
        teamName: teamLabel?.trim() || teamNameForId(teamId, input.teams),
        invalidReason: normalizeClearReason(reasonRaw ?? "restored_from_audit"),
        confidence: "medium",
        source: "audit_cleared_summary",
        clearedSummaryLine: line,
        explanation:
          `Parsed clearedSummary "${line}" from audit ${audit.id} (${audit.matchCode}).`,
      });

      const key = candidateKey(candidate);
      const existing = byKey.get(key);
      if (!existing || existing.confidence !== "high") {
        byKey.set(key, candidate);
      }
    }
  }

  return [...byKey.values()];
}

function findExistingPrediction(
  candidate: BackfillCandidate,
  existingPredictions: Prediction[],
): Prediction | undefined {
  return existingPredictions.find(
    (p) =>
      !isNonKnockoutBracketPrediction(p) &&
      p.participantId === candidate.participantId &&
      p.poolId === candidate.poolId &&
      p.predictionKind === candidate.predictionKind &&
      p.tournamentStageId === candidate.tournamentStageId &&
      (p.slotKey ?? null) === candidate.slotKey &&
      p.groupCode == null &&
      p.bonusKey == null,
  );
}

export function describeBackfillCurrentDbState(input: {
  candidate: BackfillCandidate;
  existing?: Prediction;
  teamNameById?: ReadonlyMap<string, string>;
}): string {
  const { candidate, existing, teamNameById } = input;
  if (!existing) return "missing_row";

  const meta = decodeKnockoutPickStatusMetadata(existing.valueText);
  const existingTeamId = existing.teamId?.trim() ?? "";
  const existingTeamLabel =
    (existingTeamId && teamNameById?.get(existingTeamId)) || existingTeamId || "none";

  if (
    existingTeamId &&
    existingTeamId !== candidate.teamId.trim() &&
    meta?.status !== "out"
  ) {
    return `conflict_active:${existingTeamLabel}(${existingTeamId})`;
  }

  if (meta?.status === "out" && existingTeamId) {
    return `out:${existingTeamLabel}(${existingTeamId})`;
  }

  if (!existingTeamId) return "empty_row";

  return `active:${existingTeamLabel}(${existingTeamId})`;
}

export function suggestMediumReviewAction(input: {
  candidate: BackfillCandidate;
  existing?: Prediction;
}): MediumReviewSuggestedAction {
  const { candidate, existing } = input;
  if (!candidate.teamId.trim()) return "skip";

  const meta = existing
    ? decodeKnockoutPickStatusMetadata(existing.valueText)
    : null;
  const existingTeamId = existing?.teamId?.trim() ?? "";

  if (
    existingTeamId &&
    existingTeamId !== candidate.teamId.trim() &&
    meta?.status !== "out"
  ) {
    return "skip";
  }

  if (meta?.status === "out" && existingTeamId === candidate.teamId.trim()) {
    return "skip";
  }

  return "manual_review";
}

function evaluateCandidateRestore(input: {
  candidate: BackfillCandidate;
  existingPredictions: Prediction[];
  allowConfidence: BackfillConfidence[];
  valueTextBuilder: () => string;
}): BackfillPlanItem {
  const { candidate, existingPredictions, allowConfidence, valueTextBuilder } =
    input;

  if (!allowConfidence.includes(candidate.confidence)) {
    return {
      action: "report_only",
      candidate,
      reason: "low_confidence",
      detail: "Candidate confidence not eligible for this apply mode.",
    };
  }

  if (!candidate.teamId.trim()) {
    return {
      action: "skip",
      candidate,
      reason: "missing_team_id",
    };
  }

  const existing = findExistingPrediction(candidate, existingPredictions);
  const existingMeta = existing
    ? decodeKnockoutPickStatusMetadata(existing.valueText)
    : null;
  const existingOut =
    existing != null &&
    existingMeta?.status === "out" &&
    Boolean(existing.teamId?.trim());

  if (
    existing?.teamId?.trim() &&
    existing.teamId.trim() !== candidate.teamId.trim() &&
    !existingOut
  ) {
    return {
      action: "skip",
      candidate,
      reason: "active_conflict",
      detail: `Existing active pick ${existing.teamId} differs from audit team ${candidate.teamId}.`,
    };
  }

  const upsert: BackfillRestoreUpsert = {
    pool_id: candidate.poolId,
    participant_id: candidate.participantId,
    prediction_kind: candidate.predictionKind,
    tournament_stage_id: candidate.tournamentStageId,
    group_code: null,
    slot_key: candidate.slotKey,
    bonus_key: null,
    team_id: candidate.teamId.trim(),
    value_text: valueTextBuilder(),
  };

  if (existingOut && existing?.teamId?.trim() === candidate.teamId.trim()) {
    return {
      action: "skip",
      candidate,
      reason: "already_out",
    };
  }

  if (existing?.teamId?.trim() === candidate.teamId.trim()) {
    return { action: "add_status_only", candidate, upsert };
  }

  if (!existing?.teamId?.trim()) {
    return { action: "restore", candidate, upsert };
  }

  return {
    action: "report_only",
    candidate,
    reason: "duplicate",
    detail: "Unexpected existing row shape.",
  };
}

export function buildKnockoutOutPickBackfillPlan(input: {
  candidates: BackfillCandidate[];
  existingPredictions: Prediction[];
}): BackfillPlanResult {
  const items: BackfillPlanItem[] = [];
  let highConfidence = 0;
  let mediumConfidence = 0;
  let lowConfidence = 0;
  let plannedRestores = 0;
  let plannedStatusOnly = 0;
  let skippedConflicts = 0;
  let manualReview = 0;

  for (const candidate of input.candidates) {
    if (candidate.confidence === "high") highConfidence += 1;
    else if (candidate.confidence === "medium") mediumConfidence += 1;
    else lowConfidence += 1;

    let item: BackfillPlanItem;
    if (candidate.confidence !== "high") {
      item = {
        action: "report_only",
        candidate,
        reason: "low_confidence",
        detail: "Medium/low confidence rows require manual review before restore.",
      };
      manualReview += 1;
    } else {
      item = evaluateCandidateRestore({
        candidate,
        existingPredictions: input.existingPredictions,
        allowConfidence: ["high"],
        valueTextBuilder: () => buildRestoredOutValueText(),
      });
    }

    items.push(item);
    if (item.action === "restore") plannedRestores += 1;
    if (item.action === "add_status_only") plannedStatusOnly += 1;
    if (item.action === "skip") skippedConflicts += 1;
  }

  return {
    items,
    summary: {
      candidatesFound: input.candidates.length,
      highConfidence,
      mediumConfidence,
      lowConfidence,
      plannedRestores,
      plannedStatusOnly,
      skippedConflicts,
      manualReview,
    },
  };
}

export function buildMediumCandidateReviewReports(input: {
  candidates: BackfillCandidate[];
  existingPredictions: Prediction[];
  participantNameById: ReadonlyMap<string, string>;
  poolNameById: ReadonlyMap<string, string>;
  auditById: ReadonlyMap<string, CorrectionAuditRow>;
}): MediumCandidateReviewReport[] {
  const teamNameById = new Map(
    input.candidates.map((c) => [c.teamId, c.teamName] as const),
  );

  return input.candidates
    .filter((c) => c.confidence === "medium")
    .map((candidate) => {
      const existing = findExistingPrediction(candidate, input.existingPredictions);
      const audit = input.auditById.get(candidate.auditId);
      const suggestedAction = suggestMediumReviewAction({ candidate, existing });

      return {
        candidateId: candidate.candidateId,
        participantId: candidate.participantId,
        participantName:
          input.participantNameById.get(candidate.participantId) ??
          candidate.participantId,
        poolId: candidate.poolId,
        poolName: input.poolNameById.get(candidate.poolId) ?? candidate.poolId,
        auditId: candidate.auditId,
        auditTimestamp: candidate.auditCreatedAt,
        auditActor: audit?.actorEmail?.trim() || null,
        matchCode: candidate.matchCode,
        predictionKind: candidate.predictionKind,
        slotKey: candidate.slotKey,
        teamName: candidate.teamName,
        teamId: candidate.teamId,
        invalidReason: candidate.invalidReason,
        clearedSummaryLine: candidate.clearedSummaryLine,
        confidence: candidate.confidence,
        confidenceExplanation: MEDIUM_CONFIDENCE_EXPLANATION,
        currentDbState: describeBackfillCurrentDbState({
          candidate,
          existing,
          teamNameById,
        }),
        suggestedAction,
      };
    });
}

export function buildBackfillReviewReportPayload(input: {
  mediumReports: MediumCandidateReviewReport[];
  generatedAt?: string;
}): BackfillReviewReportPayload {
  return {
    reportVersion: 1,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    mediumCandidates: input.mediumReports,
    decisionTemplate: input.mediumReports.map((report) => ({
      candidateId: report.candidateId,
      decision: "skip" as const,
      note: "",
    })),
  };
}

function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function mediumReviewReportsToCsv(
  reports: MediumCandidateReviewReport[],
): string {
  const headers = [
    "candidateId",
    "participantName",
    "poolName",
    "auditTimestamp",
    "auditActor",
    "matchCode",
    "predictionKind",
    "slotKey",
    "teamName",
    "teamId",
    "invalidReason",
    "clearedSummaryLine",
    "confidence",
    "confidenceExplanation",
    "currentDbState",
    "suggestedAction",
  ];
  const rows = reports.map((r) =>
    [
      r.candidateId,
      r.participantName,
      r.poolName,
      r.auditTimestamp,
      r.auditActor ?? "",
      r.matchCode,
      r.predictionKind,
      r.slotKey ?? "",
      r.teamName,
      r.teamId,
      r.invalidReason,
      r.clearedSummaryLine ?? "",
      r.confidence,
      r.confidenceExplanation,
      r.currentDbState,
      r.suggestedAction,
    ]
      .map((cell) => csvEscape(String(cell)))
      .join(","),
  );
  return `${headers.join(",")}\n${rows.join("\n")}\n`;
}

export function parseBackfillReviewDecisionFile(
  raw: unknown,
): BackfillReviewDecisionFile {
  const parsed = raw as { decisions?: unknown };
  if (!parsed || !Array.isArray(parsed.decisions)) {
    throw new Error("Review decision file must be { decisions: [...] }.");
  }

  const decisions: BackfillReviewDecision[] = [];
  for (const row of parsed.decisions) {
    if (!row || typeof row !== "object") {
      throw new Error("Each decision must be an object.");
    }
    const rec = row as Record<string, unknown>;
    const candidateId = String(rec.candidateId ?? "").trim();
    const decision = String(rec.decision ?? "").trim();
    const note = rec.note == null ? undefined : String(rec.note);
    if (!candidateId) {
      throw new Error("Each decision requires candidateId.");
    }
    if (decision !== "restore_as_out" && decision !== "skip") {
      throw new Error(
        `Invalid decision for ${candidateId}: expected restore_as_out or skip.`,
      );
    }
    decisions.push({ candidateId, decision, note });
  }
  return { decisions };
}

export function validateBackfillReviewDecisions(input: {
  decisions: BackfillReviewDecision[];
  knownCandidateIds: ReadonlySet<string>;
}): { ok: true } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  const seen = new Set<string>();

  for (const decision of input.decisions) {
    if (seen.has(decision.candidateId)) {
      errors.push(`Duplicate candidateId: ${decision.candidateId}`);
    }
    seen.add(decision.candidateId);

    if (!input.knownCandidateIds.has(decision.candidateId)) {
      errors.push(
        `Unknown candidateId (not in current medium review set): ${decision.candidateId}`,
      );
    }
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true };
}

export function buildReviewedMediumBackfillPlan(input: {
  candidates: BackfillCandidate[];
  decisions: BackfillReviewDecision[];
  existingPredictions: Prediction[];
}): BackfillPlanResult {
  const candidateById = new Map(
    input.candidates.map((c) => [c.candidateId, c] as const),
  );
  const approved = input.decisions.filter((d) => d.decision === "restore_as_out");
  const skipped = input.decisions.filter((d) => d.decision === "skip");

  const items: BackfillPlanItem[] = [];
  let plannedRestores = 0;
  let plannedStatusOnly = 0;
  let skippedConflicts = 0;
  let manualReview = 0;

  for (const decision of skipped) {
    const candidate = candidateById.get(decision.candidateId);
    if (!candidate) continue;
    items.push({
      action: "skip",
      candidate,
      reason: "review_skipped",
      detail: decision.note?.trim() || "Explicitly skipped in review decision file.",
    });
    skippedConflicts += 1;
  }

  for (const decision of approved) {
    const candidate = candidateById.get(decision.candidateId);
    if (!candidate) continue;

    if (candidate.confidence !== "medium") {
      items.push({
        action: "skip",
        candidate,
        reason: "low_confidence",
        detail: "Reviewed apply only supports medium-confidence candidates.",
      });
      skippedConflicts += 1;
      continue;
    }

    const item = evaluateCandidateRestore({
      candidate,
      existingPredictions: input.existingPredictions,
      allowConfidence: ["medium"],
      valueTextBuilder: () =>
        buildReviewedRestoredOutValueText({
          auditId: candidate.auditId,
          reviewNote: decision.note,
        }),
    });
    items.push(item);
    if (item.action === "restore") plannedRestores += 1;
    if (item.action === "add_status_only") plannedStatusOnly += 1;
    if (item.action === "skip") skippedConflicts += 1;
    if (item.action === "report_only") manualReview += 1;
  }

  const mediumCandidates = input.candidates.filter((c) => c.confidence === "medium");
  const unreviewed = mediumCandidates.filter(
    (c) => !input.decisions.some((d) => d.candidateId === c.candidateId),
  );
  for (const candidate of unreviewed) {
    items.push({
      action: "report_only",
      candidate,
      reason: "not_reviewed",
      detail: "No decision entry in review file.",
    });
    manualReview += 1;
  }

  return {
    items,
    summary: {
      candidatesFound: mediumCandidates.length,
      highConfidence: 0,
      mediumConfidence: mediumCandidates.length,
      lowConfidence: 0,
      plannedRestores,
      plannedStatusOnly,
      skippedConflicts,
      manualReview,
    },
  };
}

export function getApplyableBackfillUpserts(
  plan: BackfillPlanResult,
  apply: boolean,
): BackfillRestoreUpsert[] {
  if (!apply) return [];
  return plan.items
    .filter(
      (item): item is Extract<
        BackfillPlanItem,
        { action: "restore" | "add_status_only" }
      > => item.action === "restore" || item.action === "add_status_only",
    )
    .map((item) => item.upsert);
}

export function getReviewedApplyableUpserts(
  plan: BackfillPlanResult,
): BackfillRestoreUpsert[] {
  return plan.items
    .filter(
      (item): item is Extract<
        BackfillPlanItem,
        { action: "restore" | "add_status_only" }
      > => item.action === "restore" || item.action === "add_status_only",
    )
    .map((item) => item.upsert);
}

export type ReviewedBackfillRestorePlanResult =
  | {
      ok: true;
      upsert: BackfillRestoreUpsert;
      applyAction: "restore" | "add_status_only";
      candidate: BackfillCandidate;
    }
  | {
      ok: false;
      error: string;
      reason?: BackfillSkipReason;
      candidate?: BackfillCandidate;
    };

/** Same planner path as `--apply-reviewed` for one medium candidate. */
export function planSingleReviewedBackfillRestore(input: {
  candidates: BackfillCandidate[];
  candidateId: string;
  note?: string;
  existingPredictions: Prediction[];
}): ReviewedBackfillRestorePlanResult {
  const candidate = input.candidates.find(
    (row) => row.candidateId === input.candidateId,
  );
  if (!candidate) {
    return {
      ok: false,
      error: "Unknown or stale candidate ID. Refresh the page and try again.",
    };
  }
  if (candidate.confidence !== "medium") {
    return {
      ok: false,
      error: "Only medium-confidence candidates can be restored from review.",
      reason: "low_confidence",
      candidate,
    };
  }

  const plan = buildReviewedMediumBackfillPlan({
    candidates: input.candidates,
    decisions: [
      {
        candidateId: input.candidateId,
        decision: "restore_as_out",
        note: input.note,
      },
    ],
    existingPredictions: input.existingPredictions,
  });

  const item = plan.items.find(
    (row) => row.candidate.candidateId === input.candidateId,
  );
  if (!item) {
    return { ok: false, error: "Could not evaluate candidate.", candidate };
  }

  if (item.action === "restore" || item.action === "add_status_only") {
    return {
      ok: true,
      upsert: item.upsert,
      applyAction: item.action,
      candidate,
    };
  }

  if (item.action === "skip") {
    return {
      ok: false,
      error: item.detail ?? `Skipped (${item.reason}).`,
      reason: item.reason,
      candidate,
    };
  }

  return {
    ok: false,
    error: item.detail ?? "Candidate cannot be restored.",
    reason: item.reason,
    candidate,
  };
}

export type KnockoutOutBackfillReviewSummary = {
  mediumCandidates: number;
  highConfidenceCandidates: number;
  conflicts: number;
  alreadyOut: number;
  missingTeamId: number;
  auditGaps: number;
  restorableMedium: number;
};

export function summarizeKnockoutOutBackfillReview(input: {
  candidates: BackfillCandidate[];
  mediumReports: MediumCandidateReviewReport[];
  manualAuditGaps: string[];
}): KnockoutOutBackfillReviewSummary {
  let conflicts = 0;
  let alreadyOut = 0;
  let restorableMedium = 0;

  for (const report of input.mediumReports) {
    if (report.currentDbState.startsWith("conflict_active:")) conflicts += 1;
    if (report.currentDbState.startsWith("out:")) alreadyOut += 1;
    if (report.suggestedAction === "manual_review") restorableMedium += 1;
  }

  return {
    mediumCandidates: input.mediumReports.length,
    highConfidenceCandidates: input.candidates.filter((c) => c.confidence === "high")
      .length,
    conflicts,
    alreadyOut,
    missingTeamId: input.candidates.filter((c) => !c.teamId.trim()).length,
    auditGaps: input.manualAuditGaps.length,
    restorableMedium,
  };
}

export function formatBackfillCurrentDbStateLabel(state: string): string {
  if (state === "missing_row") return "Missing row";
  if (state === "empty_row") return "Empty row";
  if (state.startsWith("out:")) {
    return `Already out (${state.slice(4)})`;
  }
  if (state.startsWith("active:")) {
    return `Active pick (${state.slice(7)})`;
  }
  if (state.startsWith("conflict_active:")) {
    return `Conflict — slot has different active pick (${state.slice(16)})`;
  }
  return state;
}
