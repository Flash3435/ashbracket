import { TeamFlagName } from "@/components/tournament/TeamFlagName";
import type { ChampionPickExposure } from "@/lib/pool/buildChampionPickExposure";

type Props = {
  exposure: ChampionPickExposure;
  /** When true, wrap content in a collapsed disclosure below the leaderboard. */
  collapsible?: boolean;
};

function ExposureRow({
  row,
  muted = false,
}: {
  row: ChampionPickExposure["surviving"][number];
  muted?: boolean;
}) {
  return (
    <li
      className={`flex flex-wrap items-center justify-between gap-2 py-2.5 first:pt-0 last:pb-0 ${
        muted ? "opacity-70" : ""
      }`}
    >
      <div className="min-w-0 flex-1">
        <TeamFlagName
          countryCode={row.teamCode ?? ""}
          teamName={row.teamName}
          nameClassName={`font-medium ${muted ? "text-ash-muted line-through" : "text-ash-text"}`}
        />
        {muted ? (
          <p className="mt-0.5 text-xs text-ash-muted">Eliminated</p>
        ) : null}
      </div>
      <div className="shrink-0 text-right">
        <p className="text-sm font-semibold tabular-nums text-ash-text">
          {row.count}
        </p>
        <p className="text-xs tabular-nums text-ash-muted">{row.percentage}%</p>
      </div>
    </li>
  );
}

function ExposureBody({ exposure }: { exposure: ChampionPickExposure }) {
  const hasSurviving = exposure.surviving.length > 0;
  const showEliminated = exposure.eliminated.length > 0;

  return (
    <>
      <p className="max-w-3xl text-sm leading-relaxed text-ash-muted">
        Shows how many pool brackets still have each champion pick alive.
      </p>

      {hasSurviving ? (
        <ul className="mt-4 divide-y divide-ash-border/50">
          {exposure.surviving.map((row) => (
            <ExposureRow key={row.teamId} row={row} />
          ))}
        </ul>
      ) : (
        <p className="mt-4 text-sm text-ash-muted">
          No champion picks are still alive.
        </p>
      )}

      {showEliminated ? (
        <div className="mt-5 border-t border-ash-border/50 pt-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-ash-muted">
            Eliminated champion picks
          </p>
          <ul className="mt-2 divide-y divide-ash-border/40">
            {exposure.eliminated.map((row) => (
              <ExposureRow key={row.teamId} row={row} muted />
            ))}
          </ul>
        </div>
      ) : null}
    </>
  );
}

export function ChampionPickExposureCard({ exposure, collapsible = false }: Props) {
  if (collapsible) {
    return (
      <details className="rounded-xl border border-ash-border/70 bg-ash-body/25">
        <summary className="cursor-pointer list-none px-5 py-4 text-lg font-bold text-ash-text marker:content-none sm:px-6 sm:text-xl [&::-webkit-details-marker]:hidden">
          Champion picks still alive
        </summary>
        <div className="border-t border-ash-border/50 px-5 pb-5 pt-4 sm:px-6">
          <ExposureBody exposure={exposure} />
        </div>
      </details>
    );
  }

  return (
    <section className="rounded-xl border border-ash-border/70 bg-ash-body/25 px-5 py-5 sm:px-6">
      <h2 className="text-lg font-bold text-ash-text sm:text-xl">
        Champion picks still alive
      </h2>
      <ExposureBody exposure={exposure} />
    </section>
  );
}
