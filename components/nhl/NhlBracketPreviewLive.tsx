"use client";

import { NhlBracketPreview } from "@/components/nhl/NhlBracketPreview";
import { buildNhlAdminBracketViewModel } from "@/lib/nhl/bracketViewModel";
import type { NhlSeriesRow } from "@/lib/nhl/types";
import { useEffect, useMemo, useState } from "react";

/**
 * Client-hydrated bracket: merges NHLE scores via same-origin API (reliable on Vercel)
 * then builds the read-only preview model.
 */
export function NhlBracketPreviewLive({
  initialRows,
  includeRound1 = true,
}: {
  initialRows: NhlSeriesRow[];
  includeRound1?: boolean;
}) {
  const [rows, setRows] = useState(initialRows);

  useEffect(() => {
    setRows(initialRows);
  }, [initialRows]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/nhl/round1-live-overlay", { cache: "no-store" });
        const j = (await res.json()) as { ok?: boolean; rows?: NhlSeriesRow[] };
        const merged = j.rows;
        if (cancelled || !j?.ok || !Array.isArray(merged)) return;
        setRows(merged);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const model = useMemo(() => buildNhlAdminBracketViewModel(rows), [rows]);
  return <NhlBracketPreview model={model} includeRound1={includeRound1} />;
}
