import type { Team } from "../../src/types/domain";
import type { KnockoutPickSlotDraft } from "../../types/adminKnockoutPicks";
import { WC2026_GROUP_CODES } from "../tournament/wc2026GroupCodes";
import { teamStrengthLabel } from "../teams/teamStrengthLabel";
import { isKnockoutProgressionKind } from "./knockoutProgressionKinds";

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
  const strengthTier = (t: Team) => {
    const label = teamStrengthLabel(t.countryCode);
    if (label === "Often picked") return 0;
    if (label === "Solid") return 1;
    return 2;
  };
  const copy = [...teams];
  copy.sort((a, b) => {
    const fa = a.fifaRank;
    const fb = b.fifaRank;
    if (fa != null && fb != null && fa !== fb) return fa - fb;
    if (fa != null && fb == null) return -1;
    if (fa == null && fb != null) return 1;
    const ra = strengthTier(a);
    const rb = strengthTier(b);
    if (ra !== rb) return ra - rb;
    return a.name.localeCompare(b.name);
  });
  return copy;
}

function orderedTeamsForMode(teams: Team[], mode: QuickPickMode): Team[] {
  if (teams.length === 0) return [];
  if (mode === "random") return shuffleInPlace([...teams]);
  if (mode === "balanced") return balancedPick(teams, teams.length);
  return favoritesOrderedPool(teams);
}

function scheduleGroupRostersLoaded(
  groupTeamCountryCodesByLetter: Record<string, string[]> | undefined,
): boolean {
  return Boolean(
    groupTeamCountryCodesByLetter &&
      Object.keys(groupTeamCountryCodesByLetter).length > 0,
  );
}

function teamsInScheduleGroup(
  letter: string,
  allTeams: Team[],
  groupTeamCountryCodesByLetter: Record<string, string[]>,
): Team[] {
  const codes = groupTeamCountryCodesByLetter[letter.toUpperCase()];
  if (!codes?.length) return [];
  const set = new Set(codes.map((c) => c.toUpperCase()));
  return allTeams.filter((t) => set.has(t.countryCode.toUpperCase()));
}

function groupLetterForCountryCode(
  countryCode: string,
  groupTeamCountryCodesByLetter: Record<string, string[]>,
): string | null {
  const u = countryCode.toUpperCase();
  for (const letter of WC2026_GROUP_CODES) {
    const codes = groupTeamCountryCodesByLetter[letter];
    if (!codes?.length) continue;
    if (codes.some((c) => c.toUpperCase() === u)) return letter;
  }
  return null;
}

/** Picks 1st / 2nd for one group using the same personality, only from `pickSource`. */
function pickWinnerAndRunnerForGroup(
  mode: QuickPickMode,
  pickSource: Team[],
): { winnerId: string; runnerId: string } {
  if (pickSource.length === 0) return { winnerId: "", runnerId: "" };
  if (pickSource.length === 1) {
    const id = pickSource[0]!.id;
    return { winnerId: id, runnerId: "" };
  }
  if (mode === "random") {
    const two = pickDistinctTeams(pickSource, 2);
    return {
      winnerId: two[0]?.id ?? "",
      runnerId: two[1]?.id ?? "",
    };
  }
  if (mode === "balanced") {
    const two = balancedPick(pickSource, 2);
    return {
      winnerId: two[0]?.id ?? "",
      runnerId: two[1]?.id ?? "",
    };
  }
  const fav = favoritesOrderedPool(pickSource);
  return {
    winnerId: fav[0]?.id ?? "",
    runnerId: fav[1]?.id ?? "",
  };
}

/**
 * Ensures quick-start never assigns a team to a group slot outside that group's
 * official roster (when the schedule map is loaded).
 */
export function assertQuickPickGroupScheduleIntegrity(
  groupWinnerByLetter: Map<string, string>,
  groupRunnerByLetter: Map<string, string>,
  teams: Team[],
  groupTeamCountryCodesByLetter: Record<string, string[]>,
): void {
  const byId = new Map(teams.map((t) => [t.id, t]));
  for (const letter of WC2026_GROUP_CODES) {
    const codes = new Set(
      (groupTeamCountryCodesByLetter[letter] ?? []).map((c) => c.toUpperCase()),
    );
    if (codes.size === 0) continue;

    const w = groupWinnerByLetter.get(letter) ?? "";
    const r = groupRunnerByLetter.get(letter) ?? "";
    if (w && w === r) {
      throw new Error(
        `Quick pick invariant: Group ${letter} has the same team for 1st and 2nd.`,
      );
    }
    for (const id of [w, r]) {
      if (!id) continue;
      const t = byId.get(id);
      if (!t) {
        throw new Error(
          `Quick pick invariant: unknown team id "${id}" for Group ${letter}.`,
        );
      }
      if (!codes.has(t.countryCode.toUpperCase())) {
        throw new Error(
          `Quick pick invariant: team ${t.countryCode} is assigned to Group ${letter} but is not on that group's schedule roster.`,
        );
      }
    }
  }
}

