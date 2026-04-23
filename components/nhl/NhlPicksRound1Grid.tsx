import type { NhlSeriesRow } from "@/lib/nhl/types";
import { NhlTeamLogo } from "./NhlTeamLogo";

function conferenceWord(side: NhlSeriesRow["side_or_conference"]): string {
  if (side === "east") return "East";
  if (side === "west") return "West";
  if (side === "cup") return "Stanley Cup";
  return "Playoffs";
}

function slotHeadline(series: NhlSeriesRow): string {
  if (series.side_or_conference === "east" || series.side_or_conference === "west") {
    const letter = series.side_or_conference === "east" ? "E" : "W";
    return `${letter} · ${series.slot_index}`;
  }
  return `Slot ${series.slot_index}`;
}

function TeamBlock({
  abbr,
  name,
  seedLabel,
  teamSlug,
  logoPath,
}: {
  abbr: string | null;
  name: string | null;
  seedLabel: string;
  teamSlug?: string | null;
  logoPath?: string | null;
}) {
  if (!abbr && !name) {
    return (
      <div className="rounded-lg border border-dashed border-slate-600/60 bg-slate-950/40 px-3 py-2.5">
        <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">{seedLabel}</p>
        <p className="mt-0.5 text-sm font-medium text-slate-500">To be determined</p>
      </div>
    );
  }
  const primary = abbr ?? name ?? "—";
  const secondary = name && abbr && name !== abbr ? name : name && !abbr ? name : null;
  return (
    <div className="flex items-start gap-3 rounded-lg border border-blue-500/25 bg-slate-950/55 px-3 py-2.5">
      <NhlTeamLogo
        className="mt-0.5"
        size="md"
        teamSlug={teamSlug}
        abbreviation={abbr}
        logoPath={logoPath}
        name={name ?? abbr}
      />
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">{seedLabel}</p>
        <p className="mt-0.5 font-mono text-base font-semibold tracking-tight text-ash-text">{primary}</p>
        {secondary ? (
          <p className="mt-0.5 truncate text-xs leading-snug text-slate-400" title={secondary}>
            {secondary}
          </p>
        ) : null}
      </div>
    </div>
  );
}

export function NhlPicksMatchupCard({ series }: { series: NhlSeriesRow }) {
  const conf = conferenceWord(series.side_or_conference);
  const headline = slotHeadline(series);
  const hasPairing = Boolean(
    (series.higher_team_abbr || series.higher_team_name) &&
      (series.lower_team_abbr || series.lower_team_name),
  );

  return (
    <article className="rounded-xl border border-blue-500/20 bg-gradient-to-b from-slate-950/70 to-slate-950/40 p-4 shadow-md shadow-blue-950/15">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="rounded-full border border-blue-400/25 bg-blue-950/40 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-blue-200/90">
          {conf}
        </span>
        <span className="font-mono text-[11px] font-medium uppercase tracking-wider text-slate-500">
          {headline}
        </span>
      </div>
      <div className="mt-3 space-y-2">
        <TeamBlock
          abbr={series.higher_team_abbr}
          name={series.higher_team_name}
          seedLabel="Higher seed"
          teamSlug={series.higher_team_slug}
          logoPath={series.higher_team_logo_path}
        />
        <p className="py-0.5 text-center text-[11px] font-medium uppercase tracking-widest text-slate-500">
          vs
        </p>
        <TeamBlock
          abbr={series.lower_team_abbr}
          name={series.lower_team_name}
          seedLabel="Lower seed"
          teamSlug={series.lower_team_slug}
          logoPath={series.lower_team_logo_path}
        />
      </div>
      {hasPairing ? (
        <p className="mt-3 text-[11px] text-emerald-200/85">
          Both teams are set—your series winner pick will go here.
        </p>
      ) : (
        <p className="mt-3 text-[11px] text-slate-500">Opponents for this series are not filled in yet.</p>
      )}
    </article>
  );
}

function sortBySlot(rows: NhlSeriesRow[]): NhlSeriesRow[] {
  return [...rows].sort((a, b) => a.slot_index - b.slot_index);
}

export function NhlPicksRound1Grid({
  east,
  west,
  fallback,
}: {
  east: NhlSeriesRow[];
  west: NhlSeriesRow[];
  /** Used when rows are not grouped by conference in the view model. */
  fallback?: NhlSeriesRow[];
}) {
  const eastSorted = sortBySlot(east);
  const westSorted = sortBySlot(west);
  const useFallback =
    fallback &&
    fallback.length > 0 &&
    eastSorted.length === 0 &&
    westSorted.length === 0;

  if (useFallback) {
    const rows = sortBySlot(fallback);
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {rows.map((s) => (
          <NhlPicksMatchupCard key={s.id} series={s} />
        ))}
      </div>
    );
  }

  return (
    <div className="grid gap-8 lg:grid-cols-2">
      <div>
        <h3 className="text-center text-sm font-semibold uppercase tracking-widest text-blue-200/90">
          Eastern Conference · Round 1
        </h3>
        <p className="mt-1 text-center text-xs text-slate-500">Eight teams, four series—you will pick each winner.</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {eastSorted.map((s) => (
            <NhlPicksMatchupCard key={s.id} series={s} />
          ))}
        </div>
        {eastSorted.length === 0 ? (
          <p className="mt-4 text-center text-sm text-slate-500">No Eastern Round 1 rows are loaded for this edition.</p>
        ) : null}
      </div>
      <div>
        <h3 className="text-center text-sm font-semibold uppercase tracking-widest text-blue-200/90">
          Western Conference · Round 1
        </h3>
        <p className="mt-1 text-center text-xs text-slate-500">Eight teams, four series—you will pick each winner.</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {westSorted.map((s) => (
            <NhlPicksMatchupCard key={s.id} series={s} />
          ))}
        </div>
        {westSorted.length === 0 ? (
          <p className="mt-4 text-center text-sm text-slate-500">No Western Round 1 rows are loaded for this edition.</p>
        ) : null}
      </div>
    </div>
  );
}
