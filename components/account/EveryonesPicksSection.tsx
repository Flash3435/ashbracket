import Link from "next/link";
import { TeamFlagName } from "@/components/tournament/TeamFlagName";
import type { EveryonesPickEntry } from "@/lib/account/buildEveryonesPicksList";

type Props = {
  locked: boolean;
  participants: EveryonesPickEntry[];
};

function ParticipantSummaryLine({ entry }: { entry: EveryonesPickEntry }) {
  const parts: string[] = [];
  if (entry.championTeamName) {
    parts.push(`Champion: ${entry.championTeamName}`);
  }
  if (entry.groupPicksSummary) {
    parts.push(entry.groupPicksSummary);
  }
  if (entry.bonusComplete === true) {
    parts.push("Bonus complete");
  } else if (entry.bonusComplete === false) {
    parts.push("Bonus incomplete");
  }
  if (parts.length === 0) return null;
  return (
    <p className="mt-0.5 text-xs text-ash-muted">{parts.join(" · ")}</p>
  );
}

export function EveryonesPicksSection({ locked, participants }: Props) {
  return (
    <section className="rounded-xl border border-ash-border bg-ash-surface p-4">
      <h2 className="text-base font-bold text-ash-text">Everyone&apos;s picks</h2>
      <p className="mt-0.5 text-sm text-ash-muted">
        Browse each locked bracket in this pool and compare picks.
      </p>

      {!locked ? (
        <p className="mt-4 text-sm text-amber-100">
          Everyone&apos;s picks will be available after the pool locks.
        </p>
      ) : participants.length === 0 ? (
        <p className="mt-4 text-sm text-ash-muted">
          No participants in this pool yet.
        </p>
      ) : (
        <ul className="mt-4 divide-y divide-ash-border">
          {participants.map((entry) => (
            <li
              key={entry.participantId}
              className="flex flex-wrap items-start justify-between gap-3 py-3 first:pt-0 last:pb-0"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-ash-text">
                    {entry.displayName}
                  </span>
                  <span
                    className={
                      entry.statusLabel === "Complete"
                        ? "rounded-full bg-emerald-950/50 px-2 py-0.5 text-[11px] font-medium text-emerald-200 ring-1 ring-emerald-800/50"
                        : "rounded-full bg-ash-body/80 px-2 py-0.5 text-[11px] font-medium text-ash-muted ring-1 ring-ash-border"
                    }
                  >
                    {entry.statusLabel}
                  </span>
                </div>
                {entry.championTeamName ? (
                  <div className="mt-1">
                    <TeamFlagName
                      countryCode={entry.championTeamCode ?? ""}
                      teamName={entry.championTeamName}
                      nameClassName="text-xs text-ash-muted"
                    />
                  </div>
                ) : null}
                <ParticipantSummaryLine entry={entry} />
              </div>
              <Link
                href={entry.snapshotHref}
                className="btn-ghost inline-flex shrink-0 text-sm ring-1 ring-ash-border"
              >
                View picks
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
