import assert from "node:assert/strict";
import { buildKnockoutSelectionInstructionCard } from "./knockoutSelectionWindow";
import {
  buildPicksPageCompactLockNote,
  buildPicksPageStatusModel,
  PICKS_PAGE_COMPACT_LOCK_NOTE,
  shouldShowKnockoutInstructionOnPicksPage,
  shouldShowPicksPageStatusCard,
} from "./buildPicksPageStatus";
import { LOCKED_OUT_PICK_HEADLINE } from "./knockoutBlockedRowExplanation";
import { pruneOfficialKnockoutPathPicks } from "../predictions/pruneOfficialKnockoutPathPicks";
import { applyKnockoutPathInvalidation } from "../predictions/knockoutPathInvalidation";
import { isKnockoutPickLockedOut } from "../predictions/knockoutPickStatus";
import type { KnockoutPickSlotDraft } from "../../types/adminKnockoutPicks";
import type { Team } from "../../src/types/domain";
import type { TournamentMatchPublicRow } from "../../types/tournamentPublic";

const teams: Team[] = [
  {
    id: "team-ger",
    name: "Germany",
    countryCode: "GER",
    fifaCode: "GER",
    fifaRank: 5,
    fifaRankAsOf: null,
    createdAt: "",
    updatedAt: "",
  },
  {
    id: "team-par",
    name: "Paraguay",
    countryCode: "PAR",
    fifaCode: "PAR",
    fifaRank: 50,
    fifaRankAsOf: null,
    createdAt: "",
    updatedAt: "",
  },
  {
    id: "team-can",
    name: "Canada",
    countryCode: "CAN",
    fifaCode: "CAN",
    fifaRank: 40,
    fifaRankAsOf: null,
    createdAt: "",
    updatedAt: "",
  },
];

function r32Side(slotKey: string, teamId: string): KnockoutPickSlotDraft {
  return {
    rowKey: `round_of_32|${slotKey}`,
    sectionLabel: "Round of 32",
    slotLabel: `R32 ${slotKey}`,
    predictionKind: "round_of_32",
    tournamentStageId: "r32",
    slotKey,
    groupCode: null,
    bonusKey: null,
    teamId,
  };
}

function qfSlot(slotKey: string, teamId = ""): KnockoutPickSlotDraft {
  return {
    rowKey: `quarterfinalist|${slotKey}`,
    sectionLabel: "Quarter-finals",
    slotLabel: `Quarter-finals · pick ${slotKey}`,
    predictionKind: "quarterfinalist",
    tournamentStageId: "qf",
    slotKey,
    groupCode: null,
    bonusKey: null,
    teamId,
  };
}

const r32OfficialResults: TournamentMatchPublicRow[] = [
  {
    match_id: "m74",
    edition_id: "ed",
    edition_code: "2026",
    match_code: "M74",
    stage_code: "round_of_32",
    stage_label: "Round of 32",
    stage_sort_order: 2,
    group_code: null,
    round_index: 1,
    kickoff_at: "2026-07-01T18:00:00Z",
    status: "finished",
    home_goals: 2,
    away_goals: 0,
    home_penalties: null,
    away_penalties: null,
    home_team_name: "Germany",
    home_country_code: "GER",
    away_team_name: "France",
    away_country_code: "FRA",
    winner_team_name: "Germany",
    winner_country_code: "GER",
  },
  {
    match_id: "m77",
    edition_id: "ed",
    edition_code: "2026",
    match_code: "M77",
    stage_code: "round_of_32",
    stage_label: "Round of 32",
    stage_sort_order: 2,
    group_code: null,
    round_index: 4,
    kickoff_at: "2026-07-01T21:00:00Z",
    status: "finished",
    home_goals: 1,
    away_goals: 0,
    home_penalties: null,
    away_penalties: null,
    home_team_name: "Paraguay",
    home_country_code: "PAR",
    away_team_name: "Sweden",
    away_country_code: "SWE",
    winner_team_name: "Paraguay",
    winner_country_code: "PAR",
  },
];

