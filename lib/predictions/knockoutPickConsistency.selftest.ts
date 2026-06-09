import type { Prediction, Team, TournamentStage } from "../../src/types/domain";
import type { KnockoutPickSlotDraft } from "../../types/adminKnockoutPicks";
import { buildThirdPlacePickDrafts } from "./buildParticipantPickDrafts";
import {
  assignParticipantPickDeduped,
  buildTeamIdToGroupLetter,
  buildThirdPlacePickChooserOptionsForGroup,
  normalizeParticipantThirdPlaceSaveSlots,
  pruneParticipantPicks,
  THIRD_PLACE_DISABLED_MAX_SELECTED,
  THIRD_PLACE_ROW_MAX_SELECTED_EXPLANATION,
  THIRD_PLACE_DISABLED_OTHER_SLOT,
  THIRD_PLACE_DISABLED_RUNNER,
  THIRD_PLACE_DISABLED_WINNER,
  thirdPlacePickDisabledReason,
  thirdPlaceRowUnavailableReason,
  thirdPlaceSlotInvalidReason,
  validateParticipantSlotsThirdPlaceRules,
} from "./knockoutPickConsistency";

function row(
  partial: Partial<KnockoutPickSlotDraft> &
    Pick<KnockoutPickSlotDraft, "rowKey" | "predictionKind" | "teamId">,
): KnockoutPickSlotDraft {
  return {
    sectionLabel: "",
    slotLabel: "",
    tournamentStageId: "00000000-0000-4000-8000-000000000001",
    slotKey: null,
    groupCode: null,
    bonusKey: null,
    ...partial,
  };
}

function prediction(
  partial: Partial<Prediction> &
    Pick<Prediction, "id" | "predictionKind" | "teamId">,
): Prediction {
  return {
    poolId: "pool",
    participantId: "participant",
    tournamentStageId: "00000000-0000-4000-8000-000000000001",
    groupCode: null,
    slotKey: null,
    bonusKey: null,
    valueText: null,
    createdAt: "",
    updatedAt: "",
    ...partial,
  };
}

function team(
  id: string,
  name: string,
  countryCode: string,
  fifaRank: number,
): Team {
  return {
    id,
    name,
    countryCode,
    fifaCode: null,
    fifaRank,
    fifaRankAsOf: null,
    createdAt: "",
    updatedAt: "",
  };
}

const roundOf32Stage = {
  id: "00000000-0000-4000-8000-000000000099",
  code: "round_of_32",
  label: "Round of 32",
  sortOrder: 2,
  startsAt: null,
  endsAt: null,
  createdAt: "",
  updatedAt: "",
} as TournamentStage;

const a1 = team("10000000-0000-4000-8000-000000000001", "Alpha", "AAA", 1);
const a2 = team("10000000-0000-4000-8000-000000000002", "Atlas", "AAB", 2);
const a3 = team("10000000-0000-4000-8000-000000000003", "Aurora", "AAC", 3);
const b1 = team("20000000-0000-4000-8000-000000000001", "Beta", "BBB", 4);
const b2 = team("20000000-0000-4000-8000-000000000002", "Bravo", "BBC", 5);
const b3 = team("20000000-0000-4000-8000-000000000003", "Blaze", "BBD", 6);
const allTeams = [a1, a2, a3, b1, b2, b3];
const groupMap: Record<string, string[]> = {
  A: ["AAA", "AAB", "AAC"],
  B: ["BBB", "BBC", "BBD"],
};
const teamIdToGroupLetter = buildTeamIdToGroupLetter(allTeams, groupMap);
if (
  THIRD_PLACE_ROW_MAX_SELECTED_EXPLANATION !==
  "Clear one of your current eight to choose from this group."
) {
  throw new Error("unexpected Stage 2 max-selected explanation copy");
}

// --- only teams from the correct group are shown ---
const thirdRowA = row({
  rowKey: "tpA",
  predictionKind: "third_place_qualifier",
  teamId: "",
  groupCode: "A",
});
const stage2ContextA: KnockoutPickSlotDraft[] = [
  row({
    rowKey: "gwA",
    predictionKind: "group_winner",
    teamId: a1.id,
    groupCode: "A",
  }),
  row({
    rowKey: "grA",
    predictionKind: "group_runner_up",
    teamId: a2.id,
    groupCode: "A",
  }),
  thirdRowA,
];
const chooserA = buildThirdPlacePickChooserOptionsForGroup(
  thirdRowA,
  stage2ContextA,
  allTeams,
  groupMap,
);
if (chooserA.map((x) => x.team.id).join(",") !== a3.id) {
  throw new Error(
    `expected only Group A's remaining team, got ${chooserA.map((x) => x.team.name).join(",")}`,
  );
}

