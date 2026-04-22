/**
 * R32 / Annex C hardening tests.
 * Run: `npx tsx lib/admin/r32OfficialHardening.selftest.ts`
 * Or: `npm run test:r32-hardening`
 */
import type { Result, Team } from "../../src/types/domain";
import { wc2026ThirdComboPlacementByKey } from "../bracket/wc2026ThirdPlaceCombinations";
import { deriveParticipantBracket } from "../bracket/deriveParticipantBracket";
import { r32SlotKeysForMatchIndex } from "../bracket/wc2026RoundOf32";
import type { KnockoutPickSlotDraft } from "../../types/adminKnockoutPicks";
import {
  buildOfficialRoundOf32PreviewMatches,
  buildOfficialRoundOf32UpsertRows,
} from "./officialRoundOf32FromResults";
import { officialR32SlotMapsEqual, parseValidateAndResolveOfficialR32 } from "./officialRoundOf32Validation";
import {
  buildThirdPlaceTeamIdByGroupLetterFromTeamIds,
  resolveWc2026RoundOf32SlotTeamIds,
  thirdPlaceGroupLetterByWinnerSlot,
} from "../tournament/worldcup2026ThirdPlaceMapping";
import { WC2026_GROUP_CODES } from "../tournament/wc2026GroupCodes";

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(msg);
}

const GID = "00000000-0000-4000-8000-0000000000aa";
const RID = "00000000-0000-4000-8000-0000000000bb";

function res(
  kind: Result["kind"],
  groupCode: string | null,
  slotKey: string | null,
  teamId: string,
  stageId: string = GID,
): Result {
  return {
    id: `${kind}-${groupCode ?? ""}-${slotKey ?? ""}-${teamId}`.slice(0, 36),
    tournamentStageId: stageId,
    kind,
    teamId,
    groupCode,
    slotKey,
    valueText: null,
    resolvedAt: "2026-01-01T00:00:00.000Z",
    createdAt: "2026-01-01T00:00:00.000Z",
  };
}

function team(id: string, name: string, code: string): Team {
  return {
    id,
    name,
    countryCode: code,
    fifaCode: code,
    fifaRank: null,
    fifaRankAsOf: null,
    createdAt: "",
    updatedAt: "",
  };
}

/** Three country codes per group (winner, runner-up, third candidate). */
function officialDraw(): Record<string, string[]> {
  const m: Record<string, string[]> = {};
  for (const L of WC2026_GROUP_CODES) {
    const u = L.toUpperCase();
    m[L] = [`P${u}W`, `P${u}R`, `P${u}T`];
  }
  return m;
}

function fullGroupResults(stageId: string): Result[] {
  const out: Result[] = [];
  for (let i = 0; i < 12; i += 1) {
    const L = WC2026_GROUP_CODES[i]!.toUpperCase();
    out.push(res("group_winner", L, null, `w-${L}`, stageId));
    out.push(res("group_runner_up", L, null, `r-${L}`, stageId));
  }
  return out;
}

function eightThirds(stageId: string): Result[] {
  const letters = ["A", "B", "C", "D", "E", "F", "G", "H"] as const;
  return letters.map((L, idx) =>
    res("third_place_qualifier", null, String(idx + 1), `t-${L}`, stageId),
  );
}

// --- worldcup2026ThirdPlaceMapping ---
const placement = thirdPlaceGroupLetterByWinnerSlot(["A", "B", "C", "D", "E", "F", "G", "H"]);
// Order of slots is A,B,D,E,G,I,K,L — row ABCDEFGH maps E-slot (index 3) to group C.
assert(placement && placement.E === "C", "Annex C ABCDEFGH: winner slot E ← third from group C");

assert(
  wc2026ThirdComboPlacementByKey("ZZZZZZZZ") == null,
  "Invalid Annex key should not resolve",
);

const dupThirdBuild = buildThirdPlaceTeamIdByGroupLetterFromTeamIds(
  ["a1", "a2", "a3", "a4", "b1", "b2", "b3", "b4"],
  [
    team("a1", "A1", "PA1"),
    team("a2", "A2", "PA2"),
    team("a3", "A3", "PA3"),
    team("a4", "A4", "PA4"),
    team("b1", "B1", "PB1"),
    team("b2", "B2", "PB2"),
    team("b3", "B3", "PB3"),
    team("b4", "B4", "PB4"),
  ],
  { A: ["PA1", "PA2", "PA3", "PA4"], B: ["PB1", "PB2", "PB3", "PB4"] },
);
assert(dupThirdBuild === null, "Two third teams from same inferred group → null");

