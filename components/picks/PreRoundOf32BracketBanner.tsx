"use client";

import Link from "next/link";

type Props = {
  /** In-page list view switch (edit wizard). */
  onSwitchToListView?: () => void;
  /** Navigate to list view (summary / snapshot pages). */
  listViewHref?: string | null;
  /** When false, hide the list-view CTA (e.g. read-only peer snapshot). */
  showListViewCta?: boolean;
};

/**
 * Explains the pre-official-R32 bracket state: preview only, what is editable now,
 * and how to reach list view for Stage 1 / 2 / bonus picks.
 */
export function PreRoundOf32BracketBanner({
  onSwitchToListView,
  listViewHref = null,
  showListViewCta = true,
}: Props) {
  const showCta =
    showListViewCta && (onSwitchToListView != null || Boolean(listViewHref?.trim()));

  return (
    <div
      className="rounded-lg border border-sky-800/45 bg-gradient-to-br from-sky-950/35 to-ash-body/20 px-4 py-3.5"
      role="status"
    >
      <div className="flex flex-wrap items-start gap-2">
        <span className="shrink-0 rounded-full bg-sky-900/50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-sky-200">
          Preview
        </span>
        <p className="text-sm font-semibold text-sky-50">
          Official Round of 32 not published yet
        </p>
      </div>
      <p className="mt-2 text-sm leading-relaxed text-sky-100/95">
        This bracket shows a preview of your future knockout path from group-stage picks.
        Full knockout picks open later, after organizers publish the official Round of 32.
      </p>
      <div className="mt-3 rounded-md border border-sky-900/40 bg-ash-body/20 px-3 py-2.5">
        <p className="text-xs font-semibold uppercase tracking-wide text-sky-200/90">
          You can edit now
        </p>
        <ul className="mt-1.5 space-y-1 text-sm text-sky-100/90">
          <li className="flex gap-2">
            <span className="text-sky-300" aria-hidden>
              •
            </span>
            <span>Group stage — 1st and 2nd in every group</span>
          </li>
          <li className="flex gap-2">
            <span className="text-sky-300" aria-hidden>
              •
            </span>
            <span>Best third-place teams — qualification picks, not bracket slots</span>
          </li>
          <li className="flex gap-2">
            <span className="text-sky-300" aria-hidden>
              •
            </span>
            <span>Bonus picks</span>
          </li>
        </ul>
      </div>
      {showCta ? (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          {onSwitchToListView ? (
            <button
              type="button"
              onClick={onSwitchToListView}
              className="rounded-lg border border-sky-600/50 bg-sky-900/40 px-3 py-1.5 text-xs font-semibold text-sky-50 transition hover:bg-sky-900/60"
            >
              Switch to List view to edit
            </button>
          ) : listViewHref ? (
            <Link
              href={listViewHref}
              className="rounded-lg border border-sky-600/50 bg-sky-900/40 px-3 py-1.5 text-xs font-semibold text-sky-50 transition hover:bg-sky-900/60"
            >
              Switch to List view to edit
            </Link>
          ) : null}
          <p className="text-xs text-sky-200/80">
            List view walks through each stage step by step.
          </p>
        </div>
      ) : null}
    </div>
  );
}
