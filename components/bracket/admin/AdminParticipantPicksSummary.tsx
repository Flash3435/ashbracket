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

function summaryHeading(label: string, count: number): string {
  return `${label} (${count})`;
}

function SummaryList({
  label,
  count,
  items,
  emptyText,
  tone = "default",
}: {
  label: string;
  count: number;
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
      <p className="text-[10px] font-semibold uppercase tracking-wide text-ash-muted">
        {summaryHeading(label, count)}
      </p>
      {items.length > 0 ? (
        <ul className={`mt-1 space-y-0.5 text-xs ${toneClass}`}>
          {items.map((item) => (
            <li key={item} title={item}>
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
  const championItems = summary.championPick ? [buildChampionLabel(summary)] : [];

  return (
    <div className="rounded-xl border border-ash-border bg-ash-body/25 p-4 sm:p-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-ash-muted">
        Participant pick summary
      </p>
      <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
        <SummaryList
          label="Champion pick"
          count={championItems.length}
          items={championItems}
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
          count={summary.finalPicks.length}
          items={summary.finalPicks}
          emptyText="No final picks saved"
        />
        <SummaryList
          label="Remaining live picks"
          count={summary.livePicks.length}
          items={summary.livePicks}
          emptyText="None still alive"
          tone="success"
        />
        <SummaryList
          label="Eliminated picks"
          count={summary.eliminatedPicks.length}
          items={summary.eliminatedPicks}
          emptyText="None eliminated yet"
          tone="error"
        />
        <SummaryList
          label="Missing picks"
          count={summary.missingSlots.length}
          items={summary.missingSlots}
          emptyText="All slots filled"
          tone="muted"
        />
        <SummaryList
          label="Out picks (not in match slot)"
          count={summary.stalePicks.length}
          items={summary.stalePicks}
          emptyText="None"
          tone="warning"
        />
      </div>
    </div>
  );
}