// Editable repair on unlocked gaps still offers save when dashboard has no actionable gap
{
  const before: KnockoutPickSlotDraft[] = [
    {
      rowKey: "round_of_16|1",
      sectionLabel: "Round of 16",
      slotLabel: "Round of 16 · pick 1",
      predictionKind: "round_of_16",
      tournamentStageId: "r16",
      slotKey: "1",
      groupCode: null,
      bonusKey: null,
      teamId: "team-can",
    },
    {
      rowKey: "round_of_16|2",
      sectionLabel: "Round of 16",
      slotLabel: "Round of 16 · pick 2",
      predictionKind: "round_of_16",
      tournamentStageId: "r16",
      slotKey: "2",
      groupCode: null,
      bonusKey: null,
      teamId: "team-ger",
    },
    qfSlot("1", "team-bra"),
    qfSlot("2", "team-can"),
  ];
  const { slots: repaired, cleared } = pruneOfficialKnockoutPathPicks(before);
  assert.ok(cleared.length > 0, "repair must clear at least one stale pick");
  const model = buildPicksPageStatusModel({
    slots: repaired,
    teams,
    tournamentMatches: null,
    officialRoundOf32Complete: true,
    knockoutPathRepairUnsaved: true,
    knockoutPathClearedPicks: cleared,
  });
  assert.equal(model.kind, "path_reconciliation");
  assert.equal(model.ctaLabel, "Save picks");
  assert.equal(model.ctaAction, "save");
}

// Future editable missing pick still asks user to pick
{
  function r16Slot(slotKey: string, teamId = ""): KnockoutPickSlotDraft {
    return {
      rowKey: `round_of_16|${slotKey}`,
      sectionLabel: "Round of 16",
      slotLabel: `Round of 16 · pick ${slotKey}`,
      predictionKind: "round_of_16",
      tournamentStageId: "r16",
      slotKey,
      groupCode: null,
      bonusKey: null,
      teamId,
    };
  }
  const slots: KnockoutPickSlotDraft[] = [
    r16Slot("2", "team-ger"),
    r16Slot("5", "team-par"),
    r16Slot("1", "team-ger"),
    r16Slot("4", "team-can"),
    qfSlot("1", ""),
    qfSlot("2", "team-can"),
    ...Array.from({ length: 6 }, (_, i) => qfSlot(String(i + 3), "team-ger")),
  ];
  const model = buildPicksPageStatusModel({
    slots,
    teams: [
      ...teams,
      {
        id: "team-ned",
        name: "Netherlands",
        countryCode: "NED",
        fifaCode: "NED",
        fifaRank: 8,
        fifaRankAsOf: null,
        createdAt: "",
        updatedAt: "",
      },
      {
        id: "team-bra",
        name: "Brazil",
        countryCode: "BRA",
        fifaCode: "BRA",
        fifaRank: 3,
        fifaRankAsOf: null,
        createdAt: "",
        updatedAt: "",
      },
    ],
    tournamentMatches: null,
    officialRoundOf32Complete: true,
    knockoutPathRepairUnsaved: false,
  });
  assert.equal(model.kind, "missing_picks");
  assert.equal(model.ctaLabel, "Jump to missing picks");
  assert.match(model.detail, /Germany vs Paraguay|pick/i);
}

