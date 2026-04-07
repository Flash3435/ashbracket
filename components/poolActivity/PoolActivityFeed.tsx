import Link from "next/link";
import { formatRelativeTimeEn } from "../../lib/datetime/formatRelativeTimeEn";
import type { PoolActivityFeedRow } from "../../lib/poolActivity/poolActivityTypes";

type PoolActivityFeedProps = {
  items: PoolActivityFeedRow[];
  /** When true, omit pool title and use tighter spacing (dashboard preview). */
  compact?: boolean;
};

function typeLabel(type: PoolActivityFeedRow["type"]): string {
  switch (type) {
    case "participant_joined":
      return "Joined";
    case "participant_submitted_picks":
      return "Picks";
    case "participant_updated_picks":
      return "Update";
    case "ash_daily_recap":
      return "Ash Daily Recap";
    default:
      return "Activity";
  }
}

function typeIcon(type: PoolActivityFeedRow["type"]): string {
  switch (type) {
    case "participant_joined":
      return "👋";
    case "participant_submitted_picks":
      return "✓";
    case "participant_updated_picks":
      return "↻";
    case "ash_daily_recap":
      return "📻";
    default:
      return "•";
  }
}

export function PoolActivityFeed({ items, compact }: PoolActivityFeedProps) {
  if (items.length === 0) {
    return (
      <div
        className={`rounded-xl border border-dashed border-ash-border bg-ash-body/30 text-center ${compact ? "px-4 py-6" : "px-6 py-12"}`}
      >
        <p className="text-sm text-ash-muted">
          No activity yet. Join events and pick milestones will show up here, plus
          one Ash recap per day once the pool is rolling.
        </p>
      </div>
    );
  }

  return (
    <ul className={`flex flex-col ${compact ? "gap-2" : "gap-3"}`}>
      {items.map((item) => {
        const isRecap = item.type === "ash_daily_recap";
        const rel = formatRelativeTimeEn(item.created_at);
        return (
          <li key={item.id}>
            <article
              className={`rounded-xl border px-4 py-3 ${
                isRecap
                  ? "border-ash-accent/40 bg-gradient-to-br from-ash-accent/10 to-ash-body/40 ring-1 ring-ash-accent/20"
                  : "border-ash-border bg-ash-surface"
              }`}
            >
              <div className="flex items-start gap-3">
                <span
                  className="mt-0.5 text-lg leading-none opacity-90"
                  aria-hidden
                >
                  {typeIcon(item.type)}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="text-xs font-semibold uppercase tracking-wide text-ash-muted">
                      {typeLabel(item.type)}
                    </span>
                    {isRecap && item.is_ai_generated ? (
                      <span className="rounded-full bg-ash-accent/25 px-2 py-0.5 text-[10px] font-bold uppercase text-ash-accent">
                        AI
                      </span>
                    ) : null}
                    <span className="text-xs text-ash-muted">{rel}</span>
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-ash-text">
                    {item.body_text}
                  </p>
                  {item.related_path &&
                  item.related_path.startsWith("/") &&
                  (item.type === "participant_submitted_picks" ||
                    item.type === "participant_updated_picks") ? (
                    <div className="mt-2">
                      <Link
                        href={item.related_path}
                        className="inline-flex text-xs font-medium text-ash-accent underline-offset-2 hover:underline"
                      >
                        View picks
                      </Link>
                    </div>
                  ) : null}
                </div>
              </div>
            </article>
          </li>
        );
      })}
    </ul>
  );
}
