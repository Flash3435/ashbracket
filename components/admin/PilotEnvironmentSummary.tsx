import type { PilotChecklistContext } from "@/lib/admin/fetchPilotChecklistContext";

type Props = {
  context: PilotChecklistContext;
};

export function PilotEnvironmentSummary({ context }: Props) {
  const emailTone = context.simulationEmailOverrideEnabled
    ? "border-amber-700/50 bg-amber-950/30 text-amber-100"
    : "border-emerald-800/60 bg-emerald-950/30 text-emerald-100";

  return (
    <section className="ash-surface grid gap-4 p-4 sm:grid-cols-2">
      <div>
        <h2 className="text-sm font-bold text-ash-text">Environment</h2>
        <p className="mt-2 text-lg font-semibold text-ash-text">
          {context.environmentLabel}
        </p>
        <p className="mt-1 font-mono text-xs text-ash-muted">{context.environment}</p>
        {context.isProduction ? (
          <p className="mt-2 text-sm text-red-200">
            You are on production. Simulation changes must stay isolated from live
            pools.
          </p>
        ) : (
          <p className="mt-2 text-sm text-ash-muted">
            Not production — use this page to rehearse, then repeat checks on
            production before a real pilot.
          </p>
        )}
      </div>
      <div className={`rounded-md border px-3 py-3 ${emailTone}`}>
        <h2 className="text-sm font-bold">Simulation email on production</h2>
        <p className="mt-2 text-sm">
          {context.simulationEmailOverrideEnabled ? (
            <>
              <strong>Override enabled.</strong> Real email from simulation pools can
              be sent (with typed confirmation). Use test recipients only.
            </>
          ) : (
            <>
              <strong>Blocked by default.</strong> Simulation pools cannot send real
              email until{" "}
              <code className="rounded bg-black/30 px-1 text-xs">
                {context.simulationEmailOverrideEnvName}=true
              </code>{" "}
              is set on the server.
            </>
          )}
        </p>
      </div>
    </section>
  );
}
