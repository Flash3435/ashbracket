import {
  buildAdminParticipantPicksSummary,
  type AdminParticipantPicksSummary,
} from "../../../lib/bracket/adminBracketDisplay";
import type { LiveBracketTrackerModel } from "../../../lib/bracket/liveBracketTracker";
import type { Team } from "../../../src/types/domain";

type Props = {
  tracker: LiveBracketTrackerModel;
  teamById: Map<string, Team>;
};

function SummaryList({
  label,
  items,
  emptyText,
  tone = "default",
}: {
  label: string;
  items: string[];
  emptyText: string;
  tone?: "default" | "success" | "warning" | "error" | "muted";
}) {
  const toneClass =
    tone === "success"
      ? "text-emerald-200"
      : tone === "warning"
        ? "text-amber-200"
        : tone === "error"
          ? "text-red-200"
          : tone === "muted"
            ? "text-ash-muted"
            : "text-ash-text";

  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-ash-muted">{label}</p>
      {items.length > 0 ? (
        <ul className={`mt-1 space-y-0.5 text-xs ${toneClass}`}>
          {items.map((item) => (
            <li key={item} className="truncate" title={item}>
              {item}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-1 text-xs italic text-ash-muted">{emptyText}</p>
      )}
    </div>
  );
}

function buildChampionLabel(summary: AdminParticipantPicksSummary): string {
  if (!summary.championPick) return "None saved";
  if (summary.championStatus === "unreachable") {
    return `${summary.championPick} (unreachable)`;
  }
  return summary.championPick;
}

export function AdminParticipantPicksSummary({ tracker, teamById }: Props) {
  const summary = buildAdminParticipantPicksSummary(tracker, teamById);

  return (
    <div className="rounded-xl border border-ash-border bg-ash-body/25 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-ash-muted">
        Participant pick summary
      </p>
      <div className="mt-3 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <SummaryList
          label="Champion pick"
          items={summary.championPick ? [buildChampionLabel(summary)] : []}
          emptyText="No champion pick saved"
          tone={
            summary.championStatus === "unreachable"
              ? "warning"
              : summary.championPick
                ? "success"
                : "muted"
          }
        />
        <SummaryList
          label="Final / finalist picks"
          items={summary.finalPicks}
          emptyText="No final picks saved"
        />
        <SummaryList
          label="Remaining live picks"
          items={summary.livePicks}
          emptyText="None still alive"
          tone="success"
        />
        <SummaryList
          label="Eliminated picks"
          items={summary.eliminatedPicks}
          emptyText="None eliminated yet"
          tone="error"
        />
        <SummaryList
          label="Missing picks"
          items={summary.missingSlots}
          emptyText="All slots filled"
          tone="muted"
        />
        <SummaryList
          label="Stale / path-invalid picks"
          items={summary.stalePicks}
          emptyText="None"
          tone="warning"
        />
      </div>
    </div>
  );
}
