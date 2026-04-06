import Link from "next/link";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageTitle } from "@/components/ui/PageTitle";
import { fetchSamplePoolScoringRules } from "../../lib/rules/fetchSamplePoolScoringRules";

export const dynamic = "force-dynamic";

function formatLockAt(iso: string | null): string | null {
  if (iso == null) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString("en-US", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "UTC",
  });
}

export default async function RulesPage() {
  const result = await fetchSamplePoolScoringRules();

  if (!result.ok && result.kind === "error") {
    return (
      <PageContainer>
        <PageTitle
          title="Pool rules"
          description="How points are awarded in this pool."
        />
        <p className="rounded-md border border-red-800/80 bg-red-950/40 px-3 py-2 text-sm text-red-200">
          Could not load scoring rules: {result.message}
        </p>
        <p className="text-sm text-ash-muted">
          <Link href="/" className="ash-link">
            ← Back to standings
          </Link>
        </p>
      </PageContainer>
    );
  }

  if (!result.ok && result.kind === "empty") {
    return (
      <PageContainer>
        <PageTitle
          title="Pool rules"
          description="How points are awarded in this pool."
        />
        <div className="ash-surface px-4 py-10 text-center">
          <p className="text-sm font-medium text-ash-text">
            No public scoring rules yet
          </p>
          <p className="mt-2 text-sm text-ash-muted">
            The sample pool may not be marked public, or scoring rules have not
            been configured. Check with the organizer.
          </p>
        </div>
        <p className="text-sm text-ash-muted">
          <Link href="/" className="ash-link">
            ← Back to standings
          </Link>
        </p>
      </PageContainer>
    );
  }

  const { data } = result;
  const lockLabel = formatLockAt(data.lockAt);

  return (
    <PageContainer>
      <PageTitle
        title="Pool rules"
        description={
          lockLabel
            ? `${data.poolName} — picks lock ${lockLabel} (UTC).`
            : `${data.poolName} — points per correct pick.`
        }
      />

      <div className="ash-surface overflow-x-auto">
        <table className="w-full min-w-[320px] text-left text-sm">
          <thead className="border-b border-ash-border bg-ash-body/50 text-xs font-medium uppercase tracking-wide text-ash-muted">
            <tr>
              <th className="px-4 py-3">Pick type</th>
              <th className="px-4 py-3 text-right">Points</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ash-border">
            {data.rules.map((row) => (
              <tr key={row.predictionKind}>
                <td className="px-4 py-3 text-ash-text">{row.label}</td>
                <td className="px-4 py-3 text-right font-medium tabular-nums text-ash-text">
                  {row.points}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-sm font-normal leading-relaxed text-ash-muted">
        Standings are ordered by total points from the public score ledger.
        Tie-break details, if any, are set by the pool organizer.
      </p>

      <p className="text-sm text-ash-muted">
        <Link href="/" className="ash-link">
          ← Back to standings
        </Link>
      </p>
    </PageContainer>
  );
}
