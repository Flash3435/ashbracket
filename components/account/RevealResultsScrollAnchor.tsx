"use client";

import { ACCOUNT_REVEAL_RESULTS_HASH } from "@/lib/account/buildAccountProfileLinkHref";
import { useEffect } from "react";

type Props = {
  selectedParticipantId: string | null;
};

/**
 * Scrolls to `#reveal-results` after profile selection on `/account/reveal`.
 * Hash-only so dashboard links without a hash do not jump.
 */
export function RevealResultsScrollAnchor({ selectedParticipantId }: Props) {
  useEffect(() => {
    if (!selectedParticipantId) return;
    if (typeof window === "undefined") return;
    if (window.location.hash.replace(/^#/, "") !== ACCOUNT_REVEAL_RESULTS_HASH) {
      return;
    }

    const el = document.getElementById(ACCOUNT_REVEAL_RESULTS_HASH);
    if (!el) return;

    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    el.scrollIntoView({
      behavior: reduceMotion ? "auto" : "smooth",
      block: "start",
    });
  }, [selectedParticipantId]);

  return null;
}