// Locked invalid pick shows informational status with no CTA
{
  function r16Slot(slotKey: string, teamId = ""): KnockoutPickSlotDraft {
    return {
      rowKey: `round_of_16|${slotKey}`,
      sectionLabel: "Round of 16",
      slotLabel: `Round of 16 · pick ${slotKey}`,
      predictionKind: "round_of_16",
      tournamentStageId: "r16",
      slotKey,
      groupCode: null,
      bonusKey: null,
      teamId,
    };
  }
  function sfSlot(slotKey: string, teamId = ""): KnockoutPickSlotDraft {
    return {
      rowKey: `semifinalist|${slotKey}`,
      sectionLabel: "Semi-finals",
      slotLabel: `Semi-finals · pick ${slotKey}`,
      predictionKind: "semifinalist",
      tournamentStageId: "sf",
      slotKey,
      groupCode: null,
      bonusKey: null,
      teamId,
    };
  }
  function finSlot(slotKey: string, teamId = ""): KnockoutPickSlotDraft {
    return {
      rowKey: `finalist|${slotKey}`,
      sectionLabel: "Final",
      slotLabel: `Final · pick ${slotKey}`,
      predictionKind: "finalist",
      tournamentStageId: "f",
      slotKey,
      groupCode: null,
      bonusKey: null,
      teamId,
    };
  }
  function champSlot(teamId = ""): KnockoutPickSlotDraft {
    return {
      rowKey: "champion|",
      sectionLabel: "Champion",
      slotLabel: "Champion",
      predictionKind: "champion",
      tournamentStageId: "c",
      slotKey: null,
      groupCode: null,
      bonusKey: null,
      teamId,
    };
  }
  const fullTeams: Team[] = [
    ...teams,
    {
      id: "team-ned",
      name: "Netherlands",
      countryCode: "NED",
      fifaCode: "NED",
      fifaRank: 8,
      fifaRankAsOf: null,
      createdAt: "",
      updatedAt: "",
    },
    {
      id: "team-bra",
      name: "Brazil",
      countryCode: "BRA",
      fifaCode: "BRA",
      fifaRank: 3,
      fifaRankAsOf: null,
      createdAt: "",
      updatedAt: "",
    },
    {
      id: "team-fra",
      name: "France",
      countryCode: "FRA",
      fifaCode: "FRA",
      fifaRank: 2,
      fifaRankAsOf: null,
      createdAt: "",
      updatedAt: "",
    },
    {
      id: "team-rsa",
      name: "South Africa",
      countryCode: "RSA",
      fifaCode: "RSA",
      fifaRank: 30,
      fifaRankAsOf: null,
      createdAt: "",
      updatedAt: "",
    },
  ];
  const fullR16: KnockoutPickSlotDraft[] = [
    r16Slot("1", "team-can"),
    r16Slot("2", "team-ger"),
    r16Slot("3", "team-ned"),
    r16Slot("4", "team-bra"),
    r16Slot("5", "team-fra"),
    r16Slot("6", "team-rsa"),
    r16Slot("7", "team-ned"),
    r16Slot("8", "team-bra"),
    r16Slot("9", "team-ned"),
    r16Slot("10", "team-ger"),
    r16Slot("11", "team-fra"),
    r16Slot("12", "team-ger"),
    r16Slot("13", "team-can"),
    r16Slot("14", "team-ned"),
    r16Slot("15", "team-bra"),
    r16Slot("16", "team-rsa"),
  ];
  const tournamentMatches: TournamentMatchPublicRow[] = [
    {
      match_id: "m89",
      edition_id: "ed",
      edition_code: "2026",
      match_code: "M89",
      stage_code: "round_of_16",
      stage_label: "Round of 16",
      stage_sort_order: 3,
      group_code: null,
      round_index: 0,
      kickoff_at: "2026-07-05T18:00:00Z",
      status: "finished",
      home_goals: 2,
      away_goals: 1,
      home_penalties: null,
      away_penalties: null,
      home_team_name: "Germany",
      home_country_code: "GER",
      away_team_name: "Canada",
      away_country_code: "CAN",
      winner_team_name: "Germany",
      winner_country_code: "GER",
    },
    {
      match_id: "m97",
      edition_id: "ed",
      edition_code: "2026",
      match_code: "M97",
      stage_code: "quarterfinal",
      stage_label: "Quarter-finals",
      stage_sort_order: 4,
      group_code: null,
      round_index: 0,
      kickoff_at: "2026-07-10T18:00:00Z",
      status: "finished",
      home_goals: 1,
      away_goals: 0,
      home_penalties: null,
      away_penalties: null,
      home_team_name: "Germany",
      home_country_code: "GER",
      away_team_name: "Canada",
      away_country_code: "CAN",
      winner_team_name: "Germany",
      winner_country_code: "GER",
    },
  ];
  const before: KnockoutPickSlotDraft[] = [
    ...fullR16,
    qfSlot("1", "team-bra"),
    qfSlot("2", "team-can"),
    qfSlot("3", "team-bra"),
    qfSlot("4", "team-ned"),
    qfSlot("5", "team-fra"),
    qfSlot("6", "team-ger"),
    qfSlot("7", "team-ned"),
    qfSlot("8", "team-can"),
    sfSlot("1", "team-ger"),
    sfSlot("2", "team-fra"),
    sfSlot("3", "team-bra"),
    sfSlot("4", "team-ned"),
    finSlot("1", "team-ger"),
    finSlot("2", "team-fra"),
    champSlot("team-ger"),
  ];
  const { slots: repaired, cleared } = pruneOfficialKnockoutPathPicks(before);
  const finalized = applyKnockoutPathInvalidation(repaired, cleared, {
    teams: fullTeams,
    tournamentMatches,
    knockoutBracketPicksUnlocked: true,
    nowMs: Date.parse("2026-07-11T00:00:00.000Z"),
  });
  const lockedOutQf = finalized.find(
    (s) => s.predictionKind === "quarterfinalist" && s.slotKey === "1",
  );
  assert.ok(isKnockoutPickLockedOut(lockedOutQf ?? { pickStatus: null, teamId: "" }));
  assert.equal(lockedOutQf?.teamId, "team-bra");
  const model = buildPicksPageStatusModel({
    slots: finalized,
    teams: fullTeams,
    tournamentMatches,
    officialRoundOf32Complete: true,
    knockoutPathRepairUnsaved: false,
    knockoutPathClearedPicks: cleared,
  });
  assert.equal(model.kind, "locked_out_picks");
  assert.equal(model.headline, LOCKED_OUT_PICK_HEADLINE);
  assert.match(model.detail, /locked and can no longer advance/i);
  assert.match(model.detail, /No action is needed/i);
  assert.equal(model.ctaLabel, null);
  assert.equal(model.ctaAction, null);
}

