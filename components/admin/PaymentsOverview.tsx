"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { ParticipantPaymentView } from "../../lib/participants/participantsDb";

type Filter = "all" | "paid" | "unpaid";

type PaymentsOverviewProps = {
  rows: ParticipantPaymentView[];
};

function formatPaidAt(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function filterClass(active: boolean): string {
  return active
    ? "rounded-full bg-ash-accent/20 px-3 py-1 text-xs font-medium text-ash-accent ring-1 ring-ash-accent/30"
    : "rounded-full bg-ash-body px-3 py-1 text-xs font-medium text-ash-muted ring-1 ring-ash-border hover:text-ash-text";
}

export function PaymentsOverview({ rows }: PaymentsOverviewProps) {
  const [filter, setFilter] = useState<Filter>("all");

  const sorted = useMemo(
    () =>
      [...rows].sort((a, b) =>
        a.displayName.localeCompare(b.displayName, undefined, {
          sensitivity: "base",
        }),
      ),
    [rows],
  );

  const total = rows.length;
  const paidCount = rows.filter((r) => r.paid).length;
  const unpaidCount = total - paidCount;

  const visible = useMemo(() => {
    if (filter === "paid") return sorted.filter((r) => r.paid);
    if (filter === "unpaid") return sorted.filter((r) => !r.paid);
    return sorted;
  }, [sorted, filter]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <dl className="flex flex-wrap gap-6 text-sm">
          <div>
            <dt className="text-xs uppercase tracking-wide text-ash-muted">
              Total
            </dt>
            <dd className="mt-0.5 text-lg font-semibold tabular-nums text-ash-text">
              {total}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-ash-muted">
              Paid
            </dt>
            <dd className="mt-0.5 text-lg font-semibold tabular-nums text-emerald-300/90">
              {paidCount}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-ash-muted">
              Unpaid
            </dt>
            <dd className="mt-0.5 text-lg font-semibold tabular-nums text-ash-text">
              {unpaidCount}
            </dd>
          </div>
        </dl>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by payment status">
          <button
            type="button"
            onClick={() => setFilter("all")}
            className={filterClass(filter === "all")}
          >
            All ({total})
          </button>
          <button
            type="button"
            onClick={() => setFilter("paid")}
            className={filterClass(filter === "paid")}
          >
            Paid ({paidCount})
          </button>
          <button
            type="button"
            onClick={() => setFilter("unpaid")}
            className={filterClass(filter === "unpaid")}
          >
            Unpaid ({unpaidCount})
          </button>
        </div>
      </div>

      <p className="text-sm text-ash-muted">
        To change payment status, edit a participant on{" "}
        <Link href="/admin/participants" className="ash-link">
          Participants
        </Link>
        .
      </p>

      <div className="ash-surface hidden overflow-hidden md:block">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-ash-border bg-ash-body/50 text-xs font-semibold uppercase tracking-wide text-ash-muted">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Paid date</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ash-border">
            {visible.length === 0 ? (
              <tr>
                <td
                  colSpan={4}
                  className="px-4 py-8 text-center text-ash-muted"
                >
                  No participants match this filter.
                </td>
              </tr>
            ) : (
              visible.map((p) => (
                <tr key={p.id} className="text-ash-muted">
                  <td className="px-4 py-3 font-medium text-ash-text">
                    {p.displayName}
                  </td>
                  <td className="px-4 py-3">{p.email || "—"}</td>
                  <td className="px-4 py-3">
                    <span
                      className={
                        p.paid
                          ? "inline-flex rounded-full bg-ash-accent/20 px-2 py-0.5 text-xs font-medium text-ash-accent"
                          : "inline-flex rounded-full bg-ash-body px-2 py-0.5 text-xs font-medium text-ash-muted ring-1 ring-ash-border"
                      }
                    >
                      {p.paid ? "Paid" : "Unpaid"}
                    </span>
                  </td>
                  <td className="px-4 py-3 tabular-nums text-ash-border-hover">
                    {p.paid ? formatPaidAt(p.paidAt) : "—"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <ul className="space-y-3 md:hidden">
        {visible.length === 0 ? (
          <li className="ash-surface px-4 py-8 text-center text-sm text-ash-muted">
            No participants match this filter.
          </li>
        ) : (
          visible.map((p) => (
            <li key={p.id} className="ash-surface p-4">
              <p className="font-medium text-ash-text">{p.displayName}</p>
              <p className="mt-0.5 text-sm text-ash-muted">{p.email || "—"}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                <span
                  className={
                    p.paid
                      ? "inline-flex rounded-full bg-ash-accent/20 px-2 py-0.5 text-xs font-medium text-ash-accent"
                      : "inline-flex rounded-full bg-ash-body px-2 py-0.5 text-xs font-medium text-ash-muted ring-1 ring-ash-border"
                  }
                >
                  {p.paid ? "Paid" : "Unpaid"}
                </span>
                <span className="text-ash-border-hover">
                  {p.paid ? formatPaidAt(p.paidAt) : ""}
                </span>
              </div>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
