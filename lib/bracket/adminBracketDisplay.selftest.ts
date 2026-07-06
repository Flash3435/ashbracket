/**
 * Self-test: `npx tsx lib/bracket/adminBracketDisplay.selftest.ts`
 */
import type { Team } from "../../src/types/domain";
import type {
  LiveBracketMatch,
  LiveBracketSide,
  LiveBracketTrackerModel,
} from "./liveBracketTracker";
import {
  buildAdminParticipantPicksSummary,
  resolveAdminChampionSummaryLine,
  resolveAdminMatchOutcomeSummary,
  resolveAdminTeamStatusBadge,
} from "./adminBracketDisplay";

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(msg);
}

function team(id: string, name: string): Team {
  return {
    id,
    name,
    countryCode: name.slice(0, 3).toUpperCase(),
    fifaCode: name.slice(0, 3).toUpperCase(),
    fifaRank: null,
    fifaRankAsOf: null,
    createdAt: "",
    updatedAt: "",
  };
}

function side(overrides: Partial<LiveBracketSide> = {}): LiveBracketSide {
  return {
    teamId: null,
    displayName: "TBD",
    countryCode: null,
    tournamentOutcome: null,
    participantPick: null,
    eliminatedFromTournament: false,
    fillState: "team",
    helperTooltip: null,
    ...overrides,
  };
}

function match(overrides: Partial<LiveBracketMatch> = {}): LiveBracketMatch {
  return {
    matchKey: "M104",
    fifaMatchNo: 104,
    stageCode: "final",
    stageLabel: "Final",
    status: "finished",
    scoreLine: "2 – 1",
    statusLabel: "Final",
    home: side({ teamId: "team-fra", displayName: "France" }),
    away: side({ teamId: "team-arg", displayName: "Argentina", tournamentOutcome: "eliminated" }),
    participantPickedWinnerId: "team-fra",
    usesOfficialFixture: true,
    ...overrides,
  };
}

