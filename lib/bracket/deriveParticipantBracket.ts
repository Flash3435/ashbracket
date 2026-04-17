import type { Team } from "../../src/types/domain";
import type { KnockoutPickSlotDraft } from "../../types/adminKnockoutPicks";
import { filterKnockoutSlots, pairKnockoutSlots } from "../predictions/knockoutBracketLayout";
import type {
  BracketMatchResolved,
  BracketSideResolved,
  ParticipantBracketModel,
} from "./types";
import {
  buildCountryCodeToGroupLetter,
  thirdAdvancingGroupKeyFromSlots,
  thirdGroupRoutedToWinnerSlot,
  thirdPickTeamIdForGroup,
} from "./thirdPlaceRouting";
import { wc2026ThirdComboPlacementByKey } from "./wc2026ThirdPlaceCombinations";
import {
  r32SlotKeysForMatchIndex,
  roundOf32RowKeyBySlot,
  WC2026_R32_MATCH_DEFS,
  type Wc2026R32SideSpec,
} from "./wc2026RoundOf32";

function teamLabel(teamById: Map<string, Team>, teamId: string | null): string {
  if (!teamId?.trim()) return "TBD";
  const t = teamById.get(teamId.trim());
  return t?.name ?? "Unknown team";
}

function groupPickTeamId(
  slots: KnockoutPickSlotDraft[],
  kind: "group_winner" | "group_runner_up",
  group: string,
): string | null {
  const g = group.toUpperCase();
  const row = slots.find(
    (s) => s.predictionKind === kind && (s.groupCode ?? "").toUpperCase() === g,
  );
  const id = row?.teamId?.trim();
  return id || null;
}

function pickWinnerFromNextRound(
  a: string | null,
  b: string | null,
  nextIds: Set<string>,
): string | null {
  const ta = a?.trim() || null;
  const tb = b?.trim() || null;
  const ha = ta ? nextIds.has(ta) : false;
  const hb = tb ? nextIds.has(tb) : false;
  if (ha && !hb) return ta;
  if (hb && !ha) return tb;
  return null;
}

function idsForKind(slots: KnockoutPickSlotDraft[], kind: string): Set<string> {
  const s = new Set<string>();
  for (const row of slots) {
    const id = row.teamId.trim();
    if (id && row.predictionKind === kind) s.add(id);
  }
  return s;
}

function resolveR32Side(
  spec: Wc2026R32SideSpec,
  slots: KnockoutPickSlotDraft[],
  teamById: Map<string, Team>,
  countryToGroup: Map<string, string>,
  /** Sorted eight-letter key only when Annex C resolves (`wc2026ThirdComboPlacementByKey` hit). */
  sortedEightThirdKeyForRouting: string | null,
  slotKey: string,
): BracketSideResolved {
  const saved = slots.find((s) => s.predictionKind === "round_of_32" && s.slotKey === slotKey);
  const savedId = saved?.teamId.trim() || null;
  const rowKey = saved?.rowKey ?? roundOf32RowKeyBySlot(slots, slotKey);

  if (savedId) {
    return {
      slotKey,
      pickRowKey: rowKey,
      teamId: savedId,
      displayLabel: teamLabel(teamById, savedId),
    };
  }

  if (spec.kind === "group_winner") {
    const tid = groupPickTeamId(slots, "group_winner", spec.group);
    const g = spec.group.toUpperCase();
    return {
      slotKey,
      pickRowKey: rowKey,
      teamId: tid,
      displayLabel: tid ? teamLabel(teamById, tid) : `1${g}`,
    };
  }

  if (spec.kind === "group_runner_up") {
    const tid = groupPickTeamId(slots, "group_runner_up", spec.group);
    const g = spec.group.toUpperCase();
    return {
      slotKey,
      pickRowKey: rowKey,
      teamId: tid,
      displayLabel: tid ? teamLabel(teamById, tid) : `2${g}`,
    };
  }

  const w = spec.winnerSlot;
  if (!sortedEightThirdKeyForRouting) {
    return {
      slotKey,
      pickRowKey: rowKey,
      teamId: null,
      displayLabel: "Best 3rd (undetermined)",
      undeterminedThird: true,
    };
  }
  const routedGroup = thirdGroupRoutedToWinnerSlot(sortedEightThirdKeyForRouting, w);
  if (!routedGroup) {
    return {
      slotKey,
      pickRowKey: rowKey,
      teamId: null,
      displayLabel: "Best 3rd (undetermined)",
      undeterminedThird: true,
    };
  }
  const tid = thirdPickTeamIdForGroup(slots, routedGroup, teamById, countryToGroup);
  if (!tid) {
    return {
      slotKey,
      pickRowKey: rowKey,
      teamId: null,
      displayLabel: `Best 3rd (group ${routedGroup})`,
      undeterminedThird: true,
    };
  }
  return {
    slotKey,
    pickRowKey: rowKey,
    teamId: tid,
    displayLabel: teamLabel(teamById, tid),
  };
}

