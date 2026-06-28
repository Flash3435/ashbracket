import assert from "node:assert";
import type { Team } from "../../src/types/domain";
import type { KnockoutPickSlotDraft } from "../../types/adminKnockoutPicks";
import type { TournamentMatchPublicRow } from "../../types/tournamentPublic";
import { applyGradualKnockoutPickSaveGuards } from "../predictions/validateGradualKnockoutPickSave";
import {
  allowedTeamsForGradualR32Match,
  buildGradualR32MatchPickRows,
  buildGradualR32SavePayload,
  getGradualKnockoutSelectionState,
  r32SlotRowDisplay,
  shouldUseR32MatchRowUi,
} from "./gradualKnockoutUnlock";

function match(
  partial: Partial<TournamentMatchPublicRow> &
    Pick<TournamentMatchPublicRow, "match_code" | "stage_code">,
): TournamentMatchPublicRow {
  return {
    match_id: partial.match_id ?? partial.match_code,
    edition_id: "ed",
    edition_code: "wc2026",
    match_code: partial.match_code,
    stage_code: partial.stage_code,
    stage_label: partial.stage_code,
    stage_sort_order: partial.stage_sort_order ?? 2,
    group_code: partial.group_code ?? null,
    round_index: partial.round_index ?? 0,
    kickoff_at: partial.kickoff_at ?? "2026-06-28T19:00:00Z",
    status: partial.status ?? "scheduled",
    home_goals: null,
    away_goals: null,
    home_penalties: null,
    away_penalties: null,
    home_team_name: partial.home_team_name ?? "Home",
    home_country_code: partial.home_country_code ?? "USA",
    away_team_name: partial.away_team_name ?? "Away",
    away_country_code: partial.away_country_code ?? "MEX",
    winner_team_name: null,
    winner_country_code: null,
  };
}

const teams: Team[] = [
  {
    id: "team-usa",
    name: "United States",
    countryCode: "USA",
    fifaCode: "USA",
    fifaRank: 12,
    fifaRankAsOf: null,
    createdAt: "",
    updatedAt: "",
  },
  {
    id: "team-mex",
    name: "Mexico",
    countryCode: "MEX",
    fifaCode: "MEX",
    fifaRank: 15,
    fifaRankAsOf: null,
    createdAt: "",
    updatedAt: "",
  },
];

function r32SlotDraft(slotKey: string): KnockoutPickSlotDraft {
  return {
    rowKey: `round_of_32|${slotKey}`,
    predictionKind: "round_of_32",
    tournamentStageId: "r32",
    slotKey,
    groupCode: null,
    bonusKey: null,
    teamId: "",
    sectionLabel: "Round of 32",
    slotLabel: `Slot ${slotKey}`,
  };
}

function r16SlotDraft(slotKey: string): KnockoutPickSlotDraft {
  return {
    rowKey: `round_of_16|${slotKey}`,
    predictionKind: "round_of_16",
    tournamentStageId: "r16",
    slotKey,
    groupCode: null,
    bonusKey: null,
    teamId: "",
    sectionLabel: "Round of 16",
    slotLabel: `R16 ${slotKey}`,
  };
}

const r32Fixtures = [
  match({ match_code: "M73", stage_code: "round_of_32" }),
  match({ match_code: "M74", stage_code: "round_of_32" }),
];

// Admin bug: missing fixtures + default full-unlock → legacy 32 slot UI
{
  assert.strictEqual(
    shouldUseR32MatchRowUi({
      tournamentMatches: null,
      knockoutBracketPicksUnlocked: true,
      gradualPickableCount: 0,
    }),
    false,
    "admin without tournamentMatches should not use match-row UI",
  );
}

// Admin fix: same unlock flag with fixtures → 16 match rows
{
  assert.strictEqual(
    shouldUseR32MatchRowUi({
      tournamentMatches: r32Fixtures,
      knockoutBracketPicksUnlocked: true,
      gradualPickableCount: 0,
    }),
    true,
    "admin with tournamentMatches should use match-row UI even when R32 is fully official",
  );
}

