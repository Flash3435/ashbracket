import { KickoffTimeDisplay } from "@/components/datetime/KickoffTimeDisplay";
import { TeamFlagName } from "@/components/tournament/TeamFlagName";
import type {
  KnockoutMatchExposure,
  KnockoutMatchExposureFixture,
  MatchExposureSwing,
} from "@/lib/pool/buildKnockoutMatchExposure";

type Props = {
  exposure: KnockoutMatchExposure;
};

function swingLabel(swing: MatchExposureSwing | null): string | null {
  if (!swing) return null;
  if (swing === "big") return "Big swing";
  if (swing === "medium") return "Medium swing";
  return "Small swing";
}

function bracketCountLabel(count: number): string {
  return count === 1 ? "1 bracket" : `${count} brackets`;
}

function MatchExposureCard({ fixture }: { fixture: KnockoutMatchExposureFixture }) {
  const swing = swingLabel(fixture.swing);

  return (
    <article className="rounded-lg border border-ash-border/60 bg-ash-body/20 px-4 py-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-[11px] text-ash-muted">{fixture.stageLabel}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm font-semibold text-ash-text">
            <TeamFlagName
              countryCode={fixture.homeCountryCode}
              teamName={fixture.homeTeamName}
            />
            <span className="text-ash-muted">vs</span>
            <TeamFlagName
              countryCode={fixture.awayCountryCode}
              teamName={fixture.awayTeamName}
            />
          </div>
          <KickoffTimeDisplay
            iso={fixture.kickoffAt}
            layout="split"
            dateClassName="mt-2 text-xs text-ash-muted"
            timeClassName="text-xs text-ash-muted"
            className="mt-2 text-xs text-ash-muted"
          />
        </div>
        {fixture.status === "live" ? (
          <span className="rounded-full border border-red-800/60 bg-red-950/50 px-2 py-0.5 text-[10px] font-medium text-red-200">
            Live
          </span>
        ) : null}
      </div>

      {fixture.hasExposure ? (
        <ul className="mt-4 space-y-2 text-sm text-ash-text">
          <li>
            {fixture.homeTeamName} helps {bracketCountLabel(fixture.homeHelpsCount)}
          </li>
          <li>
            {fixture.awayTeamName} helps {bracketCountLabel(fixture.awayHelpsCount)}
          </li>
          <li className="text-ash-muted">
            Neutral: {bracketCountLabel(fixture.neutralCount)}
          </li>
        </ul>
      ) : (
        <p className="mt-4 text-sm text-ash-muted">
          No bracket exposure for this match yet.
        </p>
      )}

      {swing ? (
        <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-amber-100/90">
          {swing}
        </p>
      ) : null}
    </article>
  );
}

export function KnockoutMatchExposureSection({ exposure }: Props) {
  if (exposure.fixtures.length === 0) return null;

  return (
    <section className="rounded-xl border border-ash-border/70 bg-ash-body/25 px-5 py-5 sm:px-6">
      <h2 className="text-lg font-bold text-ash-text sm:text-xl">
        Who needs this result?
      </h2>
      <p className="mt-2 max-w-3xl text-sm leading-relaxed text-ash-muted">
        Shows how many completed brackets benefit from each team advancing.
      </p>

      <div className="mt-4 space-y-3">
        {exposure.fixtures.map((fixture) => (
          <MatchExposureCard key={fixture.matchId} fixture={fixture} />
        ))}
      </div>
    </section>
  );
}
