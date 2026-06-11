import { TeamFlagName } from "@/components/tournament/TeamFlagName";
import {
  formatStatLeaderNames,
  type TournamentStatCategoryLeader,
  type TournamentStatLeadersView,
} from "@/lib/tournament/matchTeamStats/buildTournamentStatLeadersView";

type Variant = "admin" | "user";

type Props = {
  variant: Variant;
  view: TournamentStatLeadersView;
  className?: string;
};

function CategoryRow({ category }: { category: TournamentStatCategoryLeader }) {
  const hasLeaders = category.leaders.length > 0;

  return (
    <div className="rounded-lg border border-ash-border/70 bg-ash-body/25 px-3 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-ash-muted">
        {category.shortLabel}
      </p>
      {hasLeaders ? (
        <div className="mt-2 space-y-2">
          {category.leaders.map((leader) => (
            <div
              key={leader.teamId}
              className="flex flex-wrap items-center justify-between gap-2"
            >
              <TeamFlagName
                countryCode={leader.countryCode}
                teamName={leader.teamName}
                nameClassName="font-semibold text-ash-text"
              />
              <span className="text-sm font-bold tabular-nums text-ash-text">
                {leader.total}
              </span>
            </div>
          ))}
          {category.leaders.length > 1 ? (
            <p className="text-xs text-ash-muted">
              Tied: {formatStatLeaderNames(category.leaders)}
            </p>
          ) : null}
          {category.pickCount != null ? (
            <p className="text-xs text-ash-muted">
              {category.leaders[0]!.teamName} leads{" "}
              {category.shortLabel.replace(/^Most /i, "").toLowerCase()} —{" "}
              {category.pickCount}{" "}
              {category.pickCount === 1 ? "bracket" : "brackets"} picked{" "}
              {category.leaders[0]!.teamName}
            </p>
          ) : null}
        </div>
      ) : (
        <p className="mt-2 text-sm text-ash-muted">{category.emptyMessage}</p>
      )}
    </div>
  );
}

export function TournamentStatLeadersPanel({ variant, view, className = "" }: Props) {
  const heading = variant === "admin" ? "Tournament stat leaders" : "Bonus watch";
  const subcopy =
    "Current leaders for goals, yellow cards, and red cards.";

  return (
    <section
      className={`rounded-xl border border-ash-border bg-ash-surface p-4 ${className}`}
    >
      <div>
        <h2 className="text-base font-bold text-ash-text">{heading}</h2>
        <p className="mt-0.5 text-xs text-ash-muted">{subcopy}</p>
      </div>

      {view.fullyEmpty ? (
        <p className="mt-4 text-sm text-ash-muted">
          No tournament stats entered yet.
        </p>
      ) : (
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <CategoryRow category={view.goals} />
          <CategoryRow category={view.yellowCards} />
          <CategoryRow category={view.redCards} />
        </div>
      )}

      {variant === "admin" ? (
        <p className="mt-4 text-xs text-ash-muted">
          Bonus result publishing is separate from stat entry.
        </p>
      ) : null}
    </section>
  );
}