// --- officialR32SlotMapsEqual ---
assert(
  officialR32SlotMapsEqual({ "1": "a" }, { "1": "a", "2": "b" }) === false,
  "slotMapsEqual: length mismatch should be false",
);
const fullA: Record<string, string> = {};
const fullB: Record<string, string> = {};
for (let i = 1; i <= 32; i += 1) {
  const k = String(i);
  fullA[k] = "x";
  fullB[k] = i === 5 ? "y" : "x";
}
assert(!officialR32SlotMapsEqual(fullA, fullB), "slotMapsEqual: one slot differs");

// --- parseValidateAndResolveOfficialR32 ---
const teamsFull: Team[] = WC2026_GROUP_CODES.flatMap((L) => {
  const u = L.toUpperCase();
  return [
    team(`w-${u}`, `W${u}`, `P${u}W`),
    team(`r-${u}`, `R${u}`, `P${u}R`),
    team(`t-${u}`, `T${u}`, `P${u}T`),
  ];
});
const drawFull = officialDraw();

const good = parseValidateAndResolveOfficialR32({
  results: [...fullGroupResults(GID), ...eightThirds(RID)],
  groupStageId: GID,
  roundOf32StageId: RID,
  teams: teamsFull,
  groupTeamCountryCodesByLetter: drawFull,
});
assert(good.ok, `valid full scenario: ${good.ok ? "" : (good as { error: string }).error}`);

const missWinner = fullGroupResults(GID).filter(
  (r) => !(r.kind === "group_winner" && r.groupCode === "L"),
);
const missRun = fullGroupResults(GID).filter(
  (r) => !(r.kind === "group_runner_up" && r.groupCode === "K"),
);

const v1 = parseValidateAndResolveOfficialR32({
  results: [...missWinner, ...eightThirds(RID)],
  groupStageId: GID,
  roundOf32StageId: RID,
  teams: teamsFull,
  groupTeamCountryCodesByLetter: drawFull,
});
assert(!v1.ok && v1.error.includes("L"), "missing group winner L");

const v2 = parseValidateAndResolveOfficialR32({
  results: [...missRun, ...eightThirds(RID)],
  groupStageId: GID,
  roundOf32StageId: RID,
  teams: teamsFull,
  groupTeamCountryCodesByLetter: drawFull,
});
assert(!v2.ok && v2.error.includes("K"), "missing runner-up K");

const v3 = parseValidateAndResolveOfficialR32({
  results: [...fullGroupResults(GID), ...eightThirds(RID).slice(0, 5)],
  groupStageId: GID,
  roundOf32StageId: RID,
  teams: teamsFull,
  groupTeamCountryCodesByLetter: drawFull,
});
assert(!v3.ok && v3.error.includes("8"), "fewer than 8 third advancers");

const dupTop24 = [...fullGroupResults(GID)];
dupTop24.push(
  res("group_winner", "A", null, "w-B", GID), // conflict: second winner row for A
);
const v4 = parseValidateAndResolveOfficialR32({
  results: [...dupTop24, ...eightThirds(RID)],
  groupStageId: GID,
  roundOf32StageId: RID,
  teams: teamsFull,
  groupTeamCountryCodesByLetter: drawFull,
});
assert(!v4.ok && v4.error.toLowerCase().includes("conflict"), "conflicting group winner rows");

const dupThirdRows = [
  ...fullGroupResults(GID),
  res("third_place_qualifier", null, "1", "t-A", RID),
  res("third_place_qualifier", null, "2", "t-A", RID),
];
const v5 = parseValidateAndResolveOfficialR32({
  results: dupThirdRows,
  groupStageId: GID,
  roundOf32StageId: RID,
  teams: teamsFull,
  groupTeamCountryCodesByLetter: drawFull,
});
assert(!v5.ok && v5.error.toLowerCase().includes("duplicate"), "duplicate third team id");

const thirdOverlap = [
  ...fullGroupResults(GID),
  ...["A", "B", "C", "D", "E", "F", "G", "H"].map((L, idx) =>
    res("third_place_qualifier", null, String(idx + 1), `w-${L}`, RID),
  ),
];
const v6 = parseValidateAndResolveOfficialR32({
  results: thirdOverlap,
  groupStageId: GID,
  roundOf32StageId: RID,
  teams: teamsFull,
  groupTeamCountryCodesByLetter: drawFull,
});
assert(!v6.ok && v6.error.toLowerCase().includes("third"), "third advancer overlaps top two");

