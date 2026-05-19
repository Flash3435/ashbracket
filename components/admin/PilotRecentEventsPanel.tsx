import type { PilotVerificationEventRow } from "@/lib/admin/pilotVerificationLog";

function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "short",
    timeStyle: "short",
  }).format(d);
}

function eventLabel(type: string): string {
  switch (type) {
    case "standings_snapshot_saved":
      return "Snapshot saved";
    case "live_standings_unchanged_check":
      return "Live check";
    case "simulation_pool_created":
      return "Simulation pool";
    case "simulation_results_recomputed":
      return "Simulation recompute";
    default:
      return type;
  }
}

type Props = {
  events: PilotVerificationEventRow[];
  loadError: string | null;
};

export function PilotRecentEventsPanel({ events, loadError }: Props) {
  return (
    <section className="ash-surface p-4">
      <h2 className="text-sm font-bold text-ash-text">Recent pilot log</h2>
      <p className="mt-1 text-sm text-ash-muted">
        Operator-visible steps from this browser session and server. Also grep{" "}
        <code className="rounded bg-ash-body px-1 text-xs">[ashbracket:admin-risk]</code>{" "}
        in host logs.
      </p>
      {loadError ? (
        <p className="mt-3 rounded-md border border-amber-800/70 bg-amber-950/35 px-3 py-2 text-sm text-amber-100">
          {loadError.includes("admin_pilot_verification_events")
            ? "Pilot log table is not installed yet. Apply migration 20260519120000_admin_pilot_operator_support.sql, then refresh."
            : loadError}
        </p>
      ) : null}
      {events.length === 0 && !loadError ? (
        <p className="mt-3 text-sm text-ash-muted">No pilot events logged yet.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {events.map((e) => {
            const matches =
              e.eventType === "live_standings_unchanged_check" &&
              e.payload?.matches === true;
            const failed =
              e.eventType === "live_standings_unchanged_check" &&
              e.payload?.matches === false;
            return (
              <li
                key={e.id}
                className={`rounded-md border px-3 py-2 text-sm ${
                  matches
                    ? "border-emerald-800/50 bg-emerald-950/25 text-emerald-100"
                    : failed
                      ? "border-red-800/50 bg-red-950/25 text-red-100"
                      : "border-ash-border bg-ash-body/40 text-ash-muted"
                }`}
              >
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-ash-text">
                    {eventLabel(e.eventType)}
                  </span>
                  <span className="text-xs">{formatWhen(e.createdAt)}</span>
                  {typeof e.payload?.env === "string" ? (
                    <span className="font-mono text-[10px]">{e.payload.env as string}</span>
                  ) : null}
                </div>
                <p className="mt-1 text-ash-text">{e.message}</p>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
