import assert from "node:assert";
import type { ChampionPickInput } from "../account/buildPoolReveal";
import { buildChampionPickExposure } from "./buildChampionPickExposure";

function championPick(
  partial: Partial<ChampionPickInput> & Pick<ChampionPickInput, "teamId" | "participantId">,
): ChampionPickInput {
  return {
    teamName: "Team",
    participantDisplayName: "Participant",
    ...partial,
  };
}

// Multiple participants picking same champion
{
  const exposure = buildChampionPickExposure({
    completeParticipantIds: ["p1", "p2", "p3"],
    championPicks: [
      championPick({ teamId: "t-bra", teamName: "Brazil", teamCode: "BRA", participantId: "p1" }),
      championPick({ teamId: "t-bra", teamName: "Brazil", teamCode: "BRA", participantId: "p2" }),
      championPick({ teamId: "t-esp", teamName: "Spain", teamCode: "ESP", participantId: "p3" }),
    ],
    eliminatedTeamIds: new Set(),
  });

  assert.strictEqual(exposure.totalCompletedChampionPicks, 3);
  assert.strictEqual(exposure.incompleteCount, 0);
  assert.strictEqual(exposure.surviving.length, 2);
  assert.strictEqual(exposure.surviving[0]?.teamId, "t-bra");
  assert.strictEqual(exposure.surviving[0]?.count, 2);
  assert.strictEqual(exposure.surviving[1]?.teamId, "t-esp");
  assert.strictEqual(exposure.surviving[1]?.count, 1);
}

// Eliminated champion omitted from surviving list
{
  const exposure = buildChampionPickExposure({
    completeParticipantIds: ["p1", "p2"],
    championPicks: [
      championPick({ teamId: "t-bra", teamName: "Brazil", participantId: "p1" }),
      championPick({ teamId: "t-esp", teamName: "Spain", participantId: "p2" }),
    ],
    eliminatedTeamIds: new Set(["t-bra"]),
  });

  assert.strictEqual(exposure.surviving.length, 1);
  assert.strictEqual(exposure.surviving[0]?.teamId, "t-esp");
  assert.strictEqual(exposure.eliminated.length, 1);
  assert.strictEqual(exposure.eliminated[0]?.teamId, "t-bra");
  assert.strictEqual(exposure.eliminated[0]?.count, 1);
}

// Null champion picks ignored; incompleteCount reflects missing picks
{
  const exposure = buildChampionPickExposure({
    completeParticipantIds: ["p1", "p2", "p3"],
    championPicks: [
      championPick({ teamId: "t-bra", teamName: "Brazil", participantId: "p1" }),
    ],
    eliminatedTeamIds: new Set(),
  });

  assert.strictEqual(exposure.totalCompletedChampionPicks, 1);
  assert.strictEqual(exposure.incompleteCount, 2);
  assert.strictEqual(exposure.surviving.length, 1);
}

// Sort surviving by count descending
{
  const exposure = buildChampionPickExposure({
    completeParticipantIds: ["p1", "p2", "p3", "p4", "p5", "p6"],
    championPicks: [
      championPick({ teamId: "t-fra", teamName: "France", participantId: "p1" }),
      championPick({ teamId: "t-eng", teamName: "England", participantId: "p2" }),
      championPick({ teamId: "t-eng", teamName: "England", participantId: "p3" }),
      championPick({ teamId: "t-bra", teamName: "Brazil", participantId: "p4" }),
      championPick({ teamId: "t-bra", teamName: "Brazil", participantId: "p5" }),
      championPick({ teamId: "t-bra", teamName: "Brazil", participantId: "p6" }),
    ],
    eliminatedTeamIds: new Set(),
  });

  assert.deepStrictEqual(
    exposure.surviving.map((row) => row.teamId),
    ["t-bra", "t-eng", "t-fra"],
  );
  assert.strictEqual(exposure.surviving[0]?.count, 3);
  assert.strictEqual(exposure.surviving[1]?.count, 2);
  assert.strictEqual(exposure.surviving[2]?.count, 1);
}

// All champion picks eliminated
{
  const exposure = buildChampionPickExposure({
    completeParticipantIds: ["p1", "p2"],
    championPicks: [
      championPick({ teamId: "t-bra", teamName: "Brazil", participantId: "p1" }),
      championPick({ teamId: "t-esp", teamName: "Spain", participantId: "p2" }),
    ],
    eliminatedTeamIds: new Set(["t-bra", "t-esp"]),
  });

  assert.strictEqual(exposure.surviving.length, 0);
  assert.strictEqual(exposure.eliminated.length, 2);
  assert.strictEqual(exposure.totalCompletedChampionPicks, 2);
}

console.log("buildChampionPickExposure.selftest.ts: all passed");
