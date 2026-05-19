"use client";

import { useState, useTransition } from "react";
import {
  compareLivePoolToSnapshotAction,
  savePilotStandingsSnapshotAction,
} from "../../app/(worldcup)/admin/pilot/actions";
import type { PoolPilotVerificationRow } from "@/lib/admin/fetchPoolPilotVerification";

type SavedSnapshot = {
  id: string;
  label: string;
  capturedAt: string;
  summaryHash: string;
  rowCount: number;
  poolId: string;
  poolName: string;
};

type Props = {
  livePools: PoolPilotVerificationRow[];
  recentSnapshots: SavedSnapshot[];
};

function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(d);
}

export function PilotStandingsSnapshotPanel({
  livePools,
  recentSnapshots,
}: Props) {
  const [poolId, setPoolId] = useState(livePools[0]?.poolId ?? "");
  const [label, setLabel] = useState("pre-pilot");
  const [message, setMessage] = useState<string | null>(null);
  const [compareDetail, setCompareDetail] = useState<string | null>(null);
  const [exportJson, setExportJson] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function runSave() {
    setMessage(null);
    setCompareDetail(null);
    setExportJson(null);
    startTransition(async () => {
      const res = await savePilotStandingsSnapshotAction({ poolId, label });
      if (!res.ok) {
        setMessage(res.error);
        return;
      }
      setMessage(
        `Saved snapshot (${res.rowCount} people, hash ${res.summaryHash}). Standings last recomputed: ${res.ledgerRecomputedAt ? formatWhen(res.ledgerRecomputedAt) : "never"}.`,
      );
    });
  }

  function runCompare() {
    setMessage(null);
    setCompareDetail(null);
    setExportJson(null);
    const latestForPool = recentSnapshots.find((s) => s.poolId === poolId);
    startTransition(async () => {
      const res = await compareLivePoolToSnapshotAction({
        poolId,
        snapshotId: latestForPool?.id,
      });
      if (!res.ok) {
        setMessage(res.error);
        return;
      }
      if (res.matches) {
        setMessage(
          `Unchanged — current standings match snapshot “${res.baselineLabel}” (hash ${res.baselineHash}).`,
        );
      } else {
        setMessage(
          `Changed — current standings do not match snapshot “${res.baselineLabel}”.`,
        );
        setCompareDetail(
          res.diffs.length === 0
            ? "Hash mismatch with no per-person point diffs (check participant list changes)."
            : res.diffs
                .slice(0, 8)
                .map(
                  (d) =>
                    `${d.displayName}: ${d.baselinePoints} → ${d.currentPoints} pts`,
                )
                .join("\n") +
                (res.diffs.length > 8
                  ? `\n…and ${res.diffs.length - 8} more`
                  : ""),
        );
      }
      setExportJson(
        JSON.stringify(
          {
            poolId,
            matches: res.matches,
            baselineLabel: res.baselineLabel,
            baselineHash: res.baselineHash,
            currentHash: res.currentHash,
            diffs: res.diffs,
          },
          null,
          2,
        ),
      );
    });
  }

  if (livePools.length === 0) {
    return (
      <section className="ash-surface p-4">
        <h2 className="text-sm font-bold text-ash-text">Live standings snapshot</h2>
        <p className="mt-2 text-sm text-ash-muted">No live pools to snapshot yet.</p>
      </section>
    );
  }

  return (
    <section className="ash-surface space-y-4 p-4">
      <div>
        <h2 className="text-sm font-bold text-ash-text">Live standings snapshot</h2>
        <p className="mt-1 text-sm text-ash-muted">
          Before the pilot, save each live pool&apos;s leaderboard totals. After
          simulation work, compare again — totals should match if live data stayed
          isolated.
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        <label className="block text-sm">
          <span className="text-ash-muted">Live pool</span>
          <select
            value={poolId}
            onChange={(e) => setPoolId(e.target.value)}
            disabled={pending}
            className="mt-1 block min-w-[14rem] rounded-md border border-ash-border bg-ash-body px-3 py-2 text-ash-text"
          >
            {livePools.map((p) => (
              <option key={p.poolId} value={p.poolId}>
                {p.poolName}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="text-ash-muted">Label</span>
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            disabled={pending}
            className="mt-1 block rounded-md border border-ash-border bg-ash-body px-3 py-2 text-ash-text"
          />
        </label>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={runSave}
          disabled={pending || !poolId}
          className="btn-primary disabled:opacity-50"
        >
          {pending ? "Working…" : "Save snapshot now"}
        </button>
        <button
          type="button"
          onClick={runCompare}
          disabled={pending || !poolId}
          className="rounded-md border border-ash-border bg-ash-body/60 px-4 py-2 text-sm font-medium text-ash-text hover:bg-ash-body disabled:opacity-50"
        >
          Compare to latest snapshot
        </button>
      </div>

      {message ? (
        <p
          className={`rounded-md border px-3 py-2 text-sm ${
            message.startsWith("Unchanged")
              ? "border-emerald-800/70 bg-emerald-950/35 text-emerald-100"
              : message.startsWith("Saved")
                ? "border-emerald-800/70 bg-emerald-950/35 text-emerald-100"
                : message.startsWith("Changed")
                  ? "border-red-800/70 bg-red-950/35 text-red-200"
                  : "border-amber-800/70 bg-amber-950/35 text-amber-100"
          }`}
        >
          {message}
        </p>
      ) : null}
      {compareDetail ? (
        <pre className="whitespace-pre-wrap rounded-md border border-ash-border bg-ash-body/50 p-3 text-xs text-ash-muted">
          {compareDetail}
        </pre>
      ) : null}
      {exportJson ? (
        <details className="text-sm">
          <summary className="cursor-pointer text-ash-accent">Copy comparison JSON</summary>
          <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap rounded-md border border-ash-border bg-ash-body/50 p-3 text-xs text-ash-muted">
            {exportJson}
          </pre>
        </details>
      ) : null}

      {recentSnapshots.length > 0 ? (
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-ash-muted">
            Recent snapshots
          </h3>
          <ul className="mt-2 space-y-1 text-sm text-ash-muted">
            {recentSnapshots.map((s) => (
              <li key={s.id}>
                <span className="text-ash-text">{s.poolName}</span> · {s.label} ·{" "}
                {formatWhen(s.capturedAt)} · {s.rowCount} people · hash{" "}
                <span className="font-mono text-xs">{s.summaryHash}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
