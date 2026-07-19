import { labelParticipantBonusPick } from "@/lib/predictions/participantBonusLabels";
import type {
  TeamDisplayInfo,
  TournamentStatCategoryKey,
  TournamentStatLeaderTeam,
  TournamentStatLeadersView,
} from "./buildTournamentStatLeadersView";

export const STAT_DERIVED_BONUS_KEYS: readonly TournamentStatCategoryKey[] = [
  "most_goals",
  "most_yellow_cards",
  "most_red_cards",
];

export type BonusResultPreviewStatus =
  | "ready"
  | "no_data"
  | "unchanged"
  | "unsupported";

export type ExistingBonusResultRow = {
  teamId: string;
  teamName: string;
  countryCode: string;
  source: "manual" | "sync" | null;
  locked: boolean;
};

export type BonusResultPreviewRow = {
  bonusKey: TournamentStatCategoryKey;
  label: string;
  leaders: TournamentStatLeaderTeam[];
  total: number | null;
  /** @deprecated Prefer existingResultTeams — kept for single-winner callers. */
  existingResultTeam: TournamentStatLeaderTeam | null;
  existingResultTeams: TournamentStatLeaderTeam[];
  /** @deprecated Prefer proposedTeams — sole leader convenience. */
  proposedTeam: TournamentStatLeaderTeam | null;
  proposedTeams: TournamentStatLeaderTeam[];
  status: BonusResultPreviewStatus;
  warning: string | null;
};

export type BonusResultsFromTeamStatsPreview = {
  rows: BonusResultPreviewRow[];
  publishableCount: number;
  skippedCount: number;
};

export type BonusResultUpsertRow = {
  editionId: string;
  tournamentStageId: string;
  bonusKey: TournamentStatCategoryKey;
  teamId: string;
  resolvedAt: string;
};

function categoryFromView(
  view: TournamentStatLeadersView,
  key: TournamentStatCategoryKey,
): TournamentStatLeadersView["goals"] {
  if (key === "most_goals") return view.goals;
  if (key === "most_yellow_cards") return view.yellowCards;
  return view.redCards;
}

function teamIdsKey(teams: readonly { teamId: string }[]): string {
  return [...teams.map((t) => t.teamId)].sort().join("\0");
}

function formatLeaderNames(teams: readonly TournamentStatLeaderTeam[]): string {
  const names = teams.map((t) => t.teamName);
  if (names.length === 0) return "";
  if (names.length === 1) return names[0]!;
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
}

function categoryTieLabel(bonusKey: TournamentStatCategoryKey): string {
  if (bonusKey === "most_goals") return "most goals";
  if (bonusKey === "most_yellow_cards") return "most yellow cards";
  return "most red cards";
}

export function buildBonusResultsFromTeamStatsPreview(input: {
  leadersView: TournamentStatLeadersView;
  existingByBonusKey: ReadonlyMap<string, readonly ExistingBonusResultRow[]>;
  enabledBonusKeys: ReadonlySet<string>;
  teamInfoById: ReadonlyMap<string, TeamDisplayInfo>;
}): BonusResultsFromTeamStatsPreview {
  const rows: BonusResultPreviewRow[] = [];

  for (const bonusKey of STAT_DERIVED_BONUS_KEYS) {
    const label = labelParticipantBonusPick(bonusKey);
    const category = categoryFromView(input.leadersView, bonusKey);
    const leaders = category.leaders.map((l) => ({
      ...l,
      total: l.total,
    }));

    if (!input.enabledBonusKeys.has(bonusKey)) {
      rows.push({
        bonusKey,
        label,
        leaders,
        total: leaders[0]?.total ?? null,
        existingResultTeam: null,
        existingResultTeams: [],
        proposedTeam: null,
        proposedTeams: [],
        status: "unsupported",
        warning: "No pool on this edition scores this bonus category.",
      });
      continue;
    }

    const existingRows = [...(input.existingByBonusKey.get(bonusKey) ?? [])];
    const existingResultTeams = existingRows.map((existing) => ({
      teamId: existing.teamId,
      teamName: existing.teamName,
      countryCode: existing.countryCode,
      total: 0,
    }));
    const existingResultTeam = existingResultTeams[0] ?? null;

    if (leaders.length === 0) {
      rows.push({
        bonusKey,
        label,
        leaders: [],
        total: null,
        existingResultTeam,
        existingResultTeams,
        proposedTeam: null,
        proposedTeams: [],
        status: "no_data",
        warning: category.emptyMessage ?? "No stat data entered yet.",
      });
      continue;
    }

    const proposedTeams = leaders;
    const proposedTeam = proposedTeams[0] ?? null;
    const total = leaders[0]!.total;
    const sameSet =
      existingResultTeams.length === proposedTeams.length &&
      teamIdsKey(existingResultTeams) === teamIdsKey(proposedTeams);

    if (sameSet) {
      rows.push({
        bonusKey,
        label,
        leaders,
        total,
        existingResultTeam,
        existingResultTeams,
        proposedTeam,
        proposedTeams,
        status: "unchanged",
        warning:
          proposedTeams.length > 1
            ? `${formatLeaderNames(proposedTeams)} tied for ${categoryTieLabel(bonusKey)} — already published.`
            : null,
      });
      continue;
    }

    let warning: string | null = null;
    if (proposedTeams.length > 1) {
      warning = `${formatLeaderNames(proposedTeams)} tied for ${categoryTieLabel(bonusKey)} — all will be published as winning results.`;
    }
    if (existingResultTeams.length > 0) {
      const existingLabel = formatLeaderNames(existingResultTeams);
      const proposedLabel = formatLeaderNames(proposedTeams);
      const replace =
        existingResultTeams.length === 1 && proposedTeams.length === 1
          ? `Will replace published result ${existingLabel} with ${proposedLabel}.`
          : `Will replace published result(s) ${existingLabel} with ${proposedLabel}.`;
      warning = warning ? `${warning} ${replace}` : replace;
      const lockedManual = existingRows.some(
        (e) => e.locked && e.source === "manual",
      );
      if (lockedManual) {
        warning += " Existing result is locked manual.";
      }
    }

    rows.push({
      bonusKey,
      label,
      leaders,
      total,
      existingResultTeam,
      existingResultTeams,
      proposedTeam,
      proposedTeams,
      status: "ready",
      warning,
    });
  }

  const publishableCount = rows.filter((r) => r.status === "ready").length;
  const skippedCount = rows.length - publishableCount;

  return { rows, publishableCount, skippedCount };
}

