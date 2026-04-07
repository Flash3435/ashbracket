import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { fetchPoolActivityForPool } from "../../lib/poolActivity/fetchPoolActivity";
import { PoolActivityFeed } from "./PoolActivityFeed";

type Props = {
  poolId: string;
  participantId: string;
};

export async function PoolActivityPreview({ poolId, participantId }: Props) {
  const supabase = await createClient();
  let items: Awaited<ReturnType<typeof fetchPoolActivityForPool>> = [];
  try {
    items = await fetchPoolActivityForPool(supabase, poolId, 5);
  } catch {
    return null;
  }

  if (items.length === 0) return null;

  return (
    <section className="mb-8 rounded-xl border border-ash-border bg-ash-surface p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-bold text-ash-text">Recent activity</h2>
        <Link
          href={`/account/activity?participant=${participantId}`}
          className="text-xs font-medium text-ash-accent underline-offset-2 hover:underline"
        >
          View all activity
        </Link>
      </div>
      <PoolActivityFeed items={items} compact />
    </section>
  );
}
