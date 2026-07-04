import assert from "node:assert";
import type { Team } from "../../src/types/domain";
import type { TournamentMatchPublicRow } from "../../types/tournamentPublic";
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
    id: "team-can",
    name: "Canada",
    countryCode: "CAN",
    fifaCode: "CAN",
    fifaRank: 40,
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

function r16Slot(slotKey: string, teamId = ""): KnockoutPickSlotDraft {
  return slot({
    rowKey: `round_of_16|${slotKey}`,
    predictionKind: "round_of_16",
    slotKey,
    teamId,
  });
}

function qfSlot(slotKey: string, teamId = ""): KnockoutPickSlotDraft {
  return slot({
    rowKey: `quarterfinalist|${slotKey}`,
    predictionKind: "quarterfinalist",
    slotKey,
    teamId,
  });
}

function sfSlot(slotKey: string, teamId = ""): KnockoutPickSlotDraft {
  return slot({
    rowKey: `semifinalist|${slotKey}`,
    predictionKind: "semifinalist",
    slotKey,
    teamId,
  });
}

function finSlot(slotKey: string, teamId = ""): KnockoutPickSlotDraft {
  return slot({
    rowKey: `finalist|${slotKey}`,
    predictionKind: "finalist",
    slotKey,
    teamId,
  });
}

function champSlot(teamId = ""): KnockoutPickSlotDraft {
  return slot({
    rowKey: "champion|",
    predictionKind: "champion",
    teamId,
  });
}

function r32Side(slotKey: string, teamId = ""): KnockoutPickSlotDraft {
  return slot({
    rowKey: `round_of_32|${slotKey}`,
    predictionKind: "round_of_32",
    slotKey,
    teamId,
  });
}

function tournamentMatch(
  partial: Partial<TournamentMatchPublicRow> &
    Pick<TournamentMatchPublicRow, "match_code" | "stage_code">,
): TournamentMatchPublicRow {
  return {
    match_id: partial.match_code,
    edition_id: "ed",
    edition_code: "wc2026",
    match_code: partial.match_code,
    stage_code: partial.stage_code,
    stage_label: partial.stage_code,
    stage_sort_order: 2,
    group_code: null,
    round_index: 0,
    kickoff_at: partial.kickoff_at ?? "2026-07-01T19:00:00Z",
    status: partial.status ?? "scheduled",
    home_goals: null,
    away_goals: null,
    home_penalties: null,
    away_penalties: null,
    home_team_name: partial.home_team_name ?? "Home",
    home_country_code: partial.home_country_code ?? "GER",
    away_team_name: partial.away_team_name ?? "Away",
    away_country_code: partial.away_country_code ?? "FRA",
    winner_team_name: null,
    winner_country_code: null,
  };
}

