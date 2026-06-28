import type { Team } from "../../src/types/domain";
import type { KnockoutPickSlotDraft } from "../../types/adminKnockoutPicks";
import type { ParticipantPickSlotPayload } from "../../types/knockoutPicksSave";
import { WC2026_GROUP_CODES } from "../tournament/wc2026GroupCodes";
import { isKnockoutProgressionKind } from "./knockoutProgressionKinds";
import { pruneOfficialKnockoutPathPicks } from "./pruneOfficialKnockoutPathPicks";

/** Shown in the third-place team chooser when a team is not eligible. */
export const THIRD_PLACE_DISABLED_WINNER =
  "Already picked as group winner";
export const THIRD_PLACE_DISABLED_RUNNER =
  "Already picked as group runner-up";
export const THIRD_PLACE_DISABLED_OTHER_SLOT =
  "Already selected as third-place advancer";
export const THIRD_PLACE_DISABLED_MAX_SELECTED =
  "Maximum selected";
export const THIRD_PLACE_ROW_MAX_SELECTED_EXPLANATION =
  "Clear one of your current eight to choose from this group.";

export type ThirdPlacePickChooserEntry = {
  team: Team;
  disabled?: boolean;
  disabledReason?: string;
};

/** Third-place chooser section: one tournament group and its candidate teams. */
export type ThirdPlacePickChooserGroup = {
  /** Uppercase group letter, or `"_"` when the schedule map is not loaded. */
  groupLetter: string;
  /** e.g. "Group A" */
  heading: string;
  entries: ThirdPlacePickChooserEntry[];
};

export type GroupTeamCountryCodesByLetter = Record<string, string[]>;

/** True when official group rosters are available (same signal as the group-stage pickers). */
export function isGroupScheduleLoaded(
  groupTeamCountryCodesByLetter: Record<string, string[]> | undefined,
): boolean {
  return Boolean(
    groupTeamCountryCodesByLetter &&
      Object.keys(groupTeamCountryCodesByLetter).length > 0,
  );
}

function countryCodeToGroupLetter(
  groupTeamCountryCodesByLetter: Record<string, string[]>,
): Map<string, string> {
  const m = new Map<string, string>();
  for (const [letter, codes] of Object.entries(groupTeamCountryCodesByLetter)) {
    const L = letter.toUpperCase();
    for (const c of codes) {
      m.set(c.toUpperCase(), L);
    }
  }
  return m;
}

function normalizedGroupLetter(value: string | null | undefined): string {
  return (value ?? "").trim().toUpperCase();
}

export function buildTeamIdToGroupLetter(
  teams: Team[],
  groupTeamCountryCodesByLetter: GroupTeamCountryCodesByLetter | undefined,
): Map<string, string> {
  if (!isGroupScheduleLoaded(groupTeamCountryCodesByLetter)) {
    return new Map<string, string>();
  }
  const codeToLetter = countryCodeToGroupLetter(groupTeamCountryCodesByLetter!);
  const out = new Map<string, string>();
  for (const team of teams) {
    const letter = codeToLetter.get(team.countryCode.toUpperCase());
    if (letter) out.set(team.id, letter);
  }
  return out;
}

function makeThirdPlacePickChooserEntries(
  row: KnockoutPickSlotDraft,
  slots: KnockoutPickSlotDraft[],
  allTeams: Team[],
): ThirdPlacePickChooserEntry[] {
  return allTeams.map((team) => {
    const reason = thirdPlacePickDisabledReason(team.id, row, slots);
    if (reason) {
      return { team, disabled: true, disabledReason: reason };
    }
    return { team };
  });
}

const BRACKET_DEDUPE_KINDS = new Set([
  "round_of_32",
  "round_of_16",
  "quarterfinalist",
  "semifinalist",
  "finalist",
  "third_place_qualifier",
]);

function idsForKind(
  slots: KnockoutPickSlotDraft[],
  kind: string,
): Set<string> {
  const s = new Set<string>();
  for (const row of slots) {
    const id = row.teamId.trim();
    if (id && row.predictionKind === kind) s.add(id);
  }
  return s;
}

/** Teams picked as 1st or 2nd in any group (for constraining later rounds). */
export function advancingFromGroups(slots: KnockoutPickSlotDraft[]): Set<string> {
  const s = new Set<string>();
  for (const row of slots) {
    if (
      (row.predictionKind === "group_winner" ||
        row.predictionKind === "group_runner_up") &&
      row.teamId.trim()
    ) {
      s.add(row.teamId.trim());
    }
  }
  return s;
}

