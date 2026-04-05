import type { Team } from "../../src/types/domain";
import type { KnockoutPickSlotDraft } from "../../types/adminKnockoutPicks";
import { teamStrengthLabel } from "../teams/teamStrengthLabel";

function shuffleInPlace<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
  return arr;
}

function pickDistinctTeams(teams: Team[], n: number): Team[] {
  const copy = shuffleInPlace([...teams]);
  return copy.slice(0, Math.min(n, copy.length));
}

const REGION_BUCKET: Record<string, number> = {
  // Americas
  MEX: 0,
  CAN: 0,
  USA: 0,
  BRA: 0,
  ARG: 0,
  URU: 0,
  COL: 0,
  ECU: 0,
  PAR: 0,
  HAI: 0,
  CUW: 0,
  PAN: 0,
  // Europe-ish
  CZE: 1,
  BIH: 1,
  SUI: 1,
  SCO: 1,
  GER: 1,
  NED: 1,
  SWE: 1,
  BEL: 1,
  ESP: 1,
  FRA: 1,
  NOR: 1,
  POR: 1,
  AUT: 1,
  ENG: 1,
  CRO: 1,
  TUR: 1,
  WAL: 1,
  SRB: 1,
  POL: 1,
  UKR: 1,
  DEN: 1,
  ITA: 1,
  // Africa
  RSA: 2,
  MAR: 2,
  TUN: 2,
  CIV: 2,
  EGY: 2,
  SEN: 2,
  GHA: 2,
  CPV: 2,
  COD: 2,
  ALG: 2,
  NGA: 2,
  // Asia / Pacific / Middle East
  KOR: 3,
  QAT: 3,
  AUS: 3,
  JPN: 3,
  IRN: 3,
  NZL: 3,
  KSA: 3,
  IRQ: 3,
  JOR: 3,
  UZB: 3,
};

function bucketForTeam(t: Team): number {
  return REGION_BUCKET[t.countryCode.toUpperCase()] ?? 1;
}

/** Try to pick `count` teams rotating across rough world regions. */
function balancedPick(teams: Team[], count: number): Team[] {
  const byBucket: Team[][] = [[], [], [], []];
  for (const t of teams) {
    byBucket[bucketForTeam(t)]!.push(t);
  }
  for (const b of byBucket) shuffleInPlace(b);

  const out: Team[] = [];
  let rot = 0;
  const guard = count * 8 + 20;
  let steps = 0;
  while (out.length < count && steps < guard) {
    steps += 1;
    let added = false;
    for (let k = 0; k < 4; k += 1) {
      const b = (rot + k) % 4;
      const list = byBucket[b]!;
      if (list.length > 0) {
        out.push(list.pop()!);
        added = true;
        rot = (b + 1) % 4;
        break;
      }
    }
    if (!added) break;
  }

  if (out.length < count) {
    const rest = teams.filter((t) => !out.some((x) => x.id === t.id));
    shuffleInPlace(rest);
    for (const t of rest) {
      if (out.length >= count) break;
      out.push(t);
    }
  }

  return out.slice(0, count);
}

function favoritesOrderedPool(teams: Team[]): Team[] {
  const rank = (t: Team) => {
    const label = teamStrengthLabel(t.countryCode);
    if (label === "Often picked") return 0;
    if (label === "Solid") return 1;
    return 2;
  };
  const copy = [...teams];
  copy.sort((a, b) => {
    const ra = rank(a);
    const rb = rank(b);
    if (ra !== rb) return ra - rb;
    return a.name.localeCompare(b.name);
  });
  return copy;
}

export type QuickPickMode = "random" | "favorites" | "balanced";

/**
 * Fills all knockout slots with a coherent bracket: SF ⊆ QF, F ⊆ SF, champion ∈ F.
 */
export function applyQuickPickToSlots(
  slots: KnockoutPickSlotDraft[],
  teams: Team[],
  mode: QuickPickMode,
): KnockoutPickSlotDraft[] {
  if (teams.length === 0) return slots;

  let qfPool: Team[];
  if (mode === "random") {
    qfPool = pickDistinctTeams(teams, 8);
  } else if (mode === "balanced") {
    qfPool = balancedPick(teams, 8);
  } else {
    const ordered = favoritesOrderedPool(teams);
    qfPool = ordered.slice(0, 8);
    if (qfPool.length < 8) {
      const extra = teams.filter((t) => !qfPool.some((q) => q.id === t.id));
      shuffleInPlace(extra);
      qfPool = [...qfPool, ...extra.slice(0, 8 - qfPool.length)];
    }
  }

  if (qfPool.length < 8) {
    const need = 8 - qfPool.length;
    const extra = teams.filter((t) => !qfPool.some((q) => q.id === t.id));
    shuffleInPlace(extra);
    qfPool = [...qfPool, ...extra.slice(0, need)];
  }

  const qfIds = qfPool.map((t) => t.id);
  const sfTeams = pickDistinctTeams([...qfPool], 4);
  const sfIds = sfTeams.map((t) => t.id);

  const fTeams = pickDistinctTeams([...sfTeams], 2);
  const fIds = fTeams.map((t) => t.id);

  const cTeams = pickDistinctTeams([...fTeams], 1);
  const cIds = cTeams.map((t) => t.id);

  let qi = 0;
  let si = 0;
  let fi = 0;

  return slots.map((row) => {
    if (row.predictionKind === "quarterfinalist") {
      const id = qfIds[qi] ?? "";
      qi += 1;
      return { ...row, teamId: id };
    }
    if (row.predictionKind === "semifinalist") {
      const id = sfIds[si] ?? "";
      si += 1;
      return { ...row, teamId: id };
    }
    if (row.predictionKind === "finalist") {
      const id = fIds[fi] ?? "";
      fi += 1;
      return { ...row, teamId: id };
    }
    if (row.predictionKind === "champion") {
      return { ...row, teamId: cIds[0] ?? "" };
    }
    return row;
  });
}
