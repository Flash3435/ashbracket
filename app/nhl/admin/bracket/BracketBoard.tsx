import type { NhlAdminBracketViewModel } from "@/lib/nhl/bracketViewModel";
import { roundLabel } from "@/lib/nhl/bracketViewModel";
import type { NhlSeriesRow } from "@/lib/nhl/types";
import { NhlTeamLogo } from "@/components/nhl/NhlTeamLogo";

function TeamBlock({
  abbr,
  name,
  role,
  teamSlug,
  logoPath,
}: {
  abbr: string | null;
  name: string | null;
  role: "higher" | "lower";
  teamSlug?: string | null;
  logoPath?: string | null;
}) {
  if (!abbr && !name) {
    return (
      <div className="rounded border border-slate-700/40 bg-slate-950/40 px-2 py-1.5">
        <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
          {role === "higher" ? "Higher seed" : "Lower seed"}
        </p>
        <p className="mt-0.5 text-sm font-medium text-slate-500">TBD</p>
      </div>
    );
  }
  const primary = abbr ?? name ?? "TBD";
  const secondary = abbr && name && abbr !== name ? name : null;

  return (
    <div className="flex items-start gap-2 rounded border border-blue-500/15 bg-slate-950/50 px-2 py-1.5">
      <NhlTeamLogo
        className="mt-0.5"
        size="sm"
        teamSlug={teamSlug}
        abbreviation={abbr}
        logoPath={logoPath}
        name={name ?? abbr}
      />
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
          {role === "higher" ? "Higher seed" : "Lower seed"}
        </p>
        <p
          className="mt-0.5 text-sm font-semibold text-ash-text"
          title={name ?? abbr ?? undefined}
        >
          {primary}
        </p>
        {secondary ? (
          <p className="truncate text-[11px] leading-tight text-slate-500" title={secondary}>
            {secondary}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function MatchupCard({
  series,
  label,
}: {
  series: NhlSeriesRow;
  label: string;
}) {
  const status = series.status.replaceAll("_", " ");
  const winner =
    series.winner_team_abbr ??
    (series.winner_team_name ? series.winner_team_name.slice(0, 14) : null);

  return (
    <div className="rounded-md border border-blue-500/25 bg-slate-950/60 px-3 py-2.5 shadow-sm">
      <p className="font-mono text-[10px] uppercase tracking-wide text-slate-500">{label}</p>
      <div className="mt-2 space-y-1.5">
        <TeamBlock
          abbr={series.higher_team_abbr}
          name={series.higher_team_name}
          role="higher"
          teamSlug={series.higher_team_slug}
          logoPath={series.higher_team_logo_path}
        />
        <p className="text-center text-[10px] text-slate-500">vs</p>
        <TeamBlock
          abbr={series.lower_team_abbr}
          name={series.lower_team_name}
          role="lower"
          teamSlug={series.lower_team_slug}
          logoPath={series.lower_team_logo_path}
        />
      </div>
      <p className="mt-2 text-[10px] capitalize text-slate-400">{status}</p>
      {winner ? (
        <p className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px] text-emerald-300/90">
          <span>Winner:</span>
          <NhlTeamLogo
            size="sm"
            teamSlug={series.winner_team_slug}
            abbreviation={series.winner_team_abbr}
            logoPath={series.winner_team_logo_path}
            name={series.winner_team_name ?? series.winner_team_abbr}
          />
          <span className="font-semibold">{winner}</span>
        </p>
      ) : null}
    </div>
  );
}

function ConferenceColumn({
  title,
  roundTitle,
  seriesList,
  labelPrefix,
}: {
  title: string | null;
  roundTitle: string;
  seriesList: NhlSeriesRow[];
  labelPrefix: string;
}) {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-2">
      {title ? (
        <h3 className="text-center text-[11px] font-semibold uppercase tracking-wide text-slate-400">
          {title}
        </h3>
      ) : (
        <div className="h-4" aria-hidden />
      )}
      <p className="text-center text-[11px] font-medium text-slate-400">{roundTitle}</p>
      <div className="flex flex-col gap-2">
        {seriesList.map((s) => (
          <MatchupCard
            key={s.id}
            series={s}
            label={`${labelPrefix}${s.round_code} · slot ${s.slot_index}`}
          />
        ))}
      </div>
    </div>
  );
}

function ConferenceBlock({
  bracket,
  labelPrefix,
}: {
  bracket: NhlAdminBracketViewModel["east"];
  labelPrefix: string;
}) {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-3 rounded-lg border border-blue-500/15 bg-slate-950/30 p-3 lg:flex-row lg:items-start lg:justify-center lg:gap-3">
      <ConferenceColumn
        title={null}
        roundTitle={roundLabel("R1")}
        seriesList={bracket.r1}
        labelPrefix={labelPrefix}
      />
      <ConferenceColumn
        title={null}
        roundTitle={roundLabel("R2")}
        seriesList={bracket.r2}
        labelPrefix={labelPrefix}
      />
      <div className="flex min-w-0 flex-1 flex-col gap-2 lg:max-w-[180px]">
        <div className="h-4" aria-hidden />
        <p className="text-center text-[11px] font-medium text-slate-400">{roundLabel("CF")}</p>
        {bracket.cf ? (
          <MatchupCard series={bracket.cf} label={`${labelPrefix}CF`} />
        ) : (
          <p className="rounded-md border border-dashed border-slate-600/50 px-2 py-4 text-center text-xs text-slate-500">
            TBD
          </p>
        )}
      </div>
    </div>
  );
}

export function BracketBoard({ model }: { model: NhlAdminBracketViewModel }) {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-8 xl:flex-row xl:items-start xl:justify-center xl:gap-6">
        <div className="min-w-0 flex-1 xl:max-w-none">
          <p className="mb-3 text-center text-xs font-semibold uppercase tracking-wider text-blue-200/80">
            Eastern Conference
          </p>
          <ConferenceBlock bracket={model.east} labelPrefix="E · " />
        </div>

        <div className="flex shrink-0 flex-col xl:w-[220px]">
          <p className="mb-3 text-center text-xs font-semibold uppercase tracking-wider text-amber-200/80">
            {roundLabel("SCF")}
          </p>
          {model.scf ? (
            <MatchupCard series={model.scf} label="SCF" />
          ) : (
            <div className="rounded-md border border-dashed border-amber-500/30 bg-slate-950/40 px-3 py-8 text-center text-sm text-slate-500">
              TBD
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1 xl:max-w-none">
          <p className="mb-3 text-center text-xs font-semibold uppercase tracking-wider text-blue-200/80">
            Western Conference
          </p>
          <ConferenceBlock bracket={model.west} labelPrefix="W · " />
        </div>
      </div>
      <p className="text-center text-xs text-ash-muted">
        Read-only admin view. Updates to assignments and outcomes are made through data maintenance
        or the database.
      </p>
    </div>
  );
}
