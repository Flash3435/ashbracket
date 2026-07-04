import assert from "node:assert/strict";
import type { Team } from "../../src/types/domain";
import type { KnockoutPickSlotDraft } from "../../types/adminKnockoutPicks";
import type { TournamentMatchPublicRow } from "../../types/tournamentPublic";
import { buildDashboardMissingPicksModel } from "../dashboard/buildDashboardMissingPicks";
import { hasEditableKnockoutPicks, getGradualKnockoutSelectionState } from "./gradualKnockoutUnlock";
import {
  buildKnockoutMatchPickRows,
  validatedKnockoutMatchWinner,
} from "./knockoutMatchPickRows";
import {
  buildParticipantKnockoutPicksHref,
  buildParticipantPicksPagePresentation,
  participantKnockoutPicksEditable,
  resolveInitialWizardBracketKind,
  targetKnockoutWizardStepForParticipant,
} from "./participantKnockoutEditMode";

const nowMs = new Date("2026-07-05T12:00:00Z").getTime();

const teams: Team[] = [
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
    id: "team-mar",
    name: "Morocco",
    countryCode: "MAR",
    fifaCode: "MAR",
    fifaRank: 14,
    fifaRankAsOf: null,
    createdAt: "",
    updatedAt: "",
  },
  {
    id: "team-esp",
    name: "Spain",
    countryCode: "ESP",
    fifaCode: "ESP",
    fifaRank: 8,
    fifaRankAsOf: null,
    createdAt: "",
    updatedAt: "",
  },
  {
    id: "team-us",
    name: "United States",
    countryCode: "USA",
    fifaCode: "USA",
    fifaRank: 15,
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
    id: "team-eng",
    name: "England",
    countryCode: "ENG",
    fifaCode: "ENG",
    fifaRank: 4,
    fifaRankAsOf: null,
    createdAt: "",
    updatedAt: "",
  },
  {
    id: "team-arg",
    name: "Argentina",
    countryCode: "ARG",
    fifaCode: "ARG",
    fifaRank: 1,
    fifaRankAsOf: null,
    createdAt: "",
    updatedAt: "",
  },
  {
    id: "team-col",
    name: "Colombia",
    countryCode: "COL",
    fifaCode: "COL",
    fifaRank: 12,
    fifaRankAsOf: null,
    createdAt: "",
    updatedAt: "",
  },
];

function match(
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
    kickoff_at: partial.kickoff_at ?? "2026-07-01T18:00:00Z",
    status: partial.status ?? "finished",
    home_goals: partial.home_goals ?? 1,
    away_goals: partial.away_goals ?? 0,
    home_penalties: null,
    away_penalties: null,
    home_team_name: partial.home_team_name ?? "Home",
    home_country_code: partial.home_country_code ?? null,
    away_team_name: partial.away_team_name ?? "Away",
    away_country_code: partial.away_country_code ?? null,
    winner_team_name: partial.winner_team_name ?? null,
    winner_country_code: partial.winner_country_code ?? null,
  };
}

function r16Slot(slotKey: string, teamId = ""): KnockoutPickSlotDraft {
  return {
    rowKey: `round_of_16|${slotKey}`,
    sectionLabel: "",
    slotLabel: `R16 ${slotKey}`,
    predictionKind: "round_of_16",
    tournamentStageId: "stage-r16",
    groupCode: null,
    slotKey,
    bonusKey: null,
    teamId,
  };
}

function qfSlot(slotKey: string, teamId = ""): KnockoutPickSlotDraft {
  return {
    rowKey: `quarterfinalist|${slotKey}`,
    sectionLabel: "",
    slotLabel: `QF ${slotKey}`,
    predictionKind: "quarterfinalist",
    tournamentStageId: "stage-r16",
    groupCode: null,
    slotKey,
    bonusKey: null,
    teamId,
  };
}

const r32Pairings: Array<[string, string, string, string]> = [
  ["FRA", "MAR", "France", "Morocco"],
  ["ESP", "USA", "Spain", "United States"],
  ["BRA", "ENG", "Brazil", "England"],
  ["ARG", "COL", "Argentina", "Colombia"],
];