export function upsertRowsFromBonusPreview(
  preview: BonusResultsFromTeamStatsPreview,
  editionId: string,
  groupStageId: string,
  resolvedAt: string,
): BonusResultUpsertRow[] {
  const out: BonusResultUpsertRow[] = [];
  for (const row of preview.rows) {
    if (row.status !== "ready") continue;
    for (const team of row.proposedTeams) {
      out.push({
        editionId,
        tournamentStageId: groupStageId,
        bonusKey: row.bonusKey,
        teamId: team.teamId,
        resolvedAt,
      });
    }
  }
  return out;
}

/** Team IDs that should be removed for ready categories (stale published winners). */
export function staleBonusResultTeamIdsFromPreview(
  preview: BonusResultsFromTeamStatsPreview,
): Map<TournamentStatCategoryKey, string[]> {
  const out = new Map<TournamentStatCategoryKey, string[]>();
  for (const row of preview.rows) {
    if (row.status !== "ready") continue;
    const proposed = new Set(row.proposedTeams.map((t) => t.teamId));
    const stale = row.existingResultTeams
      .map((t) => t.teamId)
      .filter((id) => !proposed.has(id));
    if (stale.length > 0) out.set(row.bonusKey, stale);
  }
  return out;
}

export function mapExistingBonusResultRow(
  row: {
    team_id: string;
    slot_key: string | null;
    source?: string | null;
    locked?: boolean | null;
  },
  teamInfoById: ReadonlyMap<string, TeamDisplayInfo>,
): { bonusKey: string; existing: ExistingBonusResultRow } | null {
  const bonusKey = (row.slot_key ?? "").trim();
  if (!bonusKey) return null;
  const info = teamInfoById.get(row.team_id as string);
  return {
    bonusKey,
    existing: {
      teamId: row.team_id as string,
      teamName: info?.name ?? "Unknown team",
      countryCode: info?.countryCode ?? "",
      source:
        row.source === "manual" || row.source === "sync" ? row.source : null,
      locked: Boolean(row.locked),
    },
  };
}

export function existingBonusResultsMap(
  rows: Array<{
    team_id: string;
    slot_key: string | null;
    source?: string | null;
    locked?: boolean | null;
  }>,
  teamInfoById: ReadonlyMap<string, TeamDisplayInfo>,
): Map<string, ExistingBonusResultRow[]> {
  const out = new Map<string, ExistingBonusResultRow[]>();
  for (const row of rows) {
    const mapped = mapExistingBonusResultRow(row, teamInfoById);
    if (!mapped) continue;
    const list = out.get(mapped.bonusKey) ?? [];
    list.push(mapped.existing);
    out.set(mapped.bonusKey, list);
  }
  for (const list of out.values()) {
    list.sort((a, b) => a.teamId.localeCompare(b.teamId));
  }
  return out;
}
