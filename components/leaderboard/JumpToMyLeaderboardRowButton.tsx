"use client";

/** Marks the viewer row in desktop table and mobile card layouts (one visible at a time). */
export const VIEWER_LEADERBOARD_ENTRY_SELECTOR = "[data-viewer-leaderboard-entry]";

function findVisibleViewerRow(): HTMLElement | null {
  const rows = document.querySelectorAll<HTMLElement>(VIEWER_LEADERBOARD_ENTRY_SELECTOR);
  for (const row of rows) {
    if (row.offsetParent !== null) {
      return row;
    }
  }
  return null;
}

/** Scrolls to the signed-in viewer's leaderboard row/card in the standings section. */
export function JumpToMyLeaderboardRowButton() {
  function handleClick() {
    const target = findVisibleViewerRow();
    if (!target) return;

    target.scrollIntoView({ block: "center", behavior: "smooth" });

    if (!target.hasAttribute("tabindex")) {
      target.setAttribute("tabindex", "-1");
    }
    target.focus({ preventScroll: true });
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className="inline-flex items-center rounded-lg border border-sky-500/30 bg-sky-950/25 px-3 py-1.5 text-sm font-medium text-sky-100 transition-colors hover:bg-sky-950/45 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 focus-visible:ring-offset-2 focus-visible:ring-offset-ash-surface"
      aria-label="Jump to your row in the standings"
    >
      Jump to my row
    </button>
  );
}
