/**
 * Self-test: `npx tsx lib/bracket/deriveParticipantBracket.selftest.ts`
 */
import type { KnockoutPickSlotDraft } from "../../types/adminKnockoutPicks";
import type { Team } from "../../src/types/domain";
import { deriveParticipantBracket } from "./deriveParticipantBracket";
import { wc2026ThirdComboPlacementByKey } from "./wc2026ThirdPlaceCombinations";
import { r32SlotKeysForMatchIndex } from "./wc2026RoundOf32";

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(msg);
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

const groups: Record<string, string[]> = {
  A: ["RAA"],
  B: ["RBB"],
  C: ["CCC"],
  D: ["DDD"],
  E: ["EWG", "ETH"],
  F: ["FFF"],
  G: ["GGG"],
  H: ["HHH"],
  I: ["III"],
  J: ["JJJ"],
  K: ["KKK"],
  L: ["LLL"],
};

void (async function main() {
  const empty = deriveParticipantBracket({
    slots: [],
    teams: [],
    groupTeamCountryCodesByLetter: groups,
    knockoutBracketPicksUnlocked: true,
  });
  assert(!empty.meta.hasAnyPicks, "empty slots => no picks");

  const key = "EFGHIJKL";
  const placement = wc2026ThirdComboPlacementByKey(key);
  assert(placement && placement[3] === "F", "Annex row 1 maps 1E slot to third group F");

  const teams = [
    team("tE", "E-third", "ETH"),
    team("tJ", "J-land", "JJJ"),
    team("tI", "I-land", "III"),
    team("tF", "F-land", "FFF"),
    team("tH", "H-land", "HHH"),
    team("tG", "G-land", "GGG"),
    team("tL", "L-land", "LLL"),
    team("tK", "K-land", "KKK"),
    team("wE", "E-winner", "EWG"),
    team("rA", "A-runner", "RAA"),
    team("rB", "B-runner", "RBB"),
  ];

  const thirdSlots: KnockoutPickSlotDraft[] = [1, 2, 3, 4, 5, 6, 7, 8].map((n) =>
    slot(`third|${n}`, "third_place_qualifier", String(n), teams[n - 1]!.id),
  );

  const groupSlots: KnockoutPickSlotDraft[] = [
    slot("gw:E", "group_winner", null, "wE", "E"),
    slot("gr:A", "group_runner_up", null, "rA", "A"),
    slot("gr:B", "group_runner_up", null, "rB", "B"),
  ];

  const slots = [...groupSlots, ...thirdSlots];

  const b = deriveParticipantBracket({
    slots,
    teams,
    groupTeamCountryCodesByLetter: groups,
    knockoutBracketPicksUnlocked: true,
  });
  assert(b.meta.thirdComboResolved, "combo resolves for EFGHIJKL");
  const m73 = b.roundOf32[0];
  assert(m73.fifaMatchNo === 73, "first match M73");
  assert(m73.home.teamId === "rA" && m73.away.teamId === "rB", "M73 runners from groups");

  const m74 = b.roundOf32[1];
  const sk = r32SlotKeysForMatchIndex(1);
  assert(m74.home.teamId === "wE", "M74 home is group E winner");
  assert(m74.away.teamId === "tF", `M74 away third is group F pick (slot ${sk.bottom})`);

  const r32Slots: KnockoutPickSlotDraft[] = [];
  for (let i = 1; i <= 32; i++) {
    r32Slots.push(slot(`r32|${i}`, "round_of_32", String(i), "", null));
  }
  const r16Slots: KnockoutPickSlotDraft[] = [];
  for (let i = 1; i <= 16; i++) {
    r16Slots.push(slot(`r16|${i}`, "round_of_16", String(i), i === 1 ? "rA" : "", null));
  }

  const b2 = deriveParticipantBracket({
    slots: [...slots, ...r32Slots, ...r16Slots],
    teams,
    groupTeamCountryCodesByLetter: groups,
    knockoutBracketPicksUnlocked: true,
  });
  assert(b2.roundOf32[0]?.winnerTeamId === "rA", "R16 contains rA => M73 winner rA");

  console.log("deriveParticipantBracket selftest: ok");
})();