export function thirdPlaceIds(slots: KnockoutPickSlotDraft[]): Set<string> {
  return idsForKind(slots, "third_place_qualifier");
}

export function selectedThirdPlaceCount(slots: KnockoutPickSlotDraft[]): number {
  let n = 0;
  for (const row of slots) {
    if (
      row.predictionKind === "third_place_qualifier" &&
      row.teamId.trim()
    ) {
      n += 1;
    }
  }
  return n;
}

/** Union of group advancers and third-place picks — intended Round of 32 pool. */
export function eligibleRoundOf32Pool(slots: KnockoutPickSlotDraft[]): Set<string> {
  const u = new Set<string>();
  for (const x of advancingFromGroups(slots)) u.add(x);
  for (const x of thirdPlaceIds(slots)) u.add(x);
  return u;
}

/**
 * Why picking `teamId` in this third-place slot is blocked (null = allowed for conflicts).
 * The current row’s existing selection is always allowed so the user can keep it until they change groups or pick another team.
 */
export function thirdPlacePickDisabledReason(
  teamId: string,
  row: KnockoutPickSlotDraft,
  slots: KnockoutPickSlotDraft[],
): string | null {
  const id = teamId.trim();
  if (!id) return null;
  if (id === row.teamId.trim()) return null;

  const selectedElsewhere = slots.filter(
    (s) =>
      s.predictionKind === "third_place_qualifier" &&
      s.rowKey !== row.rowKey &&
      s.teamId.trim(),
  ).length;
  if (!row.teamId.trim() && selectedElsewhere >= 8) {
    return THIRD_PLACE_DISABLED_MAX_SELECTED;
  }

  for (const s of slots) {
    if (
      s.predictionKind === "third_place_qualifier" &&
      s.rowKey !== row.rowKey &&
      s.teamId.trim() === id
    ) {
      return THIRD_PLACE_DISABLED_OTHER_SLOT;
    }
  }
  for (const s of slots) {
    if (s.predictionKind === "group_winner" && s.teamId.trim() === id) {
      return THIRD_PLACE_DISABLED_WINNER;
    }
    if (s.predictionKind === "group_runner_up" && s.teamId.trim() === id) {
      return THIRD_PLACE_DISABLED_RUNNER;
    }
  }
  return null;
}

export function thirdPlaceRowUnavailableReason(
  row: KnockoutPickSlotDraft,
  slots: KnockoutPickSlotDraft[],
): string | null {
  if (row.predictionKind !== "third_place_qualifier") return null;
  if (row.teamId.trim()) return null;
  if (selectedThirdPlaceCount(slots) >= 8) {
    return THIRD_PLACE_ROW_MAX_SELECTED_EXPLANATION;
  }
  return null;
}

export function buildThirdPlacePickChooserOptionsForGroup(
  row: KnockoutPickSlotDraft,
  slots: KnockoutPickSlotDraft[],
  allTeams: Team[],
  groupTeamCountryCodesByLetter?: GroupTeamCountryCodesByLetter,
): ThirdPlacePickChooserEntry[] {
  const groupLetter = normalizedGroupLetter(row.groupCode);
  if (!groupLetter || !isGroupScheduleLoaded(groupTeamCountryCodesByLetter)) {
    return [];
  }

  const codes = groupTeamCountryCodesByLetter![groupLetter] ?? [];
  const allowedCodes = new Set(codes.map((c) => c.toUpperCase()));
  const blockedTopTwo = new Set(
    slots
      .filter(
        (s) =>
          normalizedGroupLetter(s.groupCode) === groupLetter &&
          (s.predictionKind === "group_winner" ||
            s.predictionKind === "group_runner_up") &&
          s.teamId.trim(),
      )
      .map((s) => s.teamId.trim()),
  );

  return allTeams
    .filter(
      (team) =>
        allowedCodes.has(team.countryCode.toUpperCase()) &&
        !blockedTopTwo.has(team.id),
    )
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((team) => {
      const reason = thirdPlacePickDisabledReason(team.id, row, slots);
      if (reason) {
        return { team, disabled: true, disabledReason: reason };
      }
      return { team };
    });
}

