import assert from "node:assert";
import type { Prediction, Team, TournamentStage } from "../../src/types/domain";
import {
  championTeamIdFromDraftSlots,
  championTeamIdFromPredictions,
  resolvePoolChampionPickInputs,
} from "./resolvePoolChampionPicks";

function pred(
  partial: Partial<Prediction> & Pick<Prediction, "participantId" | "predictionKind">,
): Prediction {
  return {
    id: "pred-1",
    poolId: "pool-1",
    teamId: "",
    tournamentStageId: "stage-final",
    groupCode: null,
    slotKey: null,
    bonusKey: null,
    valueText: null,
    createdAt: "",
    updatedAt: "",
    ...partial,
  };
}

function team(id: string, name: string, countryCode: string): Team {
  return {
    id,
    name,
    countryCode,
    fifaCode: countryCode,
    fifaRank: null,
    fifaRankAsOf: null,
    createdAt: "",
    updatedAt: "",
  };
}

const finalStage: TournamentStage = {
  id: "stage-final",
  code: "final",
  label: "Final",
  sortOrder: 5,
  startsAt: null,
  endsAt: null,
  createdAt: "",
  updatedAt: "",
};

const stageByCode = { final: finalStage } as Partial<
  Record<TournamentStage["code"], TournamentStage>
>;

// Direct champion prediction row
{
  const predictions = [
    pred({
      participantId: "p1",
      predictionKind: "champion",
      teamId: "t-bra",
    }),
  ];
  assert.strictEqual(
    championTeamIdFromPredictions(predictions, "p1"),
    "t-bra",
  );
}

// Draft fallback when prediction row missing but champion slot would be empty too
{
  const predictions = [
    pred({
      participantId: "p2",
      predictionKind: "group_winner",
      teamId: "t-arg",
      groupCode: "A",
      tournamentStageId: "stage-group",
    }),
  ];
  assert.strictEqual(championTeamIdFromPredictions(predictions, "p2"), null);
}

// Resolve prefers prediction row; does not double-count
{
  const predictions = [
    pred({
      participantId: "p1",
      predictionKind: "champion",
      teamId: "t-bra",
    }),
    pred({
      participantId: "p1",
      predictionKind: "champion",
      teamId: "t-arg",
    }),
  ];
  const resolved = resolvePoolChampionPickInputs({
    completeParticipantIds: ["p1"],
    predictions,
    participantRows: [{ id: "p1", display_name: "Adarsh" }],
    teams: [team("t-bra", "Brazil", "BRA")],
    stageByCode,
    bonusKeys: [],
    groupTeamCountryCodesByLetter: {},
  });
  assert.strictEqual(resolved.length, 1);
  assert.strictEqual(resolved[0]!.teamId, "t-bra");
  assert.strictEqual(resolved[0]!.participantDisplayName, "Adarsh");
  assert.ok(!JSON.stringify(resolved).includes("@"));
}

// Complete participant without champion is omitted
{
  const resolved = resolvePoolChampionPickInputs({
    completeParticipantIds: ["p1", "p2"],
    predictions: [
      pred({
        participantId: "p1",
        predictionKind: "champion",
        teamId: "t-bra",
      }),
    ],
    participantRows: [
      { id: "p1", display_name: "A" },
      { id: "p2", display_name: "B" },
    ],
    teams: [team("t-bra", "Brazil", "BRA")],
    stageByCode,
    bonusKeys: [],
    groupTeamCountryCodesByLetter: {},
  });
  assert.strictEqual(resolved.length, 1);
  assert.strictEqual(resolved[0]!.participantId, "p1");
}

// Incomplete participant ignored even if champion row exists
{
  const resolved = resolvePoolChampionPickInputs({
    completeParticipantIds: ["p1"],
    predictions: [
      pred({
        participantId: "p1",
        predictionKind: "champion",
        teamId: "t-bra",
      }),
      pred({
        participantId: "p9",
        predictionKind: "champion",
        teamId: "t-arg",
      }),
    ],
    participantRows: [
      { id: "p1", display_name: "A" },
      { id: "p9", display_name: "Incomplete" },
    ],
    teams: [
      team("t-bra", "Brazil", "BRA"),
      team("t-arg", "Argentina", "ARG"),
    ],
    stageByCode,
    bonusKeys: [],
    groupTeamCountryCodesByLetter: {},
  });
  assert.strictEqual(resolved.length, 1);
  assert.strictEqual(resolved[0]!.teamName, "Brazil");
}

// Draft fallback path is wired (empty without full stage config)
{
  const tid = championTeamIdFromDraftSlots({
    stageByCode: {},
    predictions: [
      pred({
        participantId: "p1",
        predictionKind: "champion",
        teamId: "t-bra",
      }),
    ],
    participantId: "p1",
    bonusKeys: [],
    teams: [],
    groupTeamCountryCodesByLetter: {},
  });
  assert.strictEqual(tid, null);
}

console.log("resolvePoolChampionPicks.selftest.ts: all passed");