const dupAcrossTopTwo = fullGroupResults(GID).map((r) =>
  r.kind === "group_winner" && (r.groupCode ?? "").toUpperCase() === "B"
    ? { ...r, teamId: "w-A" }
    : r,
);
const vDup24 = parseValidateAndResolveOfficialR32({
  results: [...dupAcrossTopTwo, ...eightThirds(RID)],
  groupStageId: GID,
  roundOf32StageId: RID,
  teams: teamsFull,
  groupTeamCountryCodesByLetter: drawFull,
});
assert(
  !vDup24.ok && vDup24.error.toLowerCase().includes("24"),
  "same team twice among 12 winners + 12 runners should fail",
);

// --- resolveWc2026RoundOf32SlotTeamIds missing winner ---
const partialGw: Record<string, string> = {};
const partialGr: Record<string, string> = {};
for (const L of WC2026_GROUP_CODES) {
  const u = L.toUpperCase();
  partialGw[u] = `w-${u}`;
  partialGr[u] = `r-${u}`;
}
delete partialGw.L;
const badResolve = resolveWc2026RoundOf32SlotTeamIds({
  groupWinnerTeamIdByLetter: partialGw,
  groupRunnerUpTeamIdByLetter: partialGr,
  thirdPlaceTeamIdByGroupLetter: {
    A: "tA",
    B: "tB",
    C: "tC",
    D: "tD",
    E: "tE",
    F: "tF",
    G: "tG",
    H: "tH",
  },
});
assert(!badResolve.ok, "resolver should fail with incomplete group winners");

// --- officialRoundOf32FromResults ---
const built = buildOfficialRoundOf32UpsertRows({
  roundOf32StageId: RID,
  groupStageId: GID,
  results: [...fullGroupResults(GID), ...eightThirds(RID)],
  teams: teamsFull,
  groupTeamCountryCodesByLetter: drawFull,
});
assert(built.ok && built.rows.length === 32, "32 upsert rows");

if (built.ok) {
  const prev = buildOfficialRoundOf32PreviewMatches(
    Object.fromEntries(built.rows.map((row) => [row.slot_key, row.team_id])),
    teamsFull,
  );
  assert(prev.length === 16 && prev[0]!.fifaMatchNo === 73, "preview has 16 FIFA matches");
}

// --- deriveParticipantBracket: Stage 2 never fills third-route R32 side ---
function slot(
  rowKey: string,
  kind: KnockoutPickSlotDraft["predictionKind"],
  slotKey: string | null,
  teamId: string,
  groupCode: string | null = null,
): KnockoutPickSlotDraft {
  return {
    rowKey,
    sectionLabel: "",
    slotLabel: "",
    predictionKind: kind,
    tournamentStageId: "s",
    slotKey,
    groupCode,
    bonusKey: null,
    teamId,
  };
}
const thirdSlots = [1, 2, 3, 4, 5, 6, 7, 8].map((n) =>
  slot(`third|${n}`, "third_place_qualifier", String(n), `bogus-third-${n}`),
);
const grp = [
  slot("gw:E", "group_winner", null, "wE", "E"),
  slot("gr:A", "group_runner_up", null, "rA", "A"),
  slot("gr:B", "group_runner_up", null, "rB", "B"),
];
const brTeams = [
  team("wE", "E-w", "EW"),
  team("rA", "A-r", "AR"),
  team("rB", "B-r", "BR"),
  ...[1, 2, 3, 4, 5, 6, 7, 8].map((n) => team(`bogus-third-${n}`, `BT${n}`, `XX${n}`)),
];
const br = deriveParticipantBracket({
  slots: [...grp, ...thirdSlots],
  teams: brTeams,
  knockoutBracketPicksUnlocked: false,
});
const m74b = br.roundOf32[1]!;
assert(
  m74b.away.teamId === null && m74b.away.displayLabel === "3 ABCDF",
  "Stage 2 bogus third picks must not appear on third-route R32 side",
);

const sk = r32SlotKeysForMatchIndex(1);
const br2 = deriveParticipantBracket({
  slots: [
    ...grp,
    ...thirdSlots,
    slot("r32-3", "round_of_32", sk.top, "wE"),
    slot("r32-4", "round_of_32", sk.bottom, "real-third"),
  ],
  teams: [...brTeams, team("real-third", "Real", "RT")],
  knockoutBracketPicksUnlocked: true,
});
assert(
  br2.roundOf32[1]!.away.teamId === "real-third",
  "Stage 3 saved R32 must show official slot team, not Stage 2 list",
);

console.log("r32OfficialHardening selftest: ok");