// --- teams already selected 1st/2nd are excluded or blocked ---
const winnerReason = thirdPlacePickDisabledReason(
  a1.id,
  thirdRowA,
  stage2ContextA,
);
if (winnerReason !== THIRD_PLACE_DISABLED_WINNER) {
  throw new Error(`expected winner block, got ${winnerReason}`);
}
const runnerReason = thirdPlacePickDisabledReason(
  a2.id,
  thirdRowA,
  stage2ContextA,
);
if (runnerReason !== THIRD_PLACE_DISABLED_RUNNER) {
  throw new Error(`expected runner block, got ${runnerReason}`);
}

// --- duplicates across Stage 2 are rejected ---
const duplicateReason = thirdPlacePickDisabledReason(
  b1.id,
  row({
    rowKey: "tpB2",
    predictionKind: "third_place_qualifier",
    teamId: "",
    groupCode: "B",
  }),
  [
    row({
      rowKey: "tpB1",
      predictionKind: "third_place_qualifier",
      teamId: b1.id,
      groupCode: "B",
    }),
    row({
      rowKey: "tpB2",
      predictionKind: "third_place_qualifier",
      teamId: "",
      groupCode: "B",
    }),
  ],
);
if (duplicateReason !== THIRD_PLACE_DISABLED_OTHER_SLOT) {
  throw new Error(`expected duplicate block, got ${duplicateReason}`);
}
const duplicateTeamSave = normalizeParticipantThirdPlaceSaveSlots({
  slots: [
    {
      predictionKind: "third_place_qualifier",
      tournamentStageId: roundOf32Stage.id,
      slotKey: null,
      groupCode: "A",
      bonusKey: null,
      teamId: a3.id,
    },
    {
      predictionKind: "third_place_qualifier",
      tournamentStageId: roundOf32Stage.id,
      slotKey: null,
      groupCode: "B",
      bonusKey: null,
      teamId: a3.id,
    },
  ],
  teams: allTeams,
  groupTeamCountryCodesByLetter: groupMap,
});
if (duplicateTeamSave.ok) {
  throw new Error("server normalization should reject duplicate third-place teams");
}

// --- current selection stays choosable until the user changes it ---
const currentSelectionReason = thirdPlacePickDisabledReason(
  a1.id,
  row({
    rowKey: "tp-current",
    predictionKind: "third_place_qualifier",
    teamId: a1.id,
    groupCode: "A",
  }),
  stage2ContextA,
);
if (currentSelectionReason !== null) {
  throw new Error(
    `expected current third-place pick to stay choosable, got ${currentSelectionReason}`,
  );
}

// --- once eight groups are selected, additional Stage 2 rows are blocked ---
const maxEightReason = thirdPlacePickDisabledReason(
  a3.id,
  thirdRowA,
  [
    thirdRowA,
    ...Array.from({ length: 8 }, (_, i) =>
      row({
        rowKey: `filled-${i}`,
        predictionKind: "third_place_qualifier",
        teamId: `third-${i}`,
        groupCode: `G${i}`,
      }),
    ),
  ],
);
if (maxEightReason !== THIRD_PLACE_DISABLED_MAX_SELECTED) {
  throw new Error(`expected max-eight block, got ${maxEightReason}`);
}
const maxEightRowReason = thirdPlaceRowUnavailableReason(
  thirdRowA,
  [
    thirdRowA,
    ...Array.from({ length: 8 }, (_, i) =>
      row({
        rowKey: `filled-row-${i}`,
        predictionKind: "third_place_qualifier",
        teamId: `third-row-${i}`,
        groupCode: `G${i}`,
      }),
    ),
  ],
);
if (maxEightRowReason !== THIRD_PLACE_ROW_MAX_SELECTED_EXPLANATION) {
  throw new Error(`expected row-level max-eight explanation, got ${maxEightRowReason}`);
}
const selectedRowStillAvailable = thirdPlaceRowUnavailableReason(
  row({
    rowKey: "selected-at-cap",
    predictionKind: "third_place_qualifier",
    teamId: a3.id,
    groupCode: "A",
  }),
  [
    ...Array.from({ length: 8 }, (_, i) =>
      row({
        rowKey: `picked-${i}`,
        predictionKind: "third_place_qualifier",
        teamId: `picked-${i}`,
        groupCode: `P${i}`,
      }),
    ),
  ],
);
if (selectedRowStillAvailable !== null) {
  throw new Error("selected Stage 2 rows should stay actionable at the eight-pick cap");
}

