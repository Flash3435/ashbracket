import { getDeploymentEnvironmentLabel, isProductionDeployment } from "@/lib/admin/deploymentEnvironment";

export function ProductionEnvironmentBanner() {
  if (!isProductionDeployment()) {
    return null;
  }

  const label = getDeploymentEnvironmentLabel();

  return (
    <div
      role="alert"
      className="border-b border-red-800/80 bg-red-950/90 px-4 py-3 text-center text-sm text-red-50"
    >
      <p className="font-bold tracking-wide uppercase">
        {label} environment — real customer data
      </p>
      <p className="mt-1 text-[13px] font-normal opacity-95">
        Double-check live vs simulation before changing results, syncing, or sending
        email. Use Simulation testing for practice runs.
      </p>
    </div>
  );
}
