import type { Team } from "../../src/types/domain";
import type { KnockoutPickSlotDraft } from "../../types/adminKnockoutPicks";
import { officialKnockoutResolvedColumn } from "./officialKnockoutPreviewPairs";
import { readConfirmedR32MatchWinner } from "../picks/knockoutMatchPickRows";
import type {
  BracketMatchResolved,
  BracketSideResolved,
  ParticipantBracketModel,
} from "./types";
import {
  r32SlotKeysForMatchIndex,
  roundOf32RowKeyBySlot,
  WC2026_R32_MATCH_DEFS,
  type Wc2026R32SideSpec,
} from "./wc2026RoundOf32";
import { wc2026ThirdRoutedSideDisplayLabel } from "../tournament/worldcup2026ThirdPlaceMapping";

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

const LATE_ROUND_PLACEHOLDER_LABEL = "Opens in Stage 3";
const LATE_ROUND_PLACEHOLDER_SUB = "Knockout picks open after group stage.";

function placeholderSides(): { home: BracketSideResolved; away: BracketSideResolved } {
  const side = (): BracketSideResolved => ({
    slotKey: null,
    pickRowKey: null,
    teamId: null,
    displayLabel: LATE_ROUND_PLACEHOLDER_LABEL,
    placeholderSubtext: LATE_ROUND_PLACEHOLDER_SUB,
  });
  const home = side();
  const away = side();
  return { home, away };
}

function buildLaterRoundPlaceholders(): Pick<
  ParticipantBracketModel,
  "roundOf16" | "quarterfinals" | "semifinals" | "final"
> {
  const mk = (count: number, prefix: string): BracketMatchResolved[] =>
    Array.from({ length: count }, (_, i) => {
      const { home, away } = placeholderSides();
      return {
        matchKey: `${prefix}-${i + 1}`,
        fifaMatchNo: 0,
        home,
        away,
        winnerTeamId: null,
      };
    });

  return {
    roundOf16: mk(8, "r16"),
    quarterfinals: mk(4, "qf"),
    semifinals: mk(2, "sf"),
    final: mk(1, "final"),
  };
}

/**
 * Resolves one side of an R32 match.
 * - Stage 1 (group) sides always come from group picks when empty in R32.
 * - Third-place-dependent sides never pull from Stage 2 lists or Annex C; they only show
 *   saved `round_of_32` picks when Stage 3 is open (`knockoutBracketPicksUnlocked`).
 */
function resolveR32Side(
  spec: Wc2026R32SideSpec,
  slots: KnockoutPickSlotDraft[],
  teamById: Map<string, Team>,
  knockoutBracketPicksUnlocked: boolean,
  slotKey: string,
): BracketSideResolved {
  const saved = slots.find((s) => s.predictionKind === "round_of_32" && s.slotKey === slotKey);
  const savedId = saved?.teamId.trim() || null;
  const rowKey = saved?.rowKey ?? roundOf32RowKeyBySlot(slots, slotKey);

  if (knockoutBracketPicksUnlocked && savedId) {
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

  return {
    slotKey,
    pickRowKey: rowKey,
    teamId: null,
    displayLabel: knockoutBracketPicksUnlocked
      ? "TBD"
      : wc2026ThirdRoutedSideDisplayLabel(spec.winnerSlot),
    placeholderSubtext: knockoutBracketPicksUnlocked
      ? undefined
      : "FIFA assigns this spot from Annex C after the group stage — your Stage 2 picks do not place a team here.",
    undeterminedThird: true,
  };
}

export type DeriveParticipantBracketInput = {
  slots: KnockoutPickSlotDraft[];
  teams: Team[];
  /**
   * True when organizers have entered all 32 official R32 teams and participant Stage 3
   * knockout picks are active (`fetchOfficialRoundOf32Complete`).
   */
  knockoutBracketPicksUnlocked: boolean;
};

export function deriveParticipantBracket(input: DeriveParticipantBracketInput): ParticipantBracketModel {
  const { slots, teams, knockoutBracketPicksUnlocked } = input;
  const teamById = new Map(teams.map((t) => [t.id, t]));

  const notes: string[] = [];
  notes.push(
    "Third-place qualifiers are not placed into the Round of 32 bracket until the group stage is complete and organizers publish the official knockout field.",
  );
  notes.push(
    "Your Stage 2 picks only name which eight teams you think advance as best third-place finishers — not FIFA bracket positions. You will complete the full knockout bracket in Stage 3 after the official Round of 32 is set.",
  );

  if (!knockoutBracketPicksUnlocked) {
    notes.push(
      "Below: fixed Round of 32 sides from your group picks where applicable. Third-route sides show FIFA-style labels (e.g. 3 ABCDF) until Stage 3; later rounds open in Stage 3.",
    );
  }

  const roundOf32: BracketMatchResolved[] = WC2026_R32_MATCH_DEFS.map((def, i) => {
    const { top: topSk, bottom: botSk } = r32SlotKeysForMatchIndex(i);
    const home = resolveR32Side(def.top, slots, teamById, knockoutBracketPicksUnlocked, topSk);
    const away = resolveR32Side(
      def.bottom,
      slots,
      teamById,
      knockoutBracketPicksUnlocked,
      botSk,
    );

    let winnerTeamId: string | null = null;
    if (knockoutBracketPicksUnlocked) {
      winnerTeamId = readConfirmedR32MatchWinner(i, slots) || null;
    }

    return {
      matchKey: `M${def.fifaMatchNo}`,
      fifaMatchNo: def.fifaMatchNo,
      home,
      away,
      winnerTeamId,
    };
  });

  let roundOf16: BracketMatchResolved[];
  let quarterfinals: BracketMatchResolved[];
  let semifinals: BracketMatchResolved[];
  let final: BracketMatchResolved[];
  let champion: { teamId: string | null; pickRowKey: string | null };

  if (!knockoutBracketPicksUnlocked) {
    const ph = buildLaterRoundPlaceholders();
    roundOf16 = ph.roundOf16;
    quarterfinals = ph.quarterfinals;
    semifinals = ph.semifinals;
    final = ph.final;
    champion = { teamId: null, pickRowKey: null };
  } else {
    const previewInput = {
      slots,
      teams,
      knockoutBracketPicksUnlocked: true,
    };
    const champRow = slots.find((s) => s.predictionKind === "champion");
    const champId = champRow?.teamId.trim() || null;

    roundOf16 = officialKnockoutResolvedColumn(
      "round_of_16",
      previewInput,
      teamById,
    );
    quarterfinals = officialKnockoutResolvedColumn(
      "quarterfinalist",
      previewInput,
      teamById,
    );
    semifinals = officialKnockoutResolvedColumn(
      "semifinalist",
      previewInput,
      teamById,
    );
    final = officialKnockoutResolvedColumn("finalist", previewInput, teamById);

    champion = {
      teamId: champId,
      pickRowKey: champRow?.rowKey ?? null,
    };
  }

  const hasAnyPicks = slots.some((s) => s.teamId.trim() !== "");

  return {
    roundOf32,
    roundOf16,
    quarterfinals,
    semifinals,
    final,
    champion,
    meta: {
      hasAnyPicks,
      knockoutBracketUnlocked: knockoutBracketPicksUnlocked,
      notes,
    },
  };
}
