import { PageContainer } from "@/components/ui/PageContainer";
import { PageTitle } from "@/components/ui/PageTitle";
import { requireManagedPool } from "@/lib/admin/requireManagedPool";
import { canManagePoolAdmins } from "@/lib/auth/permissions";
import {
  listPoolAdminAuditLog,
  parsePoolAdminAuditLogFilter,
  type PoolAdminAuditLogFilter,
} from "@/lib/pools/listPoolAdminAuditLog";
import Link from "next/link";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

function formatWhen(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

const FILTER_OPTIONS: { value: PoolAdminAuditLogFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "membership", label: "Membership" },
  { value: "invites", label: "Invites" },
  { value: "ownership", label: "Ownership" },
];

export default async function AdminPoolAdminAuditHistoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ poolId: string }>;
  searchParams?: Promise<{ filter?: string }>;
}) {
  const { poolId } = await params;
  const sp = searchParams ? await searchParams : {};
  const filter = parsePoolAdminAuditLogFilter(sp.filter);

  const { supabase } = await requireManagedPool(poolId);
  if (!(await canManagePoolAdmins(supabase, poolId))) {
    notFound();
  }

  let loadError: string | null = null;
  let entries: Awaited<ReturnType<typeof listPoolAdminAuditLog>> = [];
  try {
    entries = await listPoolAdminAuditLog(supabase, poolId, {
      limit: 200,
      filter,
    });
  } catch (e) {
    loadError =
      e instanceof Error ? e.message : "Failed to load admin audit history.";
  }

  const base = `/admin/pools/${poolId}/admins/history`;

  return (
    <PageContainer>
      <p className="mb-2 text-sm">
        <Link href={`/admin/pools/${poolId}/admins`} className="ash-link">
          ← Pool admins
        </Link>
      </p>
      <PageTitle
        title="Admin audit history"
        description="Who changed pool admin access and invites. Visible to pool owners and global administrators only."
      />

      <div className="mb-4 flex flex-wrap gap-2 text-sm">
        {FILTER_OPTIONS.map((opt) => {
          const href =
            opt.value === "all" ? base : `${base}?filter=${opt.value}`;
          const active = filter === opt.value;
          return (
            <Link
              key={opt.value}
              href={href}
              className={
                active
                  ? "rounded-md bg-ash-accent/15 px-3 py-1 font-medium text-ash-accent"
                  : "rounded-md border border-ash-border px-3 py-1 text-ash-muted hover:bg-ash-body hover:text-ash-text"
              }
            >
              {opt.label}
            </Link>
          );
        })}
      </div>

      {loadError ? (
        <p
          className="mb-4 rounded-md border border-red-800/80 bg-red-950/40 px-3 py-2 text-sm text-red-200"
          role="alert"
        >
          {loadError}
        </p>
      ) : null}

      {!loadError && entries.length === 0 ? (
        <p className="rounded-md border border-ash-border bg-ash-body/40 px-3 py-4 text-sm text-ash-muted">
          No audit events yet for this filter.
        </p>
      ) : null}

      {!loadError && entries.length > 0 ? (
        <div className="overflow-x-auto rounded-md border border-ash-border">
          <table className="w-full min-w-[40rem] text-left text-sm">
            <thead className="border-b border-ash-border bg-ash-body/60 text-xs uppercase text-ash-muted">
              <tr>
                <th className="px-3 py-2 font-medium">Time</th>
                <th className="px-3 py-2 font-medium">Action</th>
                <th className="px-3 py-2 font-medium">Actor</th>
                <th className="px-3 py-2 font-medium">Target</th>
                <th className="px-3 py-2 font-medium">Details</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((row) => (
                <tr
                  key={row.id}
                  className="border-b border-ash-border/80 align-top"
                >
                  <td className="whitespace-nowrap px-3 py-2 text-ash-muted">
                    {formatWhen(row.createdAt)}
                  </td>
                  <td className="px-3 py-2 text-ash-text">{row.actionLabel}</td>
                  <td className="px-3 py-2 text-ash-text">{row.actorLabel}</td>
                  <td className="px-3 py-2 text-ash-text">{row.targetLabel}</td>
                  <td className="max-w-[14rem] px-3 py-2 text-xs text-ash-muted">
                    {row.metadataSummary ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </PageContainer>
  );
}
