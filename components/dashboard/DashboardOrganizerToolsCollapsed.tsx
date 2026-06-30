import Link from "next/link";
import type { AccountCreatePoolLinkState } from "@/lib/account/accountPageLockState";

type OrganizedPool = {
  id: string;
  name: string;
};

type Props = {
  organizedPools: OrganizedPool[];
  createPoolLink: AccountCreatePoolLinkState;
  orgErr: string | null;
};

export function DashboardOrganizerToolsCollapsed({
  organizedPools,
  createPoolLink,
  orgErr,
}: Props) {
  if (organizedPools.length === 0 && !createPoolLink.show && !orgErr) {
    return null;
  }

  return (
    <details className="rounded-xl border border-ash-border/60 bg-ash-body/20 text-sm">
      <summary className="cursor-pointer select-none px-4 py-3 font-medium text-ash-muted">
        Organizer tools
      </summary>
      <div className="space-y-3 border-t border-ash-border/60 px-4 py-3">
        {orgErr ? (
          <p className="text-sm text-amber-200" role="alert">
            Could not load pools you organize ({orgErr}).
          </p>
        ) : null}
        {organizedPools.length > 0 ? (
          <ul className="space-y-2">
            {organizedPools.map((p) => (
              <li
                key={p.id}
                className="flex flex-wrap items-center justify-between gap-2"
              >
                <span className="text-ash-text">{p.name}</span>
                <Link
                  href={`/admin/pools/${p.id}`}
                  className="ash-link text-xs"
                >
                  Manage pool
                </Link>
              </li>
            ))}
          </ul>
        ) : null}
        {createPoolLink.show ? (
          <Link href="/account/pools/new" className="ash-link text-xs">
            {createPoolLink.label}
          </Link>
        ) : null}
      </div>
    </details>
  );
}
