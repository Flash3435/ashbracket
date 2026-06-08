import assert from "node:assert";
import {
  buildPoolReveal,
  isPostLockPoolInsightSourceKey,
  type ChampionPickInput,
} from "./buildPoolReveal";

const FUTURE_LOCK = "2099-06-11T03:59:00.000Z";
const PAST_LOCK = "2020-06-11T03:59:00.000Z";

function pick(
  partial: Partial<ChampionPickInput> & Pick<ChampionPickInput, "teamId" | "participantId">,
): ChampionPickInput {
  return {
    teamName: "Team",
    participantDisplayName: "Player",
    ...partial,
  };
}

const baseInput = {
  lockAt: PAST_LOCK,
  deadlineLabel: "Jun 10, 2020, 11:59 PM ET",
  relativeCountdown: "locked",
  totalParticipants: 5,
  completeParticipantIds: ["p1", "p2", "p3", "p4"],
  viewerPicksComplete: true,
  canShowParticipantNames: true,
  nowMs: Date.parse("2021-01-01T00:00:00.000Z"),
};

// Before lock: no team data
{
  const data = buildPoolReveal({
    ...baseInput,
    lockAt: FUTURE_LOCK,
    championPicks: [
      pick({
        teamId: "t-bra",
        teamName: "Brazil",
        participantId: "p1",
        participantDisplayName: "Adarsh",
      }),
    ],
  });
  assert.strictEqual(data.locked, false);
  assert.strictEqual(data.championPicks.length, 0);
  assert.strictEqual(data.uniqueChampionCount, 0);
  assert.strictEqual(data.championDiversityCount, 0);
  assert.strictEqual(data.mostPopularChampion, null);
  assert.strictEqual(data.canShowParticipantNames, false);
}

// After lock: champion counts
{
  const data = buildPoolReveal({
    ...baseInput,
    championPicks: [
      pick({ teamId: "t-bra", teamName: "Brazil", teamCode: "BRA", participantId: "p1", participantDisplayName: "Adarsh" }),
      pick({ teamId: "t-bra", teamName: "Brazil", teamCode: "BRA", participantId: "p2", participantDisplayName: "Nish" }),
      pick({ teamId: "t-arg", teamName: "Argentina", teamCode: "ARG", participantId: "p3", participantDisplayName: "Lakshmi" }),
      pick({ teamId: "t-can", teamName: "Canada", teamCode: "CAN", participantId: "p4", participantDisplayName: "Dipa" }),
    ],
  });
  assert.strictEqual(data.locked, true);
  assert.strictEqual(data.totalCompleted, 4);
  assert.strictEqual(data.totalChampionBrackets, 4);
  assert.strictEqual(data.championPicks.length, 3);
  assert.strictEqual(data.championPicks[0]!.teamName, "Brazil");
  assert.strictEqual(data.championPicks[0]!.count, 2);
  assert.strictEqual(data.championPicks[0]!.percentage, 50);
  assert.strictEqual(data.championPicks[1]!.teamName, "Argentina");
  assert.strictEqual(data.championPicks[1]!.count, 1);
  assert.strictEqual(data.championPicks[2]!.teamName, "Canada");
  assert.strictEqual(data.uniqueChampionCount, 2);
  assert.strictEqual(data.championDiversityCount, 3);
  assert.strictEqual(data.mostPopularChampion?.teamName, "Brazil");
  assert.strictEqual(data.mostPopularChampionTied, false);
}

// Incomplete picks ignored
{
  const data = buildPoolReveal({
    ...baseInput,
    completeParticipantIds: ["p1", "p2"],
    championPicks: [
      pick({ teamId: "t-bra", teamName: "Brazil", participantId: "p1", participantDisplayName: "A" }),
      pick({ teamId: "t-arg", teamName: "Argentina", participantId: "p9", participantDisplayName: "Incomplete" }),
    ],
  });
  assert.strictEqual(data.totalCompleted, 2);
  assert.strictEqual(data.totalChampionBrackets, 1);
  assert.strictEqual(data.championPicks.length, 1);
  assert.strictEqual(data.championPicks[0]!.count, 1);
  assert.strictEqual(data.championPicks[0]!.percentage, 100);
}