function allGradualR32ConfirmedMatches(): TournamentMatchPublicRow[] {
  const r32Matches = Array.from({ length: 16 }, (_, index) => {
    const fifaNo = 73 + index;
    const pairing = r32Pairings[index % r32Pairings.length]!;
    return match({
      match_code: `M${fifaNo}`,
      stage_code: "round_of_32",
      kickoff_at: "2026-07-01T18:00:00Z",
      status: "finished",
      home_country_code: pairing[0],
      away_country_code: pairing[1],
      home_team_name: pairing[2],
      away_team_name: pairing[3],
      winner_country_code: pairing[0],
    });
  });
  const r16Matches = Array.from({ length: 8 }, (_, index) => {
    const pairing = r32Pairings[index % r32Pairings.length]!;
    return match({
      match_code: `M${89 + index}`,
      stage_code: "round_of_16",
      kickoff_at: "2026-07-10T18:00:00Z",
      status: "scheduled",
      home_country_code: pairing[0],
      away_country_code: pairing[1],
      home_team_name: pairing[2],
      away_team_name: pairing[3],
      winner_country_code: null,
    });
  });
  return [...r32Matches, ...r16Matches];
}

function gradualConfirmedSlots(): KnockoutPickSlotDraft[] {
  const slots: KnockoutPickSlotDraft[] = [];
  for (let i = 0; i < 16; i += 1) {
    const pairing = r32Pairings[i % r32Pairings.length]!;
    const winnerTeamId = teams.find((t) => t.countryCode === pairing[0])!.id;
    slots.push(r16Slot(String(i + 1), winnerTeamId));
  }
  return slots;
}

const gradualConfirmedContext = {
  slots: gradualConfirmedSlots(),
  teams,
  tournamentMatches: allGradualR32ConfirmedMatches(),
  officialRoundOf32Complete: false,
  nowMs,
};

// Global unlock false while participant still has actionable missing R16 picks
{
  const gradual = getGradualKnockoutSelectionState({
    matches: gradualConfirmedContext.tournamentMatches,
    teams,
    nowMs,
    fullRoundOf32Official: false,
  });
  const globalEditable = hasEditableKnockoutPicks({
    gradual,
    fullRoundOf32Official: false,
  });
  assert.equal(globalEditable, false);
  assert.equal(
    participantKnockoutPicksEditable(gradualConfirmedContext),
    true,
    "participant-level editability follows canonical missing-pick rows",
  );
}

// Dashboard CTA deep-links to Round of 16 when missing editable R16 picks
{
  const model = buildDashboardMissingPicksModel(gradualConfirmedContext);
  assert.ok(model.actionableCount > 0, "dashboard should count missing R16 picks");
  assert.equal(model.ctaLabel, "Complete picks");
  assert.match(model.detail, /before kickoff/);

  const href = buildParticipantKnockoutPicksHref("participant-1", gradualConfirmedContext);
  assert.match(href, /participant=participant-1/);
  assert.match(href, /step=round_of_16/);

  assert.equal(
    targetKnockoutWizardStepForParticipant(gradualConfirmedContext, "round_of_16"),
    "round_of_16",
  );

  assert.equal(
    resolveInitialWizardBracketKind(gradualConfirmedContext, "round_of_16"),
    "round_of_16",
    "deep-link step param resolves in read-only browsing",
  );
}

// Locked pool with actionable missing picks is not globally read-only
{
  const presentation = buildParticipantPicksPagePresentation({
    poolLocked: true,
    progressContext: gradualConfirmedContext,
  });
  assert.equal(presentation.picksReadOnly, false);
  assert.equal(presentation.title, "Complete your picks");
  assert.match(
    presentation.banner ?? "",
    /Round of 16 picks are still open until kickoff/,
  );
  assert.equal(presentation.preBracketSelectionsLocked, true);
}

function sfSlot(slotKey: string, teamId = ""): KnockoutPickSlotDraft {
  return {
    rowKey: `semifinalist|${slotKey}`,
    sectionLabel: "",
    slotLabel: `SF ${slotKey}`,
    predictionKind: "semifinalist",
    tournamentStageId: "stage-r16",
    groupCode: null,
    slotKey,
    bonusKey: null,
    teamId,
  };
}

