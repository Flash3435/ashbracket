/**
 * Live scores preview includes R16 matches beyond M88.
 * Run: npx tsx lib/tournament/liveScores/laterKnockoutLiveScores.selftest.ts
 */
import assert from "node:assert/strict";
import { WC2026_OFFICIAL_KNOCKOUT_MATCH_COUNT } from "../../bracket/wc2026LaterKnockout";
import {
  buildLiveScoresSyncDiagnostics,
  mappedProviderFixtureIdsFromPreviewRows,
} from "./buildLiveScoresSyncDiagnostics";
import {
  buildScoreChangePreview,
  patchesFromPreviewRows,
} from "./matchMapping";
import {
  computeApplyPlanSignature,
  evaluateApplyPlanFreshness,
  extractApplyPlanOperations,
} from "./applyPlanSignature";
import type { ProviderFixtureScore, TournamentMatchForLiveScores } from "./types";

function matchRow(
  overrides: Partial<TournamentMatchForLiveScores> & Pick<TournamentMatchForLiveScores, "id" | "matchCode">,
): TournamentMatchForLiveScores {
  return {
    stageCode: "group",
    kickoffAt: "2026-06-11T20:00:00.000Z",
    providerFixtureId: null,
    homeTeamId: "home-1",
    awayTeamId: "away-1",
    homeTeamName: "Mexico",
    awayTeamName: "South Africa",
    homeFifaCode: "MEX",
    awayFifaCode: "RSA",
    homeGoals: null,
    awayGoals: null,
    homePenalties: null,
    awayPenalties: null,
    status: "scheduled",
    syncLocked: false,
    ...overrides,
  };
}

function buildGroupShells(): TournamentMatchForLiveScores[] {
  const rows: TournamentMatchForLiveScores[] = [];
  for (let g = 0; g < 12; g += 1) {
    const letter = String.fromCharCode(65 + g);
    for (let i = 1; i <= 6; i += 1) {
      rows.push(
        matchRow({
          id: `g-${letter}-${i}`,
          matchCode: `WC2026-G-${letter}-${String(i).padStart(2, "0")}`,
          stageCode: "group",
          homeGoals: 1,
          awayGoals: 0,
          status: "finished",
          providerFixtureId: `prov-g-${letter}-${i}`,
        }),
      );
    }
  }
  return rows;
}

function buildR32Shells(): TournamentMatchForLiveScores[] {
  return Array.from({ length: 16 }, (_, i) => {
    const matchNo = 73 + i;
    return matchRow({
      id: `m-${matchNo}`,
      matchCode: `M${matchNo}`,
      stageCode: "round_of_32",
      kickoffAt: "2026-06-28T19:00:00.000Z",
      homeGoals: 1,
      awayGoals: 0,
      status: "finished",
      providerFixtureId: `prov-r32-${matchNo}`,
    });
  });
}

function buildLaterKnockoutShells(): TournamentMatchForLiveScores[] {
  const defs: Array<{
    matchNo: number;
    stageCode: TournamentMatchForLiveScores["stageCode"];
    kickoffAt: string;
    home: { id: string; name: string; code: string };
    away: { id: string; name: string; code: string };
    dbScore?: { home: number; away: number };
    providerFixtureId?: string | null;
  }> = [
    {
      matchNo: 89,
      stageCode: "round_of_16",
      kickoffAt: "2026-07-04T21:00:00.000Z",
      home: { id: "team-par", name: "Paraguay", code: "PAR" },
      away: { id: "team-fra", name: "France", code: "FRA" },
    },
    {
      matchNo: 90,
      stageCode: "round_of_16",
      kickoffAt: "2026-07-04T17:00:00.000Z",
      home: { id: "team-can", name: "Canada", code: "CAN" },
      away: { id: "team-mar", name: "Morocco", code: "MAR" },
      dbScore: { home: 0, away: 0 },
      providerFixtureId: null,
    },
  ];

  for (let matchNo = 91; matchNo <= 104; matchNo += 1) {
    defs.push({
      matchNo,
      stageCode:
        matchNo <= 96
          ? "round_of_16"
          : matchNo <= 100
            ? "quarterfinal"
            : matchNo <= 102
              ? "semifinal"
              : matchNo === 103
                ? "third_place"
                : "final",
      kickoffAt: "2026-07-10T20:00:00.000Z",
      home: { id: `team-h-${matchNo}`, name: `Home ${matchNo}`, code: "AAA" },
      away: { id: `team-a-${matchNo}`, name: `Away ${matchNo}`, code: "BBB" },
    });
  }

  return defs.map((def) =>
    matchRow({
      id: `m-${def.matchNo}`,
      matchCode: `M${def.matchNo}`,
      stageCode: def.stageCode,
      kickoffAt: def.kickoffAt,
      homeTeamId: def.home.id,
      awayTeamId: def.away.id,
      homeTeamName: def.home.name,
      awayTeamName: def.away.name,
      homeFifaCode: def.home.code,
      awayFifaCode: def.away.code,
      homeGoals: def.dbScore?.home ?? null,
      awayGoals: def.dbScore?.away ?? null,
      status: def.dbScore ? "finished" : "scheduled",
      providerFixtureId: def.providerFixtureId ?? null,
    }),
  );
}

