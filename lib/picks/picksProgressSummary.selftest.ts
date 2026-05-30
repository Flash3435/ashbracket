import assert from "node:assert";
import { buildPicksProgressSummary } from "./picksProgressSummary";
import type { KnockoutPickSlotDraft } from "../../types/adminKnockoutPicks";

function slot(
  partial: Partial<KnockoutPickSlotDraft> &
    Pick<KnockoutPickSlotDraft, "predictionKind" | "rowKey">,
): KnockoutPickSlotDraft {
  return {
    tournamentStageId: "stage-1",
    sectionLabel: "",
    slotLabel: partial.rowKey,
    groupCode: null,
    slotKey: null,
    bonusKey: null,
    teamId: "",
    ...partial,
  };
}

function filledGroupSlots(): KnockoutPickSlotDraft[] {
  const rows: KnockoutPickSlotDraft[] = [];
  for (const letter of "ABCDEFGHIJKL") {
    rows.push(
      slot({
        rowKey: `gw-${letter}`,
        predictionKind: "group_winner",
        groupCode: letter,
        teamId: `team-gw-${letter}`,
      }),
      slot({
        rowKey: `gr-${letter}`,
        predictionKind: "group_runner_up",
        groupCode: letter,
        teamId: `team-gr-${letter}`,
      }),
    );
  }
  return rows;
}

function eightThirdPlace(): KnockoutPickSlotDraft[] {
  return "ABCDEFGHIJKL".split("").map((letter, i) =>
    slot({
      rowKey: `tp-${letter}`,
      predictionKind: "third_place_qualifier",
      groupCode: letter,
      teamId: i < 8 ? `team-tp-${letter}` : "",
    }),
  );
}

// Barely started — empty slots
{
  const slots = [
    ...filledGroupSlots().map((s) => ({ ...s, teamId: "" })),
    ...eightThirdPlace().map((s) => ({ ...s, teamId: "" })),
    slot({
      rowKey: "bonus-1",
      predictionKind: "bonus_pick",
      bonusKey: "most_goals",
      teamId: "",
    }),
  ];
  const summary = buildPicksProgressSummary(slots, {
    knockoutBracketPicksUnlocked: false,
  });
  assert.strictEqual(summary.actionableMissingCount, 33);
  assert.ok(summary.overallHeadline.includes("Get started"));
  assert.strictEqual(summary.nextSection?.sectionId, "group");
}

// Pre-R32 phase complete
{
  const slots = [
    ...filledGroupSlots(),
    ...eightThirdPlace(),
    slot({
      rowKey: "bonus-1",
      predictionKind: "bonus_pick",
      bonusKey: "most_goals",
      teamId: "team-bonus",
    }),
  ];
  const summary = buildPicksProgressSummary(slots, {
    knockoutBracketPicksUnlocked: false,
  });
  assert.strictEqual(summary.waitingForR32, true);
  assert.strictEqual(summary.picksComplete, true);
  assert.strictEqual(summary.overallHeadline, "Waiting for official Round of 32");
  assert.strictEqual(summary.nextSection, null);
  assert.strictEqual(
    summary.sections.find((s) => s.id === "knockout")?.status,
    "locked",
  );
}

// Partial third-place
{
  const slots = [
    ...filledGroupSlots(),
    ...eightThirdPlace().map((s, i) =>
      i < 3 ? s : { ...s, teamId: "" },
    ),
  ];
  const summary = buildPicksProgressSummary(slots, {
    knockoutBracketPicksUnlocked: false,
  });
  assert.strictEqual(summary.nextSection?.sectionId, "third_place");
  assert.strictEqual(summary.sections.find((s) => s.id === "third_place")?.missing, 5);
}

// Pre-knockout locked — frozen sections not actionable
{
  const slots = [
    ...filledGroupSlots().map((s) => ({ ...s, teamId: "" })),
    ...eightThirdPlace(),
  ];
  const summary = buildPicksProgressSummary(slots, {
    knockoutBracketPicksUnlocked: false,
    preKnockoutLocked: true,
  });
  assert.strictEqual(summary.sections.find((s) => s.id === "group")?.status, "locked");
  assert.strictEqual(summary.actionableMissingCount, 0);
  assert.strictEqual(summary.nextSection, null);
}

console.log("picksProgressSummary.selftest: ok");