/** Flat list of all teams with disabled flags, sorted alphabetically by name. */
export function buildThirdPlacePickChooserOptions(
  row: KnockoutPickSlotDraft,
  slots: KnockoutPickSlotDraft[],
  allTeams: Team[],
): ThirdPlacePickChooserEntry[] {
  const entries = makeThirdPlacePickChooserEntries(row, slots, allTeams);
  return [...entries].sort((a, b) =>
    a.team.name.localeCompare(b.team.name),
  );
}

/**
 * Third-place candidates grouped by group-stage letter (A–L), then name within each group.
 * When the official group schedule is not loaded, returns a single "All teams" section
 * (same members as {@link buildThirdPlacePickChooserOptions}, alphabetical).
 */
export function buildThirdPlacePickChooserOptionGroups(
  row: KnockoutPickSlotDraft,
  slots: KnockoutPickSlotDraft[],
  allTeams: Team[],
  groupTeamCountryCodesByLetter?: Record<string, string[]>,
): ThirdPlacePickChooserGroup[] {
  const specificGroup = normalizedGroupLetter(row.groupCode);
  if (specificGroup) {
    return [
      {
        groupLetter: specificGroup,
        heading: `Group ${specificGroup}`,
        entries: buildThirdPlacePickChooserOptionsForGroup(
          row,
          slots,
          allTeams,
          groupTeamCountryCodesByLetter,
        ),
      },
    ];
  }

  const entries = makeThirdPlacePickChooserEntries(row, slots, allTeams);
  if (!isGroupScheduleLoaded(groupTeamCountryCodesByLetter)) {
    return [
      {
        groupLetter: "_",
        heading: "All teams",
        entries: [...entries].sort((a, b) =>
          a.team.name.localeCompare(b.team.name),
        ),
      },
    ];
  }

  const map = groupTeamCountryCodesByLetter!;
  const codeToLetter = countryCodeToGroupLetter(map);
  const assigned = new Set<string>();
  const wcPresent = WC2026_GROUP_CODES.filter(
    (L) => (map[L]?.length ?? 0) > 0,
  );
  const extraLetters = Object.keys(map)
    .map((k) => k.toUpperCase())
    .filter((k) => !(WC2026_GROUP_CODES as readonly string[]).includes(k));
  extraLetters.sort((a, b) => a.localeCompare(b));
  const letterOrder = [...wcPresent, ...extraLetters];

  const groups: ThirdPlacePickChooserGroup[] = [];
  for (const letter of letterOrder) {
    const upper = letter.toUpperCase();
    const groupEntries = entries.filter(
      (e) => codeToLetter.get(e.team.countryCode.toUpperCase()) === upper,
    );
    groupEntries.sort((a, b) => a.team.name.localeCompare(b.team.name));
    for (const e of groupEntries) assigned.add(e.team.id);
    groups.push({
      groupLetter: upper,
      heading: `Group ${upper}`,
      entries: groupEntries,
    });
  }

  const other = entries
    .filter((e) => !assigned.has(e.team.id))
    .sort((a, b) => a.team.name.localeCompare(b.team.name));
  if (other.length > 0) {
    groups.push({
      groupLetter: "__OTHER__",
      heading: "Other teams",
      entries: other,
    });
  }
  return groups;
}

/**
 * If this third-place slot’s saved team conflicts with group picks or another third slot, return a short reason for inline UI.
 */
export function thirdPlaceSlotInvalidReason(
  row: KnockoutPickSlotDraft,
  slots: KnockoutPickSlotDraft[],
  options?: { teamIdToGroupLetter?: Map<string, string> },
): string | null {
  const id = row.teamId.trim();
  if (!id) return null;

  const groupLetter = normalizedGroupLetter(row.groupCode);
  const actualGroup = options?.teamIdToGroupLetter?.get(id);
  if (groupLetter && actualGroup && groupLetter !== actualGroup) {
    return `Does not belong to Group ${groupLetter}`;
  }

  let winner = false;
  let runner = false;
  for (const s of slots) {
    if (s.predictionKind === "group_winner" && s.teamId.trim() === id) {
      winner = true;
    }
    if (s.predictionKind === "group_runner_up" && s.teamId.trim() === id) {
      runner = true;
    }
  }
  if (winner) return THIRD_PLACE_DISABLED_WINNER;
  if (runner) return THIRD_PLACE_DISABLED_RUNNER;

  const dup = slots.some(
    (s) =>
      s.predictionKind === "third_place_qualifier" &&
      s.rowKey !== row.rowKey &&
      s.teamId.trim() === id,
  );
  if (dup) return THIRD_PLACE_DISABLED_OTHER_SLOT;

  return null;
}

