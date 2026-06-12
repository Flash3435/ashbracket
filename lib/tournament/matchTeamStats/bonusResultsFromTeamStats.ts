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
  | "tie"
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
  existingResultTeam: TournamentStatLeaderTeam | null;
  proposedTeam: TournamentStatLeaderTeam | null;
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

export function buildBonusResultsFromTeamStatsPreview(input: {
  leadersView: TournamentStatLeadersView;
  existingByBonusKey: ReadonlyMap<string, ExistingBonusResultRow>;
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
        total: leaders.length === 1 ? leaders[0]!.total : null,
        existingResultTeam: null,
        proposedTeam: null,
        status: "unsupported",
        warning: "No pool on this edition scores this bonus category.",
      });
      continue;
    }

    const existing = input.existingByBonusKey.get(bonusKey);
    const existingResultTeam = existing
      ? {
          teamId: existing.teamId,
          teamName: existing.teamName,
          countryCode: existing.countryCode,
          total: 0,
        }
      : null;

    if (leaders.length === 0) {
      rows.push({
        bonusKey,
        label,
        leaders: [],
        total: null,
        existingResultTeam,
        proposedTeam: null,
        status: "no_data",
        warning: category.emptyMessage ?? "No stat data entered yet.",
      });
      continue;
    }

    if (leaders.length > 1) {
      const tiedTotal = leaders[0]!.total;
      rows.push({
        bonusKey,
        label,
        leaders,
        total: tiedTotal,
        existingResultTeam,
        proposedTeam: null,
        status: "tie",
        warning:
          "Tied for first — needs manual decision. Resolve the tie before publishing.",
      });
      continue;
    }

    const proposedTeam = leaders[0]!;
    if (existingResultTeam && existingResultTeam.teamId === proposedTeam.teamId) {
      rows.push({
        bonusKey,
        label,
        leaders,
        total: proposedTeam.total,
        existingResultTeam,
        proposedTeam,
        status: "unchanged",
        warning: null,
      });
      continue;
    }

    let warning: string | null = null;
    if (existingResultTeam) {
      warning = `Will replace published result ${existingResultTeam.teamName} with ${proposedTeam.teamName}.`;
      if (existing?.locked && existing.source === "manual") {
        warning += " Existing result is locked manual.";
      }
    }

    rows.push({
      bonusKey,
      label,
      leaders,
      total: proposedTeam.total,
      existingResultTeam,
      proposedTeam,
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
  return preview.rows
    .filter((row) => row.status === "ready" && row.proposedTeam)
    .map((row) => ({
      editionId,
      tournamentStageId: groupStageId,
      bonusKey: row.bonusKey,
      teamId: row.proposedTeam!.teamId,
      resolvedAt,
    }));
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
): Map<string, ExistingBonusResultRow> {
  const out = new Map<string, ExistingBonusResultRow>();
  for (const row of rows) {
    const mapped = mapExistingBonusResultRow(row, teamInfoById);
    if (mapped) out.set(mapped.bonusKey, mapped.existing);
  }
  return out;
}
