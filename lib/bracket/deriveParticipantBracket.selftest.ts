/**
 * Self-test: `npx tsx lib/bracket/deriveParticipantBracket.selftest.ts`
 */
import type { KnockoutPickSlotDraft } from "../../types/adminKnockoutPicks";
import type { Team } from "../../src/types/domain";
import { deriveParticipantBracket } from "./deriveParticipantBracket";
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

void (async function main() {
  const empty = deriveParticipantBracket({
    slots: [],
    teams: [],
    knockoutBracketPicksUnlocked: false,
  });
  assert(!empty.meta.hasAnyPicks, "empty slots => no picks");
  assert(empty.meta.knockoutBracketUnlocked === false, "meta reflects lock");

  const teams = [
    team("tF", "F-third", "FFF"),
    team("wE", "E-winner", "EWG"),
    team("rA", "A-runner", "RAA"),
    team("rB", "B-runner", "RBB"),
    ...[1, 2, 3, 4, 5, 6, 7, 8].map((i) => team(`tx${i}`, `X${i}`, `XX${i}`)),
  ];

  const thirdSlots: KnockoutPickSlotDraft[] = [1, 2, 3, 4, 5, 6, 7, 8].map((n) =>
    slot(`third|${n}`, "third_place_qualifier", String(n), n === 4 ? "tF" : `tx${n}`),
  );
  const groupSlots: KnockoutPickSlotDraft[] = [
    slot("gw:E", "group_winner", null, "wE", "E"),
    slot("gr:A", "group_runner_up", null, "rA", "A"),
    slot("gr:B", "group_runner_up", null, "rB", "B"),
  ];
  const slots = [...groupSlots, ...thirdSlots];

  const locked = deriveParticipantBracket({
    slots,
    teams,
    knockoutBracketPicksUnlocked: false,
  });
  assert(locked.roundOf32[0]?.home.teamId === "rA", "M73 home from group when locked");
  const m74 = locked.roundOf32[1]!;
  assert(m74.home.teamId === "wE", "M74 home 1E from group when locked");
  assert(
    m74.away.teamId === null && m74.away.undeterminedThird,
    "M74 away must not use Stage 2 third picks when Stage 3 closed",
  );
  assert(m74.winnerTeamId === null, "no R32 winner inference when Stage 3 closed");
  assert(locked.roundOf16[0]?.home.displayLabel === "Stage 3", "R16 placeholder when locked");
  assert(locked.champion.teamId === null, "champion cleared when locked");

  const sk = r32SlotKeysForMatchIndex(1);
  const withR32 = [
    ...slots,
    slot("r32-3", "round_of_32", sk.top, "wE"),
    slot("r32-4", "round_of_32", sk.bottom, "tF"),
  ];
  const unlocked = deriveParticipantBracket({
    slots: withR32,
    teams,
    knockoutBracketPicksUnlocked: true,
  });
  const m74u = unlocked.roundOf32[1]!;
  assert(m74u.home.teamId === "wE" && m74u.away.teamId === "tF", "saved R32 used when Stage 3 open");

  const r16Slots = Array.from({ length: 16 }, (_, i) =>
    slot(`r16|${i + 1}`, "round_of_16", String(i + 1), i === 0 ? "rA" : "", null),
  );
  const unlocked2 = deriveParticipantBracket({
    slots: [...withR32, ...r16Slots],
    teams,
    knockoutBracketPicksUnlocked: true,
  });
  assert(
    unlocked2.roundOf32[0]?.winnerTeamId === "rA",
    "R16 pick can highlight R32 winner when Stage 3 open",
  );

  console.log("deriveParticipantBracket selftest: ok");
})();