function pickNTeamIdsFromPool(pool: Team[], n: number): string[] {
  const ids = pool.map((t) => t.id);
  if (ids.length >= n) return ids.slice(0, n);
  const out = [...ids];
  let i = 0;
  while (out.length < n && pool.length > 0) {
    out.push(pool[i % pool.length]!.id);
    i += 1;
  }
  return out.slice(0, n);
}

export type QuickPickMode = "random" | "favorites" | "balanced";

/**
 * Fills group through champion with a coherent story (later rounds ⊆ earlier).
 * Bonus picks are left unchanged so participants choose those themselves.
 *
 * When `groupTeamCountryCodesByLetter` is provided (same source as the picks UI
 * and `fetchGroupTeamCountryCodesByLetter`), group 1st/2nd picks are chosen only
 * from that group's roster; third-place candidates are teams still in a group
 * after removing those 1st/2nd picks. When it is omitted or empty, behavior falls
 * back to the legacy global pool (all teams) for group slots.
 */
export function applyQuickPickToSlots(
  slots: KnockoutPickSlotDraft[],
  teams: Team[],
  mode: QuickPickMode,
  options?: {
    fillKnockoutProgression?: boolean;
    groupTeamCountryCodesByLetter?: Record<string, string[]>;
  },
): KnockoutPickSlotDraft[] {
  if (teams.length === 0) return slots;
  const fillKnockoutProgression = options?.fillKnockoutProgression !== false;
  const groupTeamCountryCodesByLetter = options?.groupTeamCountryCodesByLetter;
  const scheduleLoaded = scheduleGroupRostersLoaded(groupTeamCountryCodesByLetter);
  const groupMap = scheduleLoaded ? groupTeamCountryCodesByLetter! : null;

  const pool = orderedTeamsForMode(teams, mode);
  const used = new Set<string>();

  const groupWinnerByLetter = new Map<string, string>();
  const groupRunnerByLetter = new Map<string, string>();

  for (const letter of WC2026_GROUP_CODES) {
    if (scheduleLoaded && groupMap) {
      const groupTeams = teamsInScheduleGroup(letter, teams, groupMap);
      const avail = groupTeams.filter((t) => !used.has(t.id));
      const pickSource = avail.length >= 2 ? avail : groupTeams;
      const { winnerId: a, runnerId: b } = pickWinnerAndRunnerForGroup(
        mode,
        pickSource,
      );
      if (a && !used.has(a)) used.add(a);
      if (b && b !== a && !used.has(b)) used.add(b);
      groupWinnerByLetter.set(letter, a);
      groupRunnerByLetter.set(letter, b);
    } else {
      const avail = pool.filter((t) => !used.has(t.id));
      const pickSource = avail.length >= 2 ? avail : pool;
      const two = pickDistinctTeams(pickSource, 2);
      let a = two[0]?.id ?? "";
      let b = two[1]?.id ?? a;
      if (a && !used.has(a)) used.add(a);
      if (b && b !== a && !used.has(b)) used.add(b);
      if (!a && pool[0]) a = pool[0].id;
      if (!b && pool[1]) b = pool[1]!.id;
      groupWinnerByLetter.set(letter, a);
      groupRunnerByLetter.set(letter, b);
    }
  }

  if (scheduleLoaded && groupMap) {
    assertQuickPickGroupScheduleIntegrity(
      groupWinnerByLetter,
      groupRunnerByLetter,
      teams,
      groupMap,
    );
  }

  let thirdPoolTeams: Team[];
  if (scheduleLoaded && groupMap) {
    thirdPoolTeams = teams.filter((t) => {
      const gl = groupLetterForCountryCode(t.countryCode, groupMap);
      if (!gl) return false;
      const w = groupWinnerByLetter.get(gl) ?? "";
      const r = groupRunnerByLetter.get(gl) ?? "";
      return t.id !== w && t.id !== r;
    });
  } else {
    thirdPoolTeams = pool.filter((t) => !used.has(t.id));
  }

  const thirdOrdered = orderedTeamsForMode(thirdPoolTeams, mode);
  const thirdIds = pickNTeamIdsFromPool(
    thirdOrdered.length > 0 ? thirdOrdered : pool.filter((t) => !used.has(t.id)),
    8,
  );
  for (const id of thirdIds) used.add(id);

  const r32List: string[] = [];
  for (const letter of WC2026_GROUP_CODES) {
    const w = groupWinnerByLetter.get(letter) ?? "";
    const r = groupRunnerByLetter.get(letter) ?? "";
    if (w) r32List.push(w);
    if (r) r32List.push(r);
  }
  for (const id of thirdIds) r32List.push(id);
  while (r32List.length < 32) {
    const t = pool[r32List.length % pool.length]!;
    r32List.push(t.id);
  }
  r32List.splice(32);

  const r32Set = new Set(r32List);
  const r16PoolTeams = pool.filter((t) => r32Set.has(t.id));
  const r16Pick = pickDistinctTeams(
    r16PoolTeams.length > 0 ? r16PoolTeams : pool,
    16,
  );
  let r16Ids = r16Pick.map((t) => t.id);
  if (r16Ids.length < 16) {
    const extra = r32List.filter((id) => !r16Ids.includes(id));
    shuffleInPlace(extra);
    for (const id of extra) {
      if (r16Ids.length >= 16) break;
      r16Ids.push(id);
    }
  }
  r16Ids = r16Ids.slice(0, 16);

  const qfPoolTeams = pool.filter((t) => r16Ids.includes(t.id));
  let qfIds = pickDistinctTeams(
    qfPoolTeams.length > 0 ? qfPoolTeams : pool,
    8,
  ).map((t) => t.id);
  if (qfIds.length < 8) {
    const extra = r16Ids.filter((id) => !qfIds.includes(id));
    shuffleInPlace(extra);
    qfIds = [...qfIds, ...extra.slice(0, 8 - qfIds.length)];
  }
  qfIds = qfIds.slice(0, 8);

  const sfTeams = pickDistinctTeams(
    pool.filter((t) => qfIds.includes(t.id)),
    4,
  );
  let sfIds = sfTeams.map((t) => t.id);
  if (sfIds.length < 4) {
    const extra = qfIds.filter((id) => !sfIds.includes(id));
    sfIds = [...sfIds, ...extra.slice(0, 4 - sfIds.length)];
  }

  const fTeams = pickDistinctTeams(
    pool.filter((t) => sfIds.includes(t.id)),
    2,
  );
  let fIds = fTeams.map((t) => t.id);
  if (fIds.length < 2) {
    const extra = sfIds.filter((id) => !fIds.includes(id));
    fIds = [...fIds, ...extra.slice(0, 2 - fIds.length)];
  }

  const cTeams = pickDistinctTeams(
    pool.filter((t) => fIds.includes(t.id)),
    1,
  );
  const cId = cTeams[0]?.id ?? fIds[0] ?? "";

  let r32i = 0;
  let r16i = 0;
  let qi = 0;
  let si = 0;
  let fi = 0;

  const mapped = slots.map((row) => {
    const gc = row.groupCode ? row.groupCode.toUpperCase() : "";
    if (row.predictionKind === "group_winner" && gc) {
      const id = groupWinnerByLetter.get(gc) ?? "";
      return { ...row, teamId: id };
    }
    if (row.predictionKind === "group_runner_up" && gc) {
      const id = groupRunnerByLetter.get(gc) ?? "";
      return { ...row, teamId: id };
    }
    if (row.predictionKind === "third_place_qualifier") {
      const sk = parseInt(row.slotKey ?? "0", 10);
      const idx = Number.isFinite(sk) ? sk - 1 : 0;
      const id = thirdIds[idx] ?? "";
      return { ...row, teamId: id };
    }
    if (!fillKnockoutProgression && isKnockoutProgressionKind(row.predictionKind)) {
      return { ...row, teamId: "" };
    }
    if (row.predictionKind === "round_of_32") {
      const id = r32List[r32i] ?? "";
      r32i += 1;
      return { ...row, teamId: id };
    }
    if (row.predictionKind === "round_of_16") {
      const id = r16Ids[r16i] ?? "";
      r16i += 1;
      return { ...row, teamId: id };
    }
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
      return { ...row, teamId: cId };
    }
    return row;
  });

  return mapped;
}