function validLaterRoundPickSlots(
  baseSlots: KnockoutPickSlotDraft[],
  tournamentMatches: TournamentMatchPublicRow[],
  gradual: ReturnType<typeof getGradualKnockoutSelectionState>,
): KnockoutPickSlotDraft[] {
  let slots = [...baseSlots];
  for (const bracketKind of [
    "round_of_16",
    "quarterfinalist",
    "semifinalist",
    "finalist",
  ] as const) {
    const rows = buildKnockoutMatchPickRows({
      bracketKind,
      slots,
      teams,
      tournamentMatches,
      gradual,
      knockoutBracketPicksUnlocked: false,
      nowMs,
    });
    for (const row of rows) {
      if (row.lockReason !== "pickable") continue;
      const winner = row.homeTeamId?.trim();
      if (!winner) continue;
      const kind = row.savePredictionKind;
      const slotKey = row.saveSlotKey;
      if (!slotKey && kind !== "champion") continue;
      const rowKey =
        kind === "champion" ? "champion|" : `${kind}|${slotKey}`;
      if (slots.some((s) => s.rowKey === rowKey)) {
        slots = slots.map((s) =>
          s.rowKey === rowKey ? { ...s, teamId: winner } : s,
        );
      } else if (kind === "champion") {
        slots.push({
          rowKey: "champion|",
          sectionLabel: "",
          slotLabel: "Champion",
          predictionKind: "champion",
          tournamentStageId: "stage-r16",
          groupCode: null,
          slotKey: null,
          bonusKey: null,
          teamId: winner,
        });
      } else {
        slots.push({
          rowKey,
          sectionLabel: "",
          slotLabel: "",
          predictionKind: kind,
          tournamentStageId: "stage-r16",
          groupCode: null,
          slotKey,
          bonusKey: null,
          teamId: winner,
        });
      }
    }
  }
  return slots;
}

// No actionable missing picks → no Complete picks CTA and read-only after lock
{
  const gradual = getGradualKnockoutSelectionState({
    matches: gradualConfirmedContext.tournamentMatches,
    teams,
    nowMs,
    fullRoundOf32Official: false,
  });
  const filledSlots = validLaterRoundPickSlots(
    gradualConfirmedSlots(),
    gradualConfirmedContext.tournamentMatches,
    gradual,
  );
  const completeContext = {
    ...gradualConfirmedContext,
    slots: filledSlots,
  };
  const model = buildDashboardMissingPicksModel(completeContext);
  assert.equal(model.actionableCount, 0);
  assert.equal(model.ctaLabel, null);

  const href = buildParticipantKnockoutPicksHref("participant-1", completeContext);
  assert.doesNotMatch(href, /step=/);

  const presentation = buildParticipantPicksPagePresentation({
    poolLocked: true,
    progressContext: completeContext,
  });
  assert.equal(presentation.hasActionableMissingPicks, false);
}

// Missing R16 after kickoff is not actionable for normal users
{
  const kickedOffMatches = allGradualR32ConfirmedMatches().map((row) =>
    row.stage_code === "round_of_16"
      ? {
          ...row,
          kickoff_at: "2026-07-01T18:00:00Z",
          status: "finished" as const,
          winner_country_code: row.home_country_code,
        }
      : row,
  );
  const afterKickoffContext = {
    ...gradualConfirmedContext,
    tournamentMatches: kickedOffMatches,
    nowMs: new Date("2026-07-02T12:00:00Z").getTime(),
  };
  const model = buildDashboardMissingPicksModel(afterKickoffContext);
  assert.equal(
    model.actionableCount,
    0,
    "locked missing picks after kickoff should not invite completion",
  );
  assert.equal(participantKnockoutPicksEditable(afterKickoffContext), false);
  const presentation = buildParticipantPicksPagePresentation({
    poolLocked: true,
    progressContext: afterKickoffContext,
  });
  assert.equal(presentation.picksReadOnly, true);
}

// Saved R16 pick stays locked when feeder results are official
{
  const officialContext = {
    ...gradualConfirmedContext,
    officialRoundOf32Complete: true,
    slots: [
      ...gradualConfirmedSlots(),
      qfSlot("1", "team-fra"),
      qfSlot("2", ""),
      qfSlot("3", ""),
      qfSlot("4", ""),
    ],
  };
  const rows = buildKnockoutMatchPickRows({
    bracketKind: "round_of_16",
    slots: officialContext.slots,
    teams,
    tournamentMatches: officialContext.tournamentMatches,
    gradual: getGradualKnockoutSelectionState({
      matches: officialContext.tournamentMatches,
      teams,
      nowMs,
      fullRoundOf32Official: true,
    }),
    knockoutBracketPicksUnlocked: true,
    nowMs,
  });
  const savedM89 = rows.find((row) => row.fifaMatchNo === 89)!;
  assert.equal(savedM89.lockReason, "frozen");
  assert.equal(validatedKnockoutMatchWinner(savedM89), "team-fra");

  const missingM90 = rows.find((row) => row.fifaMatchNo === 90)!;
  assert.equal(missingM90.lockReason, "pickable");
  assert.equal(validatedKnockoutMatchWinner(missingM90), null);
}

console.log("participantKnockoutEditMode.selftest.ts: ok");