const eightyEightMatches = [...buildGroupShells(), ...buildR32Shells()];
const fullMatches = [...eightyEightMatches, ...buildLaterKnockoutShells()];

assert.equal(eightyEightMatches.length, 88);
assert.equal(fullMatches.length, WC2026_OFFICIAL_KNOCKOUT_MATCH_COUNT);

const canadaMoroccoFixture: ProviderFixtureScore = {
  providerFixtureId: "prov-m90-can-mar",
  kickoffAt: "2026-07-04T17:00:00.000Z",
  homeTeamName: "Canada",
  awayTeamName: "Morocco",
  homeFifaCode: "CAN",
  awayFifaCode: "MAR",
  homeGoals: 2,
  awayGoals: 1,
  homePenalties: null,
  awayPenalties: null,
  status: "finished",
};

const preview88 = buildScoreChangePreview({
  provider: "mock",
  providerConfigured: true,
  configWarning: null,
  fetchedAt: "2026-07-04T22:00:00.000Z",
  matches: eightyEightMatches,
  fixtures: [canadaMoroccoFixture],
});

assert.equal(preview88.summary.matchesChecked, 88);
assert.equal(
  preview88.rows.some((r) => r.matchCode === "M90"),
  false,
  "M90 must not appear when later knockout shells are missing",
);
assert.equal(preview88.summary.unmappedProviderFixtures, 1);

const preview104 = buildScoreChangePreview({
  provider: "mock",
  providerConfigured: true,
  configWarning: null,
  fetchedAt: "2026-07-04T22:00:00.000Z",
  matches: fullMatches,
  fixtures: [canadaMoroccoFixture],
});

assert.equal(preview104.summary.matchesChecked, 104);
assert(preview104.summary.matchesChecked > 88);

const m90 = preview104.rows.find((r) => r.matchCode === "M90")!;
assert.ok(m90, "Canada vs Morocco (M90) appears in preview");
assert.equal(m90.homeTeamName, "Canada");
assert.equal(m90.awayTeamName, "Morocco");
assert.equal(m90.willUpdate, true, "finished provider score should plan M90 update");
assert.equal(m90.fetchedHomeGoals, 2);
assert.equal(m90.fetchedAwayGoals, 1);

const patches = patchesFromPreviewRows(preview104.rows);
assert.ok(patches.some((p) => p.matchCode === "M90"));
assert.equal(patches.find((p) => p.matchCode === "M90")?.providerFixtureId, "prov-m90-can-mar");

const diagnostics = buildLiveScoresSyncDiagnostics({
  matches: fullMatches,
  preview: preview104,
  fixtures: [canadaMoroccoFixture],
  mappedProviderFixtureIds: mappedProviderFixtureIdsFromPreviewRows(preview104.rows),
});

assert.equal(diagnostics.totalDbMatchesEligible, 104);
assert.equal(diagnostics.matchesCheckedInPreview, 104);
assert.ok(
  diagnostics.knockoutMissingProviderFixtureId.some((r) => r.matchCode === "M89"),
);
assert.equal(diagnostics.unmappedProviderFixtures.length, 0);

// Material-intent stale-plan guard: submitted M90 plan stays valid when preview is rebuilt.
const submittedOps = extractApplyPlanOperations(preview104.rows);
const rebuilt = buildScoreChangePreview({
  provider: "mock",
  providerConfigured: true,
  configWarning: null,
  fetchedAt: "2026-07-04T22:00:01.000Z",
  matches: fullMatches,
  fixtures: [canadaMoroccoFixture],
});
const rebuiltOps = extractApplyPlanOperations(rebuilt.rows);
const freshness = evaluateApplyPlanFreshness(submittedOps, rebuiltOps, rebuilt.rows);
assert.equal(freshness.materialIntentMatch, true);
assert.equal(
  computeApplyPlanSignature(preview104.rows),
  computeApplyPlanSignature(rebuilt.rows),
);

console.log("laterKnockoutLiveScores.selftest.ts: all assertions passed");
