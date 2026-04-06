import type { KnockoutPickSlotDraft } from "../../types/adminKnockoutPicks";
import type { PredictionKind } from "../../src/types/domain";
import type { Team } from "../../src/types/domain";
import type { TournamentMatchPublicRow } from "../../types/tournamentPublic";

export type PickHighlightLevel = "none" | "bracket" | "round";

function normCountryCode(c: string | null | undefined): string | null {
  if (c == null || c === "") return null;
  return c.trim().toUpperCase();
}

function normGroupCode(c: string | null | undefined): string {
  return (c ?? "").trim().toUpperCase();
}

function teamCodeForSlot(
  teamId: string,
  teamById: Map<string, Team>,
): string | null {
  const id = teamId.trim();
  if (!id) return null;
  const t = teamById.get(id);
  return t ? normCountryCode(t.countryCode) : null;
}

/**
 * Prediction rows that correspond to the same tournament phase as this official match
 * (for “your pick for this round” vs “anywhere in your bracket”).
 */
function directPredictionKindsForMatch(
  m: TournamentMatchPublicRow,
): PredictionKind[] | null {
  if (m.stage_code === "group") {
    return null;
  }
  switch (m.stage_code) {
    case "round_of_32":
      return ["round_of_32"];
    case "round_of_16":
      return ["round_of_16"];
    case "quarterfinal":
      return ["quarterfinalist"];
    case "semifinal":
      return ["semifinalist"];
    case "final":
      return ["finalist", "champion"];
    case "third_place":
      return [];
    default:
      return [];
  }
}

function directCountryCodesForGroupMatch(
  m: TournamentMatchPublicRow,
  slots: KnockoutPickSlotDraft[],
  teamById: Map<string, Team>,
): Set<string> {
  const gc = normGroupCode(m.group_code);
  const out = new Set<string>();
  if (!gc) return out;
  for (const s of slots) {
    if (
      s.predictionKind !== "group_winner" &&
      s.predictionKind !== "group_runner_up"
    ) {
      continue;
    }
    if (normGroupCode(s.groupCode) !== gc) continue;
    const code = teamCodeForSlot(s.teamId, teamById);
    if (code) out.add(code);
  }
  return out;
}

function directCountryCodesForKnockoutMatch(
  m: TournamentMatchPublicRow,
  slots: KnockoutPickSlotDraft[],
  teamById: Map<string, Team>,
): Set<string> {
  const kinds = directPredictionKindsForMatch(m);
  if (kinds == null) {
    return directCountryCodesForGroupMatch(m, slots, teamById);
  }
  if (kinds.length === 0) return new Set();
  const kindSet = new Set<PredictionKind>(kinds);
  const out = new Set<string>();
  for (const s of slots) {
    if (!kindSet.has(s.predictionKind)) continue;
    const code = teamCodeForSlot(s.teamId, teamById);
    if (code) out.add(code);
  }
  return out;
}

function allPickedCountryCodes(
  slots: KnockoutPickSlotDraft[],
  teamById: Map<string, Team>,
): Set<string> {
  const out = new Set<string>();
  for (const s of slots) {
    if (s.predictionKind === "bonus_pick") {
      const code = teamCodeForSlot(s.teamId, teamById);
      if (code) out.add(code);
      continue;
    }
    const code = teamCodeForSlot(s.teamId, teamById);
    if (code) out.add(code);
  }
  return out;
}

export function buildPickHighlightSets(
  m: TournamentMatchPublicRow,
  slots: KnockoutPickSlotDraft[],
  teamById: Map<string, Team>,
): { all: Set<string>; direct: Set<string> } {
  return {
    all: allPickedCountryCodes(slots, teamById),
    direct: directCountryCodesForKnockoutMatch(m, slots, teamById),
  };
}

export function pickHighlightForSide(
  m: TournamentMatchPublicRow,
  side: "home" | "away",
  slots: KnockoutPickSlotDraft[],
  teamById: Map<string, Team>,
): PickHighlightLevel {
  const code = normCountryCode(
    side === "home" ? m.home_country_code : m.away_country_code,
  );
  if (!code) return "none";
  const { all, direct } = buildPickHighlightSets(m, slots, teamById);
  if (direct.has(code)) return "round";
  if (all.has(code)) return "bracket";
  return "none";
}

export function countMatchesInvolvingPicks(
  matches: TournamentMatchPublicRow[],
  slots: KnockoutPickSlotDraft[],
  teamById: Map<string, Team>,
): number {
  if (slots.length === 0) return 0;
  let n = 0;
  for (const m of matches) {
    const h = pickHighlightForSide(m, "home", slots, teamById);
    const a = pickHighlightForSide(m, "away", slots, teamById);
    if (h !== "none" || a !== "none") n += 1;
  }
  return n;
}

export const PICK_HIGHLIGHT_HELP = {
  round:
    "You picked this team for this stage of the tournament (e.g. this group or this knockout round).",
  bracket:
    "This national team appears somewhere in your saved picks (another round, a bonus question, etc.).",
} as const;