/** Server-side: third-place teams must be distinct and cannot match any group 1st/2nd pick. */
export function validateParticipantSlotsThirdPlaceRules(
  slots: ParticipantPickSlotPayload[],
): string | null {
  const advancing = new Set<string>();
  for (const s of slots) {
    const tid = s.teamId.trim();
    if (!tid) continue;
    if (
      s.predictionKind === "group_winner" ||
      s.predictionKind === "group_runner_up"
    ) {
      advancing.add(tid);
    }
  }
  const seenThird = new Set<string>();
  const seenThirdGroups = new Set<string>();
  for (const s of slots) {
    if (s.predictionKind !== "third_place_qualifier") continue;
    const tid = s.teamId.trim();
    if (!tid) continue;
    const gc = normalizedGroupLetter(s.groupCode);
    if (gc) {
      if (seenThirdGroups.has(gc)) {
        return `Only one third-place team can be selected for Group ${gc}.`;
      }
      seenThirdGroups.add(gc);
    }
    if (advancing.has(tid)) {
      return "A third-place advancer cannot be a team you already picked first or second in a group. Clear or change the conflicting group or third-place picks.";
    }
    if (seenThird.has(tid)) {
      return "Each third-place advancer must be a different team.";
    }
    seenThird.add(tid);
  }
  return null;
}

export function normalizeParticipantThirdPlaceSaveSlots(input: {
  slots: ParticipantPickSlotPayload[];
  teams: Team[];
  groupTeamCountryCodesByLetter: GroupTeamCountryCodesByLetter;
}):
  | {
      ok: true;
      thirdStageIds: string[];
      normalizedThirdSlots: ParticipantPickSlotPayload[];
    }
  | { ok: false; error: string } {
  const { slots, teams, groupTeamCountryCodesByLetter } = input;
  const thirdStageIds = new Set(
    slots
      .filter((slot) => slot.predictionKind === "third_place_qualifier")
      .map((slot) => slot.tournamentStageId),
  );
  const selectedThirdSlots = slots.filter(
    (slot) =>
      slot.predictionKind === "third_place_qualifier" && slot.teamId.trim(),
  );
  if (!isGroupScheduleLoaded(groupTeamCountryCodesByLetter)) {
    if (selectedThirdSlots.length === 0) {
      return {
        ok: true,
        thirdStageIds: [...thirdStageIds],
        normalizedThirdSlots: [],
      };
    }
    return {
      ok: false,
      error:
        "Third-place picks cannot be saved until the official group rosters are loaded.",
    };
  }

  const teamIdToGroupLetter = buildTeamIdToGroupLetter(
    teams,
    groupTeamCountryCodesByLetter,
  );
  const advancing = new Set<string>();
  for (const slot of slots) {
    const tid = slot.teamId.trim();
    if (!tid) continue;
    if (
      slot.predictionKind === "group_winner" ||
      slot.predictionKind === "group_runner_up"
    ) {
      advancing.add(tid);
    }
  }

  const seenThirdTeamIds = new Set<string>();
  const normalizedByStageAndGroup = new Map<string, ParticipantPickSlotPayload>();

  for (const slot of slots) {
    if (slot.predictionKind !== "third_place_qualifier") continue;

    const tid = slot.teamId.trim();
    if (!tid) continue;

    const actualGroup = teamIdToGroupLetter.get(tid);
    if (!actualGroup) {
      return {
        ok: false,
        error:
          "A third-place pick must belong to one of the official World Cup groups.",
      };
    }

    const requestedGroup = normalizedGroupLetter(slot.groupCode);
    if (requestedGroup && requestedGroup !== actualGroup) {
      return {
        ok: false,
        error: `Selected team does not belong to Group ${requestedGroup}.`,
      };
    }

    if (advancing.has(tid)) {
      return {
        ok: false,
        error:
          "A third-place advancer cannot be a team you already picked first or second in a group. Clear or change the conflicting group or third-place picks.",
      };
    }

    if (seenThirdTeamIds.has(tid)) {
      return {
        ok: false,
        error: "Each third-place advancer must be a different team.",
      };
    }
    seenThirdTeamIds.add(tid);

    const key = `${slot.tournamentStageId}\0${actualGroup}`;
    if (normalizedByStageAndGroup.has(key)) {
      return {
        ok: false,
        error: `Only one third-place team can be selected for Group ${actualGroup}.`,
      };
    }
    normalizedByStageAndGroup.set(key, {
      predictionKind: "third_place_qualifier",
      tournamentStageId: slot.tournamentStageId,
      slotKey: null,
      groupCode: actualGroup,
      bonusKey: null,
      teamId: tid,
    });
  }

  return {
    ok: true,
    thirdStageIds: [...thirdStageIds],
    normalizedThirdSlots: [...normalizedByStageAndGroup.values()],
  };
}

