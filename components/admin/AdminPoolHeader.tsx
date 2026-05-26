import type { ManagedPoolRow } from "../../lib/pools/fetchManagedPoolsForViewer";
import { publicLeaderboardHrefForPool } from "@/lib/pool/publicLeaderboardHref";
import Link from "next/link";
import { SimulationModeBanner } from "./SimulationModeBanner";
import { AdminPoolSubNav } from "./AdminPoolSubNav";

type Props = {
  pool: ManagedPoolRow;
  /** Pool owners / global admins only (audit log is hidden from non-owner pool admins). */
  showAuditLogLink?: boolean;
};

export function AdminPoolHeader({ pool, showAuditLogLink = false }: Props) {
  const code =
    pool.join_code && String(pool.join_code).trim()
      ? String(pool.join_code).trim()
      : null;
  const publicLeaderboardHref = publicLeaderboardHrefForPool({
    id: pool.id,
    isPublic: pool.is_public,
  });

  return (
    <div className="mb-6 space-y-3">
      {pool.is_simulation ? (
        <SimulationModeBanner variant="simulation" poolName={pool.name} />
      ) : null}
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-ash-muted">
          {pool.is_simulation ? "Simulation pool" : "Pool"}
        </p>
        <h1 className="text-xl font-semibold text-ash-text">{pool.name}</h1>
        <p className="mt-1 text-sm text-ash-muted">
          {publicLeaderboardHref ? (
            <Link href={publicLeaderboardHref} className="ash-link">
              Public leaderboard
            </Link>
          ) : (
            "Private leaderboard"
          )}
          {code ? (
            <>
              {" "}
              · Join code: <span className="font-mono text-ash-text">{code}</span>
            </>
          ) : null}
          {" · "}
          <Link href="/admin" className="ash-link">
            All pools
          </Link>
          {pool.is_simulation ? (
            <>
              {" · "}
              <Link
                href={`/admin/simulation/editions/${pool.tournament_edition_id}/results`}
                className="ash-link text-amber-200/90"
              >
                Test results
              </Link>
            </>
          ) : null}
        </p>
      </div>
      <AdminPoolSubNav poolId={pool.id} showAuditLogLink={showAuditLogLink} />
    </div>
  );
}