function buildKnockoutColumn(
  slots: KnockoutPickSlotDraft[],
  kind: KnockoutPickSlotDraft["predictionKind"],
  teamById: Map<string, Team>,
  nextKind: KnockoutPickSlotDraft["predictionKind"] | "champion",
  nextIds: Set<string>,
): BracketMatchResolved[] {
  const rows = filterKnockoutSlots(slots, kind);
  const pairs = pairKnockoutSlots(rows);
  return pairs.map((p, idx) => {
    const topKey = p.top?.slotKey ?? null;
    const botKey = p.bottom?.slotKey ?? null;
    const topId = p.top?.teamId?.trim() || null;
    const botId = p.bottom?.teamId?.trim() || null;
    const winner =
      nextKind === "champion"
        ? null
        : pickWinnerFromNextRound(topId, botId, nextIds);
    const top: BracketSideResolved = {
      slotKey: topKey,
      pickRowKey: p.top?.rowKey ?? null,
      teamId: topId,
      displayLabel: topId ? teamLabel(teamById, topId) : "TBD",
    };
    const bottom: BracketSideResolved = {
      slotKey: botKey,
      pickRowKey: p.bottom?.rowKey ?? null,
      teamId: botId,
      displayLabel: botId ? teamLabel(teamById, botId) : "TBD",
    };
    return {
      matchKey: `${String(kind)}-${idx + 1}`,
      fifaMatchNo: 0,
      home: top,
      away: bottom,
      winnerTeamId: winner,
    };
  });
}

export type DeriveParticipantBracketInput = {
  slots: KnockoutPickSlotDraft[];
  teams: Team[];
  groupTeamCountryCodesByLetter: Record<string, string[]>;
  knockoutBracketPicksUnlocked: boolean;
};

export function deriveParticipantBracket(input: DeriveParticipantBracketInput): ParticipantBracketModel {
  const { slots, teams, groupTeamCountryCodesByLetter, knockoutBracketPicksUnlocked } = input;
  const teamById = new Map(teams.map((t) => [t.id, t]));
  const countryToGroup = buildCountryCodeToGroupLetter(groupTeamCountryCodesByLetter);
  const sortedEightKey = thirdAdvancingGroupKeyFromSlots(slots, teamById, countryToGroup);
  const thirdPlacementRow = sortedEightKey ? wc2026ThirdComboPlacementByKey(sortedEightKey) : null;
  const sortedEightKeyForRouting = thirdPlacementRow ? sortedEightKey : null;
  const thirdComboResolved = Boolean(thirdPlacementRow);

  const notes: string[] = [];
  if (!knockoutBracketPicksUnlocked) {
    notes.push(
      "Knockout picks may still be closed until organizers publish all 32 official Round of 32 teams.",
    );
  }
  if (!thirdComboResolved) {
    notes.push(
      "Some Round of 32 slots depend on which third-place groups qualify — pick all eight third-place advancers to resolve routing.",
    );
  }
  if (sortedEightKey && !thirdPlacementRow) {
    notes.push(
      "Eight third-place advancers are filled but their group letters do not match any Annex C combination — third routing stays undetermined.",
    );
  }

  const roundOf32: BracketMatchResolved[] = WC2026_R32_MATCH_DEFS.map((def, i) => {
    const { top: topSk, bottom: botSk } = r32SlotKeysForMatchIndex(i);
    const home = resolveR32Side(
      def.top,
      slots,
      teamById,
      countryToGroup,
      sortedEightKeyForRouting,
      topSk,
    );
    const away = resolveR32Side(
      def.bottom,
      slots,
      teamById,
      countryToGroup,
      sortedEightKeyForRouting,
      botSk,
    );
    const r16 = idsForKind(slots, "round_of_16");
    const winnerTeamId = pickWinnerFromNextRound(home.teamId, away.teamId, r16);
    return {
      matchKey: `M${def.fifaMatchNo}`,
      fifaMatchNo: def.fifaMatchNo,
      home,
      away,
      winnerTeamId,
    };
  });

  const qfIds = idsForKind(slots, "quarterfinalist");
  const sfIds = idsForKind(slots, "semifinalist");
  const finIds = idsForKind(slots, "finalist");
  const champRow = slots.find((s) => s.predictionKind === "champion");
  const champId = champRow?.teamId.trim() || null;

  const roundOf16 = buildKnockoutColumn(slots, "round_of_16", teamById, "quarterfinalist", qfIds);
  const quarterfinals = buildKnockoutColumn(
    slots,
    "quarterfinalist",
    teamById,
    "semifinalist",
    sfIds,
  );
  const semifinals = buildKnockoutColumn(slots, "semifinalist", teamById, "finalist", finIds);

  const finPairs = pairKnockoutSlots(filterKnockoutSlots(slots, "finalist"));
  const final: BracketMatchResolved[] = finPairs.map((p, idx) => {
    const topId = p.top?.teamId?.trim() || null;
    const botId = p.bottom?.teamId?.trim() || null;
    const winnerTeamId =
      champId && (champId === topId || champId === botId)
        ? champId
        : pickWinnerFromNextRound(topId, botId, champId ? new Set([champId]) : new Set());
    return {
      matchKey: `final-${idx + 1}`,
      fifaMatchNo: 0,
      home: {
        slotKey: p.top?.slotKey ?? null,
        pickRowKey: p.top?.rowKey ?? null,
        teamId: topId,
        displayLabel: topId ? teamLabel(teamById, topId) : "TBD",
      },
      away: {
        slotKey: p.bottom?.slotKey ?? null,
        pickRowKey: p.bottom?.rowKey ?? null,
        teamId: botId,
        displayLabel: botId ? teamLabel(teamById, botId) : "TBD",
      },
      winnerTeamId,
    };
  });

  const hasAnyPicks = slots.some((s) => s.teamId.trim() !== "");

  return {
    roundOf32,
    roundOf16,
    quarterfinals,
    semifinals,
    final,
    champion: {
      teamId: champId,
      pickRowKey: champRow?.rowKey ?? null,
    },
    meta: {
      hasAnyPicks,
      thirdComboResolved,
      notes,
    },
  };
}
