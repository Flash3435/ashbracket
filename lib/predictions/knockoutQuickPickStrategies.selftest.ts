import type { KnockoutPickSlotDraft } from "../../types/adminKnockoutPicks";
import type { Team } from "../../src/types/domain";
import {
  applyQuickPickToSlots,
  assertQuickPickGroupScheduleIntegrity,
} from "./knockoutQuickPickStrategies";
import { WC2026_GROUP_CODES } from "../tournament/wc2026GroupCodes";

function team(
  id: string,
  name: string,
  countryCode: string,
  fifaRank: number | null,
): Team {
  return {
    id,
    name,
    countryCode,
    fifaCode: null,
    fifaRank,
    fifaRankAsOf: null,
    createdAt: "",
    updatedAt: "",
  };
}

/** Minimal schedule: Group A = AAA–AAD, Group B = BBB–BBD; other letters empty. */
const groupMap: Record<string, string[]> = {
  A: ["AAA", "AAB", "AAC", "AAD"],
  B: ["BBB", "BBC", "BBD", "BBE"],
};

const teams: Team[] = [
  team("a1", "A1", "AAA", 50),
  team("a2", "A2", "AAB", 40),
  team("a3", "A3", "AAC", 30),
  team("a4", "A4", "AAD", 20),
  team("b1", "B1", "BBB", 49),
  team("b2", "B2", "BBC", 39),
  team("b3", "B3", "BBD", 29),
  team("b4", "B4", "BBE", 19),
];

function slot(
  kind: "group_winner" | "group_runner_up",
  letter: string,
  key: string,
): KnockoutPickSlotDraft {
  return {
    rowKey: key,
    sectionLabel: "",
    slotLabel: "",
    tournamentStageId: "00000000-0000-4000-8000-000000000001",
    slotKey: null,
    groupCode: letter,
    bonusKey: null,
    predictionKind: kind,
    teamId: "",
  };
}

const groupSlots: KnockoutPickSlotDraft[] = WC2026_GROUP_CODES.flatMap(
  (letter) => [
    slot("group_winner", letter, `gw-${letter}`),
    slot("group_runner_up", letter, `gr-${letter}`),
  ],
);

function codesForTeamId(
  id: string,
  map: Record<string, string[]>,
  allTeams: Team[],
): string | null {
  const t = allTeams.find((x) => x.id === id);
  if (!t) return null;
  return groupLetterForCountry(t.countryCode, map);
}

function groupLetterForCountry(
  countryCode: string,
  map: Record<string, string[]>,
): string | null {
  const u = countryCode.toUpperCase();
  for (const letter of WC2026_GROUP_CODES) {
    const codes = map[letter];
    if (!codes?.length) continue;
    if (codes.some((c) => c.toUpperCase() === u)) return letter;
  }
  return null;
}

for (const mode of ["favorites", "balanced", "random"] as const) {
  const out = applyQuickPickToSlots(groupSlots, teams, mode, {
    fillKnockoutProgression: false,
    groupTeamCountryCodesByLetter: groupMap,
  });

  const winnerA = out.find(
    (s) => s.groupCode === "A" && s.predictionKind === "group_winner",
  )?.teamId;
  const runnerA = out.find(
    (s) => s.groupCode === "A" && s.predictionKind === "group_runner_up",
  )?.teamId;
  const winnerB = out.find(
    (s) => s.groupCode === "B" && s.predictionKind === "group_winner",
  )?.teamId;
  const runnerB = out.find(
    (s) => s.groupCode === "B" && s.predictionKind === "group_runner_up",
  )?.teamId;

  if (!winnerA || !runnerA || !winnerB || !runnerB) {
    throw new Error(`mode ${mode}: expected Group A/B picks to be non-empty`);
  }
  if (winnerA === runnerA) {
    throw new Error(`mode ${mode}: Group A 1st and 2nd must differ`);
  }
  if (winnerB === runnerB) {
    throw new Error(`mode ${mode}: Group B 1st and 2nd must differ`);
  }

  for (const id of [winnerA, runnerA]) {
    if (codesForTeamId(id, groupMap, teams) !== "A") {
      throw new Error(
        `mode ${mode}: Group A slot has team outside Group A (id=${id})`,
      );
    }
  }
  for (const id of [winnerB, runnerB]) {
    if (codesForTeamId(id, groupMap, teams) !== "B") {
      throw new Error(
        `mode ${mode}: Group B slot has team outside Group B (id=${id})`,
      );
    }
  }

  const gw = new Map<string, string>();
  const gr = new Map<string, string>();
  for (const letter of WC2026_GROUP_CODES) {
    gw.set(
      letter,
      out.find(
        (s) =>
          s.groupCode === letter && s.predictionKind === "group_winner",
      )?.teamId ?? "",
    );
    gr.set(
      letter,
      out.find(
        (s) =>
          s.groupCode === letter && s.predictionKind === "group_runner_up",
      )?.teamId ?? "",
    );
  }
  assertQuickPickGroupScheduleIntegrity(gw, gr, teams, groupMap);
}

console.log("knockoutQuickPickStrategies.selftest: ok");
