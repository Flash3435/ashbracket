"use client";

import {
  formatKnockoutSelectionCountdown,
  selectionCountdownExpired,
} from "@/lib/picks/knockoutSelectionWindow";
import { useEffect, useState } from "react";

type Props = {
  targetIso: string;
  className?: string;
};

/**
 * Client-only live countdown for knockout selection windows.
 * Renders a stable placeholder until mounted to avoid hydration mismatch.
 */
export function KnockoutSelectionCountdown({ targetIso, className = "" }: Props) {
  const [mounted, setMounted] = useState(false);
  const [label, setLabel] = useState("soon");

  useEffect(() => {
    setMounted(true);

    const tick = () => {
      if (selectionCountdownExpired(targetIso)) {
        setLabel("now");
        return;
      }
      setLabel(formatKnockoutSelectionCountdown(targetIso));
    };

    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [targetIso]);

  return (
    <span className={className} aria-live="polite">
      {mounted ? label : "soon"}
    </span>
  );
}
