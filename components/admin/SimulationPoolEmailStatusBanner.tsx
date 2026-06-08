import type { SimulationPoolEmailUiStatus } from "@/lib/admin/simulationPoolEmailPolicy";

type Props = {
  status: SimulationPoolEmailUiStatus;
  className?: string;
};

export function SimulationPoolEmailStatusBanner({ status, className = "" }: Props) {
  if (!status.isSimulationPool) {
    return null;
  }

  const tone = status.sendsBlocked
    ? "border-red-800/70 bg-red-950/40 text-red-100"
    : status.requiresTypedPhrase
      ? "border-amber-600/60 bg-amber-950/40 text-amber-100"
      : "border-amber-700/50 bg-amber-950/30 text-amber-100";

  return (
    <div
      role="alert"
      className={`rounded-lg border px-4 py-3 text-sm ${tone} ${className}`}
    >
      <p className="font-semibold">{status.bannerTitle}</p>
      <p className="mt-1.5 text-[13px] leading-relaxed opacity-95">{status.bannerBody}</p>
      {status.isProduction ? (
        <p className="mt-2 text-xs font-medium uppercase tracking-wide opacity-80">
          {status.sendsBlocked
            ? "Production · simulation email blocked"
            : status.requiresTypedPhrase
              ? "Production · override enabled"
              : "Production environment"}
        </p>
      ) : null}
    </div>
  );
}
