import type { ManagedPoolRow } from "../../lib/pools/fetchManagedPoolsForViewer";
import Link from "next/link";
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

  return (
    <div className="mb-6 space-y-3">
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-ash-muted">
          Pool
        </p>
        <h1 className="text-xl font-semibold text-ash-text">{pool.name}</h1>
        <p className="mt-1 text-sm text-ash-muted">
          {pool.is_public ? "Public" : "Private"}
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
        </p>
      </div>
      <AdminPoolSubNav poolId={pool.id} showAuditLogLink={showAuditLogLink} />
    </div>
  );
}
