import type { PoolMembershipCompletionStatus } from "../picks/poolMembershipCompletionStatus";

export type EveryonesPickEntry = {
  participantId: string;
  displayName: string;
  statusLabel: "Complete" | "Incomplete at lock";
  championTeamName: string | null;
  championTeamCode?: string;
  /** e.g. "24/24 group picks" when section data is available. */
  groupPicksSummary: string | null;
  bonusComplete: boolean | null;
  snapshotHref: string;
};

export type BuildEveryonesPicksListInput = {
  locked: boolean;
  participantRows: Array<{ id: string; display_name: string | null }>;
  completeParticipantIds: string[];
  championByParticipantId: Map<
    string,
    { teamName: string; teamCode?: string }
  >;
  completionByParticipantId?: Map<string, PoolMembershipCompletionStatus>;
};

/** Read-only bracket snapshot for a pool participant (peer access enforced by RPC/RLS). */
export function participantBracketSnapshotHref(
  participantId: string,
  from = "reveal",
): string {
  const trimmed = participantId.trim();
  if (!from.trim()) return `/participant/${trimmed}/snapshot`;
  return `/participant/${trimmed}/snapshot?from=${encodeURIComponent(from)}`;
}

function displayNameFromRow(
  rows: Array<{ id: string; display_name: string | null }>,
  participantId: string,
): string {
  const row = rows.find((r) => r.id === participantId);
  return (row?.display_name ?? "").trim() || "Participant";
}

function groupPicksSummaryFromStatus(
  status: PoolMembershipCompletionStatus | undefined,
): string | null {
  const group = status?.sections.find((s) => s.id === "group");
  if (!group || group.total <= 0) return null;
  return `${group.filled}/${group.total} group picks`;
}

function bonusCompleteFromStatus(
  status: PoolMembershipCompletionStatus | undefined,
): boolean | null {
  const bonus = status?.sections.find((s) => s.id === "bonus");
  if (!bonus?.required) return null;
  return bonus.complete;
}

/**
 * Builds the post-lock participant list for the reveal page.
 * Returns an empty list before lock so no peer pick metadata is exposed early.
 */
export function buildEveryonesPicksList(
  input: BuildEveryonesPicksListInput,
): EveryonesPickEntry[] {
  if (!input.locked) return [];

  const completeSet = new Set(input.completeParticipantIds);
  const sorted = [...input.participantRows].sort((a, b) =>
    displayNameFromRow([a], a.id).localeCompare(displayNameFromRow([b], b.id)),
  );

  return sorted.map((row) => {
    const status = input.completionByParticipantId?.get(row.id);
    const champion = input.championByParticipantId.get(row.id);
    return {
      participantId: row.id,
      displayName: displayNameFromRow(input.participantRows, row.id),
      statusLabel: completeSet.has(row.id) ? "Complete" : "Incomplete at lock",
      championTeamName: champion?.teamName ?? null,
      championTeamCode: champion?.teamCode,
      groupPicksSummary: groupPicksSummaryFromStatus(status),
      bonusComplete: bonusCompleteFromStatus(status),
      snapshotHref: participantBracketSnapshotHref(row.id),
    };
  });
}
