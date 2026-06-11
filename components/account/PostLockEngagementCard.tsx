import Link from "next/link";
import {
  buildPostLockNavPlan,
  poolSnapshotFootnote,
  postLockCardCopy,
  type PoolSnapshotStats,
  type PostLockCardVariant,
  type PostLockNavInput,
} from "@/lib/account/postLockEngagement";

type Props = PostLockNavInput & {
  variant: PostLockCardVariant;
  snapshot?: PoolSnapshotStats | null;
};

export function PostLockEngagementCard({
  variant,
  snapshot = null,
  ...navInput
}: Props) {
  const plan = buildPostLockNavPlan(navInput);
  if (!plan.postLockEngagement) return null;

  const copy = postLockCardCopy(variant);
  const footnote = poolSnapshotFootnote(snapshot);
  const showSnapshot =
    snapshot != null && snapshot.totalParticipants > 0;

  return (
    <section className="relative overflow-hidden rounded-xl border border-emerald-500/30 bg-gradient-to-br from-emerald-500/10 via-ash-surface to-ash-surface p-5 ring-1 ring-emerald-500/15 sm:p-6">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(16,185,129,0.12),transparent_55%)]" />
      <div className="relative space-y-4">
        <div>
          <h2 className="text-lg font-bold text-ash-text sm:text-xl">{copy.headline}</h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ash-muted">
            {copy.body}
          </p>
        </div>

        {showSnapshot ? (
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-ash-border/60 bg-ash-body/30 px-3 py-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-ash-muted">
                Participants
              </p>
              <p className="mt-1 text-lg font-bold text-ash-text">
                {snapshot.totalParticipants}
              </p>
            </div>
            <div className="rounded-lg border border-ash-border/60 bg-ash-body/30 px-3 py-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-ash-muted">
                Complete brackets
              </p>
              <p className="mt-1 text-lg font-bold text-ash-text">
                {snapshot.completeBrackets}
              </p>
            </div>
            {snapshot.mostPopularChampion ? (
              <div className="rounded-lg border border-ash-border/60 bg-ash-body/30 px-3 py-2.5 sm:col-span-1">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-ash-muted">
                  Top champion pick
                </p>
                <p className="mt-1 line-clamp-2 text-sm font-semibold text-ash-text">
                  {snapshot.mostPopularChampion}
                </p>
              </div>
            ) : null}
          </div>
        ) : null}

        {footnote ? (
          <p className="text-sm text-ash-muted">{footnote}</p>
        ) : null}

        <div className="flex flex-wrap gap-2 sm:gap-3">
          <Link href={plan.primary.href} className="btn-primary inline-flex text-sm">
            {plan.primary.label}
          </Link>
          <Link
            href={plan.secondary.href}
            className="btn-ghost inline-flex text-sm ring-1 ring-ash-border"
          >
            {plan.secondary.label}
          </Link>
          {plan.tertiary ? (
            <Link
              href={plan.tertiary.href}
              className="btn-ghost inline-flex text-sm ring-1 ring-ash-border"
            >
              {plan.tertiary.label}
            </Link>
          ) : null}
        </div>
      </div>
    </section>
  );
}
