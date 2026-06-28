"use client";

type Props = {
  /** When true, participant should re-save after automatic pruning on load. */
  unsavedRepair?: boolean;
};

/**
 * Shown when saved knockout progression picks were cleared after the official
 * FIFA bracket path fix (M89–M104 pairings).
 */
export function KnockoutBracketPathReviewBanner({
  unsavedRepair = false,
}: Props) {
  return (
    <div
      className="rounded-lg border border-amber-700/50 bg-amber-950/30 px-4 py-3.5"
      role="status"
    >
      <p className="text-sm font-semibold text-amber-50">
        Knockout bracket path updated
      </p>
      <p className="mt-2 text-sm leading-relaxed text-amber-100/95">
        The knockout bracket path was updated to match FIFA&apos;s official pairings.
        Please review your Round of 16 and later picks.
      </p>
      {unsavedRepair ? (
        <p className="mt-2 text-xs text-amber-200/90">
          Some saved picks no longer fit the official path and were cleared locally.
          Save to keep these changes.
        </p>
      ) : null}
    </div>
  );
}
