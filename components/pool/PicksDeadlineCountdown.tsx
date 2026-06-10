"use client";

import {
  formatPicksDeadlineCountdown,
  picksDeadlineExpired,
} from "@/lib/picks/picksDeadlineBanner";
import { useEffect, useState } from "react";

type Props = {
  lockAtIso: string;
  onExpired?: () => void;
  className?: string;
};

/**
 * Client-only countdown for the picks deadline banner.
 * Renders a stable placeholder until mounted to avoid hydration mismatch.
 */
export function PicksDeadlineCountdown({
  lockAtIso,
  onExpired,
  className = "",
}: Props) {
  const [mounted, setMounted] = useState(false);
  const [label, setLabel] = useState("Picks lock soon");

  useEffect(() => {
    setMounted(true);

    const tick = () => {
      setLabel(formatPicksDeadlineCountdown(lockAtIso));
      if (picksDeadlineExpired(lockAtIso)) {
        onExpired?.();
      }
    };

    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [lockAtIso, onExpired]);

  return (
    <span className={className} aria-live="polite">
      {mounted ? label : "Picks lock soon"}
    </span>
  );
}