// Priority B — missing picks with friendly matchup copy
{
  const model = buildPicksPageStatusModel({
    slots: [],
    teams: [],
    tournamentMatches: null,
    officialRoundOf32Complete: true,
    knockoutPathRepairUnsaved: false,
  });
  assert.equal(model.kind, "complete");
  assert.equal(model.headline, "Current picks complete");
  assert.match(model.detail, /Future matchups will unlock/);
}

// Priority C — complete headline differs from dashboard
{
  const model = buildPicksPageStatusModel({
    slots: [],
    teams: [],
    tournamentMatches: null,
    officialRoundOf32Complete: false,
  });
  assert.equal(model.headline, "Current picks complete");
  assert.notEqual(model.headline, "Your bracket is up to date");
}

// Instruction card hidden on picks page during locking
{
  const card = buildKnockoutSelectionInstructionCard({
    knockoutBracketPicksUnlocked: true,
    matches: [
      {
        match_id: "M73",
        edition_id: "ed",
        edition_code: "wc2026",
        match_code: "M73",
        stage_code: "round_of_32",
        stage_label: "Round of 32",
        stage_sort_order: 1,
        group_code: null,
        round_index: 0,
        kickoff_at: "2026-06-28T19:00:00Z",
        status: "live",
        home_goals: null,
        away_goals: null,
        home_penalties: null,
        away_penalties: null,
        home_team_name: "USA",
        home_country_code: "USA",
        away_team_name: "Mexico",
        away_country_code: "MEX",
        winner_team_name: null,
        winner_country_code: null,
      },
    ],
    picksHref: "/account/picks",
    nowMs: new Date("2026-06-28T19:30:00Z").getTime(),
  });
  assert.equal(card.phase, "locking");
  assert.equal(shouldShowKnockoutInstructionOnPicksPage(card), false);
}

// Instruction card hidden when full bracket is open
{
  const card = buildKnockoutSelectionInstructionCard({
    knockoutBracketPicksUnlocked: true,
    matches: [
      {
        match_id: "M73",
        edition_id: "ed",
        edition_code: "wc2026",
        match_code: "M73",
        stage_code: "round_of_32",
        stage_label: "Round of 32",
        stage_sort_order: 1,
        group_code: null,
        round_index: 0,
        kickoff_at: "2026-06-29T19:00:00Z",
        status: "scheduled",
        home_goals: null,
        away_goals: null,
        home_penalties: null,
        away_penalties: null,
        home_team_name: "USA",
        home_country_code: "USA",
        away_team_name: "Mexico",
        away_country_code: "MEX",
        winner_team_name: null,
        winner_country_code: null,
      },
    ],
    picksHref: "/account/picks",
    nowMs: new Date("2026-06-28T12:00:00Z").getTime(),
  });
  assert.equal(card.phase, "open");
  assert.equal(shouldShowKnockoutInstructionOnPicksPage(card), false);
}

// Compact lock note during live knockout
{
  const note = buildPicksPageCompactLockNote({
    knockoutBracketPicksUnlocked: true,
    matches: [
      {
        match_id: "M73",
        edition_id: "ed",
        edition_code: "wc2026",
        match_code: "M73",
        stage_code: "round_of_32",
        stage_label: "Round of 32",
        stage_sort_order: 1,
        group_code: null,
        round_index: 0,
        kickoff_at: "2026-06-28T19:00:00Z",
        status: "live",
        home_goals: null,
        away_goals: null,
        home_penalties: null,
        away_penalties: null,
        home_team_name: null,
        home_country_code: "USA",
        away_team_name: null,
        away_country_code: "MEX",
        winner_team_name: null,
        winner_country_code: null,
      },
    ],
    nowMs: new Date("2026-06-28T19:30:00Z").getTime(),
  });
  assert.equal(note, PICKS_PAGE_COMPACT_LOCK_NOTE);
}

// Status card only when knockout picks are accessible and editable
{
  assert.equal(
    shouldShowPicksPageStatusCard({
      knockoutPicksAccessible: true,
      readOnly: false,
    }),
    true,
  );
  assert.equal(
    shouldShowPicksPageStatusCard({
      knockoutPicksAccessible: false,
      readOnly: false,
    }),
    false,
  );
  assert.equal(
    shouldShowPicksPageStatusCard({
      knockoutPicksAccessible: true,
      readOnly: true,
    }),
    false,
  );
}

console.log("buildPicksPageStatus.selftest.ts: ok");
