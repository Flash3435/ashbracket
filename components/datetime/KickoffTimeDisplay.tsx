"use client";

import {
  formatKickoffLocal,
  formatKickoffLocalSingleLine,
} from "@/lib/datetime/scheduleDisplay";
import { useEffect, useState } from "react";

type Props = {
  iso: string | null | undefined;
  layout?: "singleLine" | "split";
  /** Shown when kickoff is missing (default: Time TBD). */
  emptyLabel?: string;
  /** Stable placeholder until the browser local zone is known (hydration-safe). */
  pendingLabel?: string;
  className?: string;
  dateClassName?: string;
  timeClassName?: string;
};

export function KickoffTimeDisplay({
  iso,
  layout = "singleLine",
  emptyLabel = "Time TBD",
  pendingLabel = "…",
  className,
  dateClassName,
  timeClassName,
}: Props) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (iso == null || iso === "") {
    if (layout === "split") {
      return <p className={dateClassName ?? className}>{emptyLabel}</p>;
    }
    return <span className={className}>{emptyLabel}</span>;
  }

  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) {
    if (layout === "split") {
      return <p className={dateClassName ?? className}>{iso}</p>;
    }
    return <span className={className}>{iso}</span>;
  }

  if (!mounted) {
    if (layout === "split") {
      return (
        <>
          <p className={dateClassName ?? className}>{pendingLabel}</p>
          <p className={timeClassName ?? className}>{pendingLabel}</p>
        </>
      );
    }
    return <span className={className}>{pendingLabel}</span>;
  }

  const parts = formatKickoffLocal(iso);
  if (parts.singleLineFallback) {
    return <span className={className}>{parts.singleLineFallback}</span>;
  }

  if (layout === "split") {
    return (
      <>
        <p className={dateClassName ?? className}>{parts.dateLine}</p>
        <p className={timeClassName ?? className}>{parts.timeLine}</p>
      </>
    );
  }

  return (
    <span className={className}>{formatKickoffLocalSingleLine(iso)}</span>
  );
}
