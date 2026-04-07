import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { loadPoolActivityForViewer } from "../../lib/poolActivity/loadPoolActivityForViewer";
import { PoolActivityFeed } from "./PoolActivityFeed";

type Props = {
  poolId: string;
  viewAllHref: string;
  /** Preview depth on Home; full page uses a larger limit at the call site. */
  itemLimit?: number;
  compact?: boolean;
  /**
   * When false, render nothing if there are no items and no error (legacy preview behavior).
   */
  showWhenEmpty?: boolean;
};

export async function PoolRecentActivitySection({
  poolId,
  viewAllHref,
  itemLimit = 5,
  compact = true,
  showWhenEmpty = true,
}: Props) {
  const supabase = await createClient();
  let items: Awaited<ReturnType<typeof loadPoolActivityForViewer>> = [];
  let loadError: string | null = null;
  try {
    items = await loadPoolActivityForViewer(supabase, poolId, {
      ensureDailyRecap: true,
      limit: itemLimit,
    });
  } catch (e) {
    loadError =
      e instanceof Error ? e.message : "Could not load pool activity.";
  }

  if (!showWhenEmpty && !loadError && items.length === 0) {
    return null;
  }

  return (
    <section className="mb-8 rounded-xl border border-ash-border bg-ash-surface p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-bold text-ash-text">Recent activity</h2>
        <Link
          href={viewAllHref}
          className="text-xs font-medium text-ash-accent underline-offset-2 hover:underline"
        >
          View all activity
        </Link>
      </div>
      {loadError ? (
        <p
          className="rounded-md border border-red-800/80 bg-red-950/40 px-3 py-2 text-sm text-red-200"
          role="alert"
        >
          {loadError}
        </p>
      ) : (
        <PoolActivityFeed items={items} compact={compact} />
      )}
    </section>
  );
}
