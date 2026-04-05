import {
  KNOCKOUT_EDITOR_SECTIONS,
  resultRowKey,
} from "../admin/knockoutResultsConfig";
import type { Prediction, TournamentStage } from "../../src/types/domain";
import type { KnockoutPickSlotDraft } from "../../types/adminKnockoutPicks";

function slotLabel(slotKey: string | null): string {
  if (slotKey === null) return "Champion";
  return `Slot ${slotKey}`;
}

function matchesKnockoutSlot(
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
    (p.slotKey === slotKey || (p.slotKey === null && slotKey === null))
  );
}

/**
 * Builds one draft row per knockout slot from config + loaded predictions.
 */
export function buildKnockoutPickSlotDrafts(
  stageByCode: Partial<Record<TournamentStage["code"], TournamentStage>>,
  predictions: Prediction[],
  participantId: string,
): KnockoutPickSlotDraft[] {
  const drafts: KnockoutPickSlotDraft[] = [];

  for (const section of KNOCKOUT_EDITOR_SECTIONS) {
    const stage = stageByCode[section.stageCode as TournamentStage["code"]];
    if (!stage) continue;

    for (const slotKey of section.slotKeys) {
      const pred = predictions.find((p) =>
        matchesKnockoutSlot(
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
        slotLabel: slotLabel(slotKey),
        predictionKind: section.kind as KnockoutPickSlotDraft["predictionKind"],
        tournamentStageId: stage.id,
        slotKey,
        teamId: pred?.teamId ?? "",
      });
    }
  }

  return drafts;
}