function thirdPlaceDuplicateRowKeys(slots: KnockoutPickSlotDraft[]): Set<string> {
  const seen = new Set<string>();
  const clearKeys = new Set<string>();
  for (const row of slots) {
    if (row.predictionKind !== "third_place_qualifier") continue;
    const id = row.teamId.trim();
    if (!id) continue;
    if (seen.has(id)) clearKeys.add(row.rowKey);
    else seen.add(id);
  }
  return clearKeys;
}

/**
 * Clears picks that no longer fit after earlier rounds or groups change.
 */
export function pruneParticipantPicks(
  slots: KnockoutPickSlotDraft[],
  options?: { freezeKnockoutProgressionPicks?: boolean },
): KnockoutPickSlotDraft[] {
  const advancing = advancingFromGroups(slots);
  const eligibleR32 = eligibleRoundOf32Pool(slots);
  const thirdDupKeys = thirdPlaceDuplicateRowKeys(slots);

  const afterBasics = slots.map((row) => {
    if (
      options?.freezeKnockoutProgressionPicks &&
      isKnockoutProgressionKind(row.predictionKind)
    ) {
      return row;
    }
    const id = row.teamId.trim();
    if (!id) return row;

    if (row.predictionKind === "third_place_qualifier") {
      if (advancing.has(id)) return { ...row, teamId: "" };
      if (thirdDupKeys.has(row.rowKey)) return { ...row, teamId: "" };
      return row;
    }

    if (
      row.predictionKind === "round_of_32" &&
      eligibleR32.size > 0 &&
      !eligibleR32.has(id)
    ) {
      return { ...row, teamId: "" };
    }

    return row;
  });

  if (options?.freezeKnockoutProgressionPicks) {
    return afterBasics;
  }

  return pruneOfficialKnockoutPathPicks(afterBasics).slots;
}

/** @deprecated Use pruneParticipantPicks */
export function pruneKnockoutSlotsAfterBracketChange(
  slots: KnockoutPickSlotDraft[],
): KnockoutPickSlotDraft[] {
  return pruneParticipantPicks(slots);
}

/**
 * Sets a team on one slot; clears duplicates in the same round or the other finish slot in the same group.
 */
export function assignParticipantPickDeduped(
  slots: KnockoutPickSlotDraft[],
  rowKey: string,
  teamId: string,
  options?: { freezeKnockoutProgressionPicks?: boolean },
): KnockoutPickSlotDraft[] {
  const target = slots.find((s) => s.rowKey === rowKey);
  if (!target) return slots;

  const next = slots.map((s) => {
    if (s.rowKey === rowKey) return { ...s, teamId };
    if (
      target.groupCode &&
      s.groupCode === target.groupCode &&
      (target.predictionKind === "group_winner" ||
        target.predictionKind === "group_runner_up") &&
      (s.predictionKind === "group_winner" ||
        s.predictionKind === "group_runner_up") &&
      teamId.trim() &&
      s.teamId === teamId
    ) {
      return { ...s, teamId: "" };
    }
    if (
      BRACKET_DEDUPE_KINDS.has(target.predictionKind) &&
      s.predictionKind === target.predictionKind &&
      teamId.trim() &&
      s.teamId === teamId &&
      s.rowKey !== rowKey
    ) {
      return { ...s, teamId: "" };
    }
    return s;
  });

  return pruneParticipantPicks(next, options);
}

/** @deprecated Use assignParticipantPickDeduped */
export const assignKnockoutTeamDeduped = assignParticipantPickDeduped;