function r32Fixtures(): TournamentMatchPublicRow[] {
  return Array.from({ length: 16 }, (_, i) =>
    tournamentMatch({
      match_code: `M${73 + i}`,
      stage_code: "round_of_32",
      home_country_code: "GER",
      away_country_code: "FRA",
    }),
  );
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

function fullMatchBasedKnockoutSlots(): KnockoutPickSlotDraft[] {
  return [
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
    qfSlot("1", "team-ger"),
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
    finSlot("2", "team-bra"),
    champSlot("team-ger"),
    ...Array.from({ length: 4 }, (_, i) => r32Side(String(i + 1), "")),
  ];
}

function progressOptions(overrides?: {
  knockoutBracketPicksUnlocked?: boolean;
  tournamentMatches?: TournamentMatchPublicRow[];
}) {
  return {
    knockoutBracketPicksUnlocked: true,
    officialRoundOf32Complete: true,
    teams,
    tournamentMatches: overrides?.tournamentMatches ?? r32Fixtures(),
    ...overrides,
  };
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
  assert.strictEqual(summary.overallHeadline, "Pre-knockout picks complete");
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

// Full match-based knockout complete — legacy R32 side slots empty
{
  const slots = [
    ...filledGroupSlots(),
    ...eightThirdPlace(),
    ...fullMatchBasedKnockoutSlots(),
  ];
  const summary = buildPicksProgressSummary(slots, {
    knockoutBracketPicksUnlocked: true,
    officialRoundOf32Complete: true,
    teams,
  });
  const knockout = summary.sections.find((s) => s.id === "knockout");
  assert.strictEqual(knockout?.status, "complete");
  assert.strictEqual(knockout?.missing, 0);
  assert.strictEqual(summary.picksComplete, true);
  assert.strictEqual(summary.actionableMissingCount, 0);
  assert.strictEqual(summary.nextSection?.ctaLabel, "Review picks");
  assert.strictEqual(summary.nextSection?.intent, "review");
}

// Missing 4 quarter-final picks — summary and CTA align
{
  const slots = [
    ...filledGroupSlots(),
    ...eightThirdPlace(),
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
    qfSlot("1", "team-ger"),
    qfSlot("2", "team-can"),
    qfSlot("3", "team-bra"),
    qfSlot("4", "team-ned"),
    qfSlot("5", "team-fra"),
    qfSlot("6", "team-ger"),
    qfSlot("7", "team-ned"),
    qfSlot("8", "team-can"),
    sfSlot("1", ""),
    sfSlot("2", ""),
    sfSlot("3", ""),
    sfSlot("4", ""),
    finSlot("1", ""),
    finSlot("2", ""),
    champSlot(""),
  ];
  const summary = buildPicksProgressSummary(slots, {
    knockoutBracketPicksUnlocked: true,
    officialRoundOf32Complete: true,
    teams,
  });
  const knockout = summary.sections.find((s) => s.id === "knockout");
  assert.strictEqual(knockout?.status, "partial");
  assert.ok((knockout?.missing ?? 0) >= 4);
  assert.ok((summary.actionableMissingCount ?? 0) >= 4);
  assert.strictEqual(summary.nextSection?.wizardBracketKind, "quarterfinalist");
  assert.ok(summary.nextSection?.ctaLabel.includes("quarter-finals"));
}

// Legacy R32 side slots empty do not count when match winners are filled
{
  const slots = fullMatchBasedKnockoutSlots();
  const withoutTeams = buildPicksProgressSummary(slots, {
    knockoutBracketPicksUnlocked: true,
  });
  assert.strictEqual(
    withoutTeams.sections.find((s) => s.id === "knockout")?.missing,
    4,
    "legacy path still counts empty round_of_32 side slots",
  );
  const withTeams = buildPicksProgressSummary(slots, {
    knockoutBracketPicksUnlocked: true,
    officialRoundOf32Complete: true,
    teams,
  });
  assert.strictEqual(
    withTeams.sections.find((s) => s.id === "knockout")?.missing,
    0,
  );
}

// Gradual partial R32 — only pickable matchups count
{
  const fixtures = [
    tournamentMatch({
      match_code: "M73",
      stage_code: "round_of_32",
      home_country_code: "GER",
      away_country_code: "FRA",
    }),
  ];
  const slots = [
    ...filledGroupSlots(),
    ...eightThirdPlace(),
    r16Slot("1", ""),
    ...Array.from({ length: 15 }, (_, i) => r16Slot(String(i + 2), "")),
  ];
  const summary = buildPicksProgressSummary(slots, {
    knockoutBracketPicksUnlocked: false,
    officialRoundOf32Complete: false,
    teams,
    tournamentMatches: fixtures,
  });
  assert.strictEqual(summary.waitingForR32, true);
  assert.strictEqual(summary.picksComplete, false);
  const knockout = summary.sections.find((s) => s.id === "knockout");
  assert.strictEqual(knockout?.status, "not_started");
  assert.strictEqual(knockout?.filled, 0);
  assert.strictEqual(knockout?.total, 1);
  assert.strictEqual(summary.actionableMissingCount, 1);
}

// Caught-up headline when nothing actionable remains (pre-knockout locked)
{
  const slots = [
    ...filledGroupSlots().map((s) => ({ ...s, teamId: "" })),
    ...eightThirdPlace(),
  ];
  const summary = buildPicksProgressSummary(slots, {
    knockoutBracketPicksUnlocked: false,
    preKnockoutLocked: true,
  });
  assert.strictEqual(summary.actionableMissingCount, 0);
  assert.strictEqual(
    summary.overallHeadline,
    "You're caught up — 0 picks left",
  );
  assert.ok(
    summary.overallDetail?.includes(
      "More picks may unlock as future matchups become available.",
    ),
  );
}

console.log("picksProgressSummary.selftest: ok");