// --- invalid persisted Stage 2 values are cleaned or flagged ---
const wrongGroupReason = thirdPlaceSlotInvalidReason(
  row({
    rowKey: "bad-group",
    predictionKind: "third_place_qualifier",
    teamId: b1.id,
    groupCode: "A",
  }),
  [],
  { teamIdToGroupLetter },
);
if (wrongGroupReason !== "Does not belong to Group A") {
  throw new Error(`expected wrong-group reason, got ${wrongGroupReason}`);
}
const legacyHydrated = buildThirdPlacePickDrafts(
  roundOf32Stage,
  [
    prediction({
      id: "pred-good-legacy",
      predictionKind: "third_place_qualifier",
      teamId: b3.id,
      tournamentStageId: roundOf32Stage.id,
      slotKey: "1",
      groupCode: null,
    }),
  ],
  "participant",
  allTeams,
  groupMap,
);
if (legacyHydrated.find((s) => s.groupCode === "B")?.teamId !== b3.id) {
  throw new Error("legacy Stage 2 row should hydrate into its inferred group");
}

const wrongGroupHydrated = buildThirdPlacePickDrafts(
  roundOf32Stage,
  [
    prediction({
      id: "pred-bad-group",
      predictionKind: "third_place_qualifier",
      teamId: b2.id,
      tournamentStageId: roundOf32Stage.id,
      slotKey: null,
      groupCode: "A",
    }),
  ],
  "participant",
  allTeams,
  groupMap,
);
if (wrongGroupHydrated.find((s) => s.groupCode === "B")?.teamId !== b2.id) {
  throw new Error(
    "wrong group_code should remap to inferred group on hydration, not drop the pick",
  );
}
if (wrongGroupHydrated.find((s) => s.groupCode === "A")?.teamId !== "") {
  throw new Error("wrong group_code should not remain on the incorrect group row");
}
const wrongGroupSave = normalizeParticipantThirdPlaceSaveSlots({
  slots: [
    {
      predictionKind: "third_place_qualifier",
      tournamentStageId: roundOf32Stage.id,
      slotKey: null,
      groupCode: "A",
      bonusKey: null,
      teamId: b3.id,
    },
  ],
  teams: allTeams,
  groupTeamCountryCodesByLetter: groupMap,
});
if (wrongGroupSave.ok) {
  throw new Error("server normalization should reject a team saved under the wrong group");
}

// --- payload validation rejects duplicate group rows ---
const duplicateGroupErr = validateParticipantSlotsThirdPlaceRules([
  {
    predictionKind: "third_place_qualifier",
    tournamentStageId: roundOf32Stage.id,
    slotKey: null,
    groupCode: "A",
    bonusKey: null,
    teamId: a2.id,
  },
  {
    predictionKind: "third_place_qualifier",
    tournamentStageId: roundOf32Stage.id,
    slotKey: null,
    groupCode: "A",
    bonusKey: null,
    teamId: a3.id,
  },
]);
if (duplicateGroupErr == null) {
  throw new Error("validator should reject two Stage 2 payload rows for one group");
}

// --- changing Stage 1 invalidates conflicting Stage 2 picks immediately ---
const pruned = pruneParticipantPicks([
  row({
    rowKey: "gw",
    predictionKind: "group_winner",
    teamId: a3.id,
    groupCode: "A",
  }),
  row({
    rowKey: "tp",
    predictionKind: "third_place_qualifier",
    teamId: a3.id,
    groupCode: "A",
  }),
]);
if (pruned.find((s) => s.rowKey === "tp")?.teamId !== "") {
  throw new Error("prune should clear Stage 2 picks that became top-two picks");
}
const afterGroupPick = assignParticipantPickDeduped(
  [
    row({
      rowKey: "tpA",
      predictionKind: "third_place_qualifier",
      teamId: a3.id,
      groupCode: "A",
    }),
    row({
      rowKey: "grA",
      predictionKind: "group_runner_up",
      teamId: "",
      groupCode: "A",
    }),
  ],
  "grA",
  a3.id,
);
if (afterGroupPick.find((s) => s.rowKey === "tpA")?.teamId !== "") {
  throw new Error(
    "picking a Stage 1 top-two team should immediately clear the conflicting Stage 2 row",
  );
}

console.log("knockoutPickConsistency selftest: ok");
