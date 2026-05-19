import { BootstrapSimulationPoolForm } from "@/components/admin/BootstrapSimulationPoolForm";
import { PilotRunOrderPanel } from "@/components/admin/PilotRunOrderPanel";
import { PoolPilotVerificationPanel } from "@/components/admin/PoolPilotVerificationPanel";
import { SimulationModeBanner } from "@/components/admin/SimulationModeBanner";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageTitle } from "@/components/ui/PageTitle";
import { fetchBootstrapSimulationImpactSummary } from "@/lib/admin/fetchAdminImpactSummary";
import { fetchPoolPilotVerification } from "@/lib/admin/fetchPoolPilotVerification";
import { isProductionDeployment } from "@/lib/admin/deploymentEnvironment";
import { requireGlobalAdminPage } from "@/lib/admin/requireGlobalAdmin";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<{ ok?: string; err?: string }>;
};

export default async function AdminSimulationPage({ searchParams }: PageProps) {
  await requireGlobalAdminPage("/admin/simulation");
  const sp = await searchParams;
  const supabase = await createClient();

  const { data: editions, error } = await supabase
    .from("tournament_editions")
    .select("id, code, name, created_at")
    .eq("is_simulation", true)
    .order("created_at", { ascending: false });

  const { data: simPools } = await supabase
    .from("pools")
    .select("id, name, join_code, tournament_edition_id")
    .eq("is_simulation", true)
    .order("created_at", { ascending: false });

  const editionById = new Map(
    (editions ?? []).map((e) => [e.id as string, e]),
  );

  const isProduction = isProductionDeployment();
  const bootstrapImpact = await fetchBootstrapSimulationImpactSummary(supabase);
  const pilotSnapshot = await fetchPoolPilotVerification(supabase);

  return (
    <PageContainer>
      <PageTitle
        title="Simulation testing"
        description="Run full fake pools with isolated scores and results. Nothing here affects live pools or the official tournament."
      />

      <SimulationModeBanner variant="simulation" className="mb-6" />

      <p className="mb-4 text-sm text-ash-muted">
        <Link href="/admin/pilot" className="ash-link font-medium text-ash-text">
          Production pilot checklist
        </Link>
        {" "}
        — environment, snapshots, and live-pool verification in one place.
      </p>

      <section className="mb-8">
        <PilotRunOrderPanel />
      </section>

      {sp.ok ? (
        <p className="mb-4 rounded-md border border-emerald-800/60 bg-emerald-950/30 px-3 py-2 text-sm text-emerald-100">
          Simulation sync completed.
        </p>
      ) : null}
      {sp.err ? (
        <p className="mb-4 rounded-md border border-red-800/80 bg-red-950/40 px-3 py-2 text-sm text-red-200">
          {sp.err}
        </p>
      ) : null}
      {error ? (
        <p className="mb-4 rounded-md border border-red-800/80 bg-red-950/40 px-3 py-2 text-sm text-red-200">
          {error.message}
        </p>
      ) : null}

      <section className="mb-10">
        <BootstrapSimulationPoolForm
          isProduction={isProduction}
          impact={bootstrapImpact}
        />
      </section>

      <section className="mb-10">
        <PoolPilotVerificationPanel snapshot={pilotSnapshot} />
      </section>

      <section className="mb-10">
        <h2 className="text-sm font-semibold text-ash-text">Simulation pools</h2>
        {(simPools ?? []).length === 0 ? (
          <p className="mt-2 text-sm text-ash-muted">No simulation pools yet.</p>
        ) : (
          <ul className="mt-3 space-y-2 text-sm">
            {(simPools ?? []).map((p) => {
              const ed = editionById.get(p.tournament_edition_id as string);
              return (
                <li
                  key={p.id as string}
                  className="rounded-md border border-ash-border bg-ash-body/40 px-3 py-2"
                >
                  <Link
                    href={`/admin/pools/${p.id as string}`}
                    className="ash-link font-medium text-ash-text"
                  >
                    {p.name as string}
                  </Link>
                  <span className="text-ash-muted">
                    {" "}
                    · Simulation pool
                    {p.join_code ? (
                      <>
                        {" "}
                        · <span className="font-mono">{p.join_code as string}</span>
                      </>
                    ) : null}
                  </span>
                  {ed ? (
                    <div className="mt-1 flex flex-wrap gap-3 text-xs text-ash-muted">
                      <Link
                        href={`/admin/simulation/editions/${ed.id as string}/results`}
                        className="ash-link"
                      >
                        Test results ({ed.code as string})
                      </Link>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section>
        <h2 className="text-sm font-semibold text-ash-text">Simulation editions</h2>
        <p className="mt-1 text-sm text-ash-muted">
          Each edition has its own match schedule copy and result rows.
        </p>
        {(editions ?? []).length === 0 ? (
          <p className="mt-2 text-sm text-ash-muted">No simulation editions yet.</p>
        ) : (
          <ul className="mt-3 space-y-2 text-sm text-ash-muted">
            {(editions ?? []).map((e) => (
              <li key={e.id as string}>
                <span className="font-medium text-ash-text">{e.name as string}</span>
                <span className="font-mono text-xs"> ({e.code as string})</span>
                {" · "}
                <Link
                  href={`/admin/simulation/editions/${e.id as string}/results`}
                  className="ash-link"
                >
                  Enter test results
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="mt-10 text-sm text-ash-muted">
        <Link href="/admin/results" className="ash-link">
          Live tournament results
        </Link>
        {" "}
        — official production data only.
      </p>
    </PageContainer>
  );
}
