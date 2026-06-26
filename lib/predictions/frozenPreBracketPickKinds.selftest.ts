import assert from "node:assert";
import type { Prediction } from "../../src/types/domain";
import type { ParticipantPickSlotPayload } from "../../types/knockoutPicksSave";
import { validateFrozenPicksUnchangedWhenPoolLocked } from "./frozenPreBracketPickKinds";

const stageR32 = "00000000-0000-4000-8000-000000000010";

const existing: Prediction[] = [
  {
    id: "p1",
    poolId: "pool",
    participantId: "par",
    predictionKind: "third_place_qualifier",
    teamId: "team-a-third",
    tournamentStageId: stageR32,
    groupCode: "A",
    slotKey: null,
    bonusKey: null,
    valueText: null,
    createdAt: "",
    updatedAt: "",
  },
  {
    id: "p2",
    poolId: "pool",
    participantId: "par",
    predictionKind: "third_place_qualifier",
    teamId: "team-b-third",
    tournamentStageId: stageR32,
    groupCode: "B",
    slotKey: null,
    bonusKey: null,
    valueText: null,
    createdAt: "",
    updatedAt: "",
  },
];

const incoming: ParticipantPickSlotPayload[] = [
  {
    predictionKind: "third_place_qualifier",
    tournamentStageId: stageR32,
    slotKey: null,
    groupCode: "A",
    bonusKey: null,
    teamId: "team-a-third",
  },
  {
    predictionKind: "third_place_qualifier",
    tournamentStageId: stageR32,
    slotKey: null,
    groupCode: "B",
    bonusKey: null,
    teamId: "team-b-third",
  },
];

assert.strictEqual(
  validateFrozenPicksUnchangedWhenPoolLocked(existing, incoming),
  null,
);

assert.strictEqual(
  validateFrozenPicksUnchangedWhenPoolLocked(existing, [
    ...incoming,
    {
      predictionKind: "third_place_qualifier",
      tournamentStageId: stageR32,
      slotKey: null,
      groupCode: "C",
      bonusKey: null,
      teamId: "team-c-third",
    },
  ]),
  "Group stage, third-place, and bonus picks are locked. You can still update confirmed knockout matchups until each match kicks off.",
);

console.log("frozenPreBracketPickKinds.selftest.ts: ok");