// Tie sorting is stable by team name
{
  const data = buildPoolReveal({
    ...baseInput,
    completeParticipantIds: ["p1", "p2", "p3", "p4"],
    championPicks: [
      pick({ teamId: "t-arg", teamName: "Argentina", participantId: "p1", participantDisplayName: "A" }),
      pick({ teamId: "t-bra", teamName: "Brazil", participantId: "p2", participantDisplayName: "B" }),
      pick({ teamId: "t-fra", teamName: "France", participantId: "p3", participantDisplayName: "C" }),
      pick({ teamId: "t-ger", teamName: "Germany", participantId: "p4", participantDisplayName: "D" }),
    ],
  });
  assert.strictEqual(data.championPicks.every((c) => c.count === 1), true);
  assert.strictEqual(data.mostPopularChampionTied, true);
  const names = data.championPicks.map((c) => c.teamName);
  assert.deepStrictEqual(names, ["Argentina", "Brazil", "France", "Germany"]);
}

// Participant names omitted when visibility disallows
{
  const data = buildPoolReveal({
    ...baseInput,
    canShowParticipantNames: false,
    championPicks: [
      pick({ teamId: "t-bra", teamName: "Brazil", participantId: "p1", participantDisplayName: "Adarsh" }),
    ],
  });
  assert.strictEqual(data.canShowParticipantNames, false);
  assert.strictEqual(data.championPicks[0]!.participantNames, undefined);
}

// Participant names included when allowed
{
  const data = buildPoolReveal({
    ...baseInput,
    championPicks: [
      pick({ teamId: "t-bra", teamName: "Brazil", participantId: "p1", participantDisplayName: "Adarsh" }),
      pick({ teamId: "t-bra", teamName: "Brazil", participantId: "p2", participantDisplayName: "Nish" }),
    ],
  });
  assert.deepStrictEqual(data.championPicks[0]!.participantNames, ["Adarsh", "Nish"]);
}

// No emails or internal IDs in output
{
  const data = buildPoolReveal({
    ...baseInput,
    championPicks: [
      pick({
        teamId: "t-bra",
        teamName: "Brazil",
        participantId: "p1",
        participantDisplayName: "THE SHARK KING",
      }),
    ],
  });
  const serialized = JSON.stringify(data);
  assert.ok(!serialized.includes("@"));
  assert.ok(!serialized.includes("550e8400"));
  assert.ok(serialized.includes("THE SHARK KING"));
}

// Unique champion count
{
  const data = buildPoolReveal({
    ...baseInput,
    championPicks: [
      pick({ teamId: "t-bra", teamName: "Brazil", participantId: "p1", participantDisplayName: "A" }),
      pick({ teamId: "t-bra", teamName: "Brazil", participantId: "p2", participantDisplayName: "B" }),
      pick({ teamId: "t-jpn", teamName: "Japan", participantId: "p3", participantDisplayName: "C" }),
      pick({ teamId: "t-can", teamName: "Canada", participantId: "p4", participantDisplayName: "D" }),
    ],
  });
  assert.strictEqual(data.uniqueChampionCount, 2);
  assert.strictEqual(data.soloChampionPicks.length, 2);
}

// Complete without champion: excluded from champion denominator
{
  const data = buildPoolReveal({
    ...baseInput,
    completeParticipantIds: ["p1", "p2", "p3"],
    championPicks: [
      pick({ teamId: "t-bra", teamName: "Brazil", participantId: "p1", participantDisplayName: "A" }),
      pick({ teamId: "t-bra", teamName: "Brazil", participantId: "p2", participantDisplayName: "B" }),
    ],
  });
  assert.strictEqual(data.totalCompleted, 3);
  assert.strictEqual(data.totalChampionBrackets, 2);
  assert.strictEqual(data.championPicks[0]!.percentage, 100);
}

// Pre-lock loader-shaped input exposes no team strings
{
  const data = buildPoolReveal({
    ...baseInput,
    lockAt: FUTURE_LOCK,
    championPicks: [
      pick({ teamId: "t-bra", teamName: "Brazil", participantId: "p1", participantDisplayName: "A" }),
    ],
  });
  const serialized = JSON.stringify(data);
  assert.ok(!serialized.includes("Brazil"));
  assert.ok(!serialized.includes("t-bra"));
}

assert.strictEqual(isPostLockPoolInsightSourceKey("postlock_top_champion"), true);
assert.strictEqual(isPostLockPoolInsightSourceKey("prelock_joins_today_2"), false);

console.log("buildPoolReveal.selftest.ts: all passed");