void (async function main() {
  const teamById = new Map([
    team("team-fra", "France"),
    team("team-arg", "Argentina"),
    team("team-bra", "Brazil"),
  ].map((t) => [t.id, t]));

  const pickedAdvanced = resolveAdminTeamStatusBadge(
    side({
      teamId: "team-fra",
      displayName: "France",
      participantPick: "your_pick",
      tournamentOutcome: "advanced",
    }),
  );
  assert(pickedAdvanced?.label === "Picked + advanced", "combines pick + advanced");

  const pickedOnly = resolveAdminTeamStatusBadge(
    side({
      teamId: "team-bra",
      displayName: "Brazil",
      participantPick: "your_pick_alive",
    }),
  );
  assert(pickedOnly?.label === "Picked", "alive pick without result");

  const pickedOut = resolveAdminTeamStatusBadge(
    side({
      teamId: "team-arg",
      displayName: "Argentina",
      participantPick: "your_pick_eliminated",
    }),
  );
  assert(pickedOut?.label === "Picked out", "eliminated participant pick");

  const officialOnly = resolveAdminTeamStatusBadge(
    side({
      teamId: "team-fra",
      displayName: "France",
      participantPick: "not_your_pick",
      tournamentOutcome: "advanced",
    }),
  );
  assert(officialOnly?.label === "Advanced", "official advancer without participant pick");

  const notPicked = resolveAdminTeamStatusBadge(
    side({ fillState: "no_saved_pick", displayName: "No saved pick" }),
  );
  assert(notPicked?.label === "Not picked", "empty slot");

  const correct = resolveAdminMatchOutcomeSummary(
    match({
      home: side({
        teamId: "team-fra",
        displayName: "France",
        participantPick: "your_pick",
        tournamentOutcome: "advanced",
      }),
      away: side({
        teamId: "team-arg",
        displayName: "Argentina",
        tournamentOutcome: "eliminated",
      }),
      participantPickedWinnerId: "team-fra",
    }),
    teamById,
  );
  assert(correct.text === "Pick correct: France", "correct pick summary");

  const missed = resolveAdminMatchOutcomeSummary(
    match({
      home: side({
        teamId: "team-fra",
        displayName: "France",
        tournamentOutcome: "advanced",
        participantPick: "not_your_pick",
      }),
      away: side({
        teamId: "team-arg",
        displayName: "Argentina",
        participantPick: "your_pick_eliminated",
        tournamentOutcome: "eliminated",
      }),
      participantPickedWinnerId: "team-arg",
    }),
    teamById,
  );
  assert(missed.text === "Pick missed: France advanced", "missed pick summary");

  const waiting = resolveAdminMatchOutcomeSummary(
    match({ status: "scheduled", statusLabel: "Upcoming" }),
    teamById,
  );
  assert(waiting.text.includes("Waiting for result"), "upcoming match");

  const noPick = resolveAdminMatchOutcomeSummary(
    match({
      participantPickedWinnerId: null,
      status: "scheduled",
      statusLabel: "Upcoming",
      home: side({ teamId: "team-fra", displayName: "France" }),
      away: side({ teamId: "team-arg", displayName: "Argentina" }),
    }),
    teamById,
  );
  assert(noPick.text === "No pick saved", "no pick saved");

  const champion = resolveAdminChampionSummaryLine(
    {
      teamId: "team-fra",
      displayName: "France",
      countryCode: "FRA",
      hasSavedPick: true,
      emptyLabel: "No champion pick saved",
      participantPick: true,
      eliminatedFromTournament: false,
      participantPickBadge: "your_pick_alive",
      tournamentOutcome: null,
    },
    teamById,
  );
  assert(champion.line === "Champion pick: France", "champion pick line");

  const unreachable = resolveAdminChampionSummaryLine(
    {
      teamId: "team-bra",
      displayName: "Brazil",
      countryCode: "BRA",
      hasSavedPick: true,
      emptyLabel: "No champion pick saved",
      participantPick: true,
      eliminatedFromTournament: true,
      participantPickBadge: "your_pick_eliminated",
      tournamentOutcome: "eliminated",
    },
    teamById,
  );
  assert(
    unreachable.line === "Champion pick out — team not in the final",
    "unreachable champion",
  );

  const tracker: LiveBracketTrackerModel = {
    roundOf32: [
      match({
        matchKey: "M73",
        fifaMatchNo: 73,
        stageCode: "round_of_32",
        stageLabel: "Round of 32",
        home: side({ fillState: "no_saved_pick", displayName: "No saved pick" }),
        away: side({ fillState: "no_saved_pick", displayName: "No saved pick" }),
        participantPickedWinnerId: null,
        status: "scheduled",
      }),
    ],
    roundOf16: [],
    quarterfinals: [],
    semifinals: [],
    final: [
      match({
        home: side({
          teamId: "team-fra",
          displayName: "France",
          participantPick: "your_pick_alive",
        }),
        away: side({ fillState: "no_saved_pick", displayName: "No saved pick" }),
        participantPickedWinnerId: "team-fra",
        status: "scheduled",
      }),
    ],
    champion: {
      teamId: "team-fra",
      displayName: "France",
      countryCode: "FRA",
      hasSavedPick: true,
      emptyLabel: "No champion pick saved",
      participantPick: true,
      eliminatedFromTournament: false,
      participantPickBadge: "your_pick_alive",
      tournamentOutcome: null,
    },
    finalHelperCopy: null,
    showChampionCard: true,
    eliminatedTeamIds: new Set(),
  };

  const summary = buildAdminParticipantPicksSummary(tracker, teamById);
  assert(summary.championPick === "France", "summary champion");
  assert(summary.livePicks.includes("France"), "summary live picks");
  assert(summary.missingSlots.length >= 1, "summary missing slots");

  console.log("adminBracketDisplay.selftest.ts: ok");
})();