// Regression: legacy slot UI duplicates M73/M74 headings (two slots per match)
{
  const state = getGradualKnockoutSelectionState({
    matches: r32Fixtures,
    teams,
    fullRoundOf32Official: true,
  });
  const legacySlots = Array.from({ length: 32 }, (_, i) =>
    r32SlotDraft(String(i + 1)),
  );
  const legacyHeadings = legacySlots
    .map(
      (s) =>
        r32SlotRowDisplay(s.slotKey, state, teams, true, s.slotLabel)?.heading,
    )
    .filter(Boolean);
  assert.strictEqual(
    legacyHeadings.filter((h) => h === "M73 · Round of 32").length,
    2,
    "legacy slot UI shows M73 twice",
  );
  assert.strictEqual(
    legacyHeadings.filter((h) => h === "M74 · Round of 32").length,
    2,
    "legacy slot UI shows M74 twice",
  );
}

// Match-row UI: one heading per FIFA match code
{
  const state = getGradualKnockoutSelectionState({
    matches: r32Fixtures,
    teams,
    fullRoundOf32Official: true,
  });
  const slots = Array.from({ length: 16 }, (_, i) =>
    r16SlotDraft(String(i + 1)),
  );
  const uiRows = buildGradualR32MatchPickRows({
    slots,
    state,
    teams,
    fullRoundOf32Official: true,
  });
  assert.strictEqual(uiRows.length, 16, "admin/other-participant edit uses 16 match rows");
  const headings = uiRows.map((r) => r.display.heading);
  assert.strictEqual(headings.filter((h) => h === "M73 · Round of 32").length, 1);
  assert.strictEqual(headings.filter((h) => h === "M74 · Round of 32").length, 1);
}

// Full-bracket match rows expose both teams for winner pick
{
  const nowMs = new Date("2026-06-28T12:00:00Z").getTime();
  const state = getGradualKnockoutSelectionState({
    matches: r32Fixtures,
    teams,
    nowMs,
    fullRoundOf32Official: true,
  });
  const allowed = allowedTeamsForGradualR32Match(0, state, teams, true);
  assert.strictEqual(allowed.length, 2);
  assert.ok(allowed.some((t) => t.id === "team-usa"));
  assert.ok(allowed.some((t) => t.id === "team-mex"));
}

// Participant gradual save applies guards; admin save path applies payload as-is
{
  const nowMs = new Date("2026-06-28T12:00:00Z").getTime();
  const state = getGradualKnockoutSelectionState({
    matches: [r32Fixtures[0]!],
    teams,
    nowMs,
    fullRoundOf32Official: false,
  });
  const slotsWithPick = [
    { ...r16SlotDraft("1"), teamId: "team-usa" },
    ...Array.from({ length: 15 }, (_, i) => r16SlotDraft(String(i + 2))),
  ];
  const gradualPayload = buildGradualR32SavePayload({
    slots: slotsWithPick,
    state,
  });
  assert.ok(
    gradualPayload.some(
      (s) => s.predictionKind === "round_of_16" && s.slotKey === "1",
    ),
    "gradual save payload includes R32 winner on round_of_16 slot",
  );
  const guarded = applyGradualKnockoutPickSaveGuards({
    incoming: gradualPayload,
    existing: [],
    teams,
    matches: [r32Fixtures[0]!],
    fullRoundOf32Official: false,
    nowMs,
  });
  assert.strictEqual(guarded.error, null, "participant save path validates gradual R32 picks");
  assert.strictEqual(
    guarded.slots.find((s) => s.predictionKind === "round_of_16" && s.slotKey === "1")
      ?.teamId,
    "team-usa",
  );
}

console.log("adminKnockoutEditRows.selftest.ts: ok");
