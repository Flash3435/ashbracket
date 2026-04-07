import { ALL_BRACKET_PICK_SECTIONS, resultRowKey } from "../admin/knockoutResultsConfig";
import { WC2026_GROUP_CODES } from "../tournament/wc2026GroupCodes";
import type { Prediction, TournamentStage } from "../../src/types/domain";
import type { KnockoutPickSlotDraft } from "../../types/adminKnockoutPicks";
import { labelParticipantBonusPick } from "./participantBonusLabels";

function bracketSlotLabel(kind: string, slotKey: string | null): string {
  if (kind === "champion") return "Champion";
  if (slotKey === null) return "Pick";
  if (kind === "round_of_32") return `Round of 32 · pick ${slotKey}`;
  if (kind === "round_of_16") return `Round of 16 · pick ${slotKey}`;
  if (kind === "quarterfinalist") return `Quarter-final pick ${slotKey}`;
  if (kind === "semifinalist") return `Semi-final pick ${slotKey}`;
  if (kind === "finalist") return `Final pick ${slotKey}`;
  if (kind === "third_place_qualifier") {
    const n = slotKey != null ? parseInt(slotKey, 10) : NaN;
    const label = Number.isFinite(n) ? `${n}` : "?";
    return `Third-place advancer (${label} of 8 — order does not affect scoring)`;
  }
  return `Slot ${slotKey}`;
}

function matchesBracketSlot(
  p: Prediction,
  participantId: string,
  kind: string,
  tournamentStageId: string,
  slotKey: string | null,
): boolean {
  return (
    p.participantId === participantId &&
    p.predictionKind === kind &&
    p.tournamentStageId === tournamentStageId &&
    p.groupCode === null &&
    p.bonusKey === null &&
    (p.slotKey === slotKey || (p.slotKey === null && slotKey === null))
  );
}

function matchesGroupPick(
  p: Prediction,
  participantId: string,
  kind: string,
  groupStageId: string,
  groupCode: string,
): boolean {
  return (
    p.participantId === participantId &&
    p.predictionKind === kind &&
    p.tournamentStageId === groupStageId &&
    (p.groupCode ?? "").toUpperCase() === groupCode.toUpperCase()
  );
}

function matchesBonusPick(
  p: Prediction,
  participantId: string,
  groupStageId: string,
  bonusKey: string,
): boolean {
  return (
    p.participantId === participantId &&
    p.predictionKind === "bonus_pick" &&
    p.tournamentStageId === groupStageId &&
    p.bonusKey === bonusKey
  );
}

/**
 * Group stage: 1st and 2nd for each WC2026 group letter.
 */
export function buildGroupPickDrafts(
  groupStage: TournamentStage,
  predictions: Prediction[],
  participantId: string,
): KnockoutPickSlotDraft[] {
  const drafts: KnockoutPickSlotDraft[] = [];

  for (const g of WC2026_GROUP_CODES) {
    const upper = g.toUpperCase();
    for (const [kind, finishLabel] of [
      ["group_winner", "1st place"],
      ["group_runner_up", "2nd place"],
    ] as const) {
      const pred = predictions.find((p) =>
        matchesGroupPick(p, participantId, kind, groupStage.id, upper),
      );
      drafts.push({
        rowKey: `${kind}:${upper}`,
        sectionLabel: `Group ${upper}`,
        slotLabel: finishLabel,
        predictionKind: kind,
        tournamentStageId: groupStage.id,
        slotKey: null,
        groupCode: upper,
        bonusKey: null,
        teamId: pred?.teamId ?? "",
      });
    }
  }

  return drafts;
}

/**
 * Third-place qualifiers, Round of 32, and knockout rounds (no group / bonus).
 */
export function buildBracketPickSlotDrafts(
  stageByCode: Partial<Record<TournamentStage["code"], TournamentStage>>,
  predictions: Prediction[],
  participantId: string,
): KnockoutPickSlotDraft[] {
  const drafts: KnockoutPickSlotDraft[] = [];

  for (const section of ALL_BRACKET_PICK_SECTIONS) {
    const stage = stageByCode[section.stageCode as TournamentStage["code"]];
    if (!stage) continue;

    for (const slotKey of section.slotKeys) {
      const pred = predictions.find((p) =>
        matchesBracketSlot(
          p,
          participantId,
          section.kind,
          stage.id,
          slotKey,
        ),
      );
      drafts.push({
        rowKey: resultRowKey(section.kind, slotKey),
        sectionLabel: section.label,
        slotLabel: bracketSlotLabel(section.kind, slotKey),
        predictionKind: section.kind,
        tournamentStageId: stage.id,
        slotKey,
        groupCode: null,
        bonusKey: null,
        teamId: pred?.teamId ?? "",
      });
    }
  }

  return drafts;
}

export function buildBonusPickDrafts(
  groupStageId: string,
  bonusKeys: readonly string[],
  predictions: Prediction[],
  participantId: string,
): KnockoutPickSlotDraft[] {
  return bonusKeys.map((bonusKey) => {
    const pred = predictions.find((p) =>
      matchesBonusPick(p, participantId, groupStageId, bonusKey),
    );
    return {
      rowKey: `bonus_pick:${bonusKey}`,
      sectionLabel: "Bonus picks",
      slotLabel: labelParticipantBonusPick(bonusKey),
      predictionKind: "bonus_pick" as const,
      tournamentStageId: groupStageId,
      slotKey: null,
      groupCode: null,
      bonusKey,
      teamId: pred?.teamId ?? "",
    };
  });
}

export const DEFAULT_PARTICIPANT_BONUS_KEYS = [
  "most_goals",
  "most_yellow_cards",
  "most_red_cards",
] as const;

export function buildAllParticipantPickDrafts(input: {
  stageByCode: Partial<Record<TournamentStage["code"], TournamentStage>>;
  predictions: Prediction[];
  participantId: string;
  bonusKeys: readonly string[];
}): KnockoutPickSlotDraft[] {
  const { stageByCode, predictions, participantId, bonusKeys } = input;
  const groupStage = stageByCode.group;
  if (!groupStage) return [];

  const group = buildGroupPickDrafts(groupStage, predictions, participantId);
  const bracket = buildBracketPickSlotDrafts(
    stageByCode,
    predictions,
    participantId,
  );
  const bonus = buildBonusPickDrafts(
    groupStage.id,
    bonusKeys,
    predictions,
    participantId,
  );

  return [...group, ...bracket, ...bonus];
}

/** @deprecated Use buildBracketPickSlotDrafts — admin-only bracket rows. */
export function buildKnockoutPickSlotDrafts(
  stageByCode: Partial<Record<TournamentStage["code"], TournamentStage>>,
  predictions: Prediction[],
  participantId: string,
): KnockoutPickSlotDraft[] {
  return buildBracketPickSlotDrafts(
    stageByCode,
    predictions,
    participantId,
  );
}
