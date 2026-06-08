import type { AdminImpactSummary } from "@/lib/admin/fetchAdminImpactSummary";

type Props = {
  impact: AdminImpactSummary;
  title?: string;
  className?: string;
};

export function AdminImpactSummaryCard({
  impact,
  title = "Before you continue",
  className = "",
}: Props) {
  const borderClass = impact.isSimulation
    ? "border-amber-600/50 bg-amber-950/25"
    : "border-emerald-800/50 bg-emerald-950/20";

  return (
    <section
      className={`rounded-lg border px-4 py-3 text-sm ${borderClass} ${className}`}
      aria-label="Action impact summary"
    >
      <h3 className="font-semibold text-ash-text">{title}</h3>
      <dl className="mt-3 grid gap-2 text-ash-muted sm:grid-cols-2">
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide">Data mode</dt>
          <dd className="mt-0.5 font-medium text-ash-text">
            {impact.modeLabel}
            {impact.isSimulation ? " · test data" : " · official"}
          </dd>
        </div>
        {impact.editionName ? (
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide">Edition</dt>
            <dd className="mt-0.5 text-ash-text">
              {impact.editionName}
              {impact.editionCode ? (
                <span className="ml-1 font-mono text-xs text-ash-muted">
                  ({impact.editionCode})
                </span>
              ) : null}
            </dd>
          </div>
        ) : null}
        {impact.poolName ? (
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide">Pool</dt>
            <dd className="mt-0.5 font-medium text-ash-text">{impact.poolName}</dd>
          </div>
        ) : null}
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide">Pools affected</dt>
          <dd className="mt-0.5 text-ash-text">{impact.poolCount}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide">Participants</dt>
          <dd className="mt-0.5 text-ash-text">{impact.participantCount}</dd>
        </div>
      </dl>
      {impact.poolNames.length > 0 && impact.poolNames.length <= 8 ? (
        <p className="mt-2 text-xs text-ash-muted">
          Pools: {impact.poolNames.join(", ")}
        </p>
      ) : null}
      {impact.poolNames.length > 8 ? (
        <p className="mt-2 text-xs text-ash-muted">
          Pools: {impact.poolNames.slice(0, 8).join(", ")} and{" "}
          {impact.poolNames.length - 8} more
        </p>
      ) : null}
      <ul className="mt-3 list-inside list-disc space-y-1 text-[13px] leading-relaxed text-ash-text/90">
        {impact.effectLines.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    </section>
  );
}
