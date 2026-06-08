import type { NhlAdminBracketViewModel } from "@/lib/nhl/bracketViewModel";
import { roundLabel } from "@/lib/nhl/bracketViewModel";
import { NhlTeamLogo } from "@/components/nhl/NhlTeamLogo";
import { buildNhlSeriesStatePresentation, nhlTeamSlotOutcome } from "@/lib/nhl/nhlSeriesStateText";
import type { NhlSeriesRow } from "@/lib/nhl/types";

function TeamBlock({
  abbr,
  name,
  role,
  teamSlug,
  logoPath,
  teamId,
  winnerTeamId,
}: {
  abbr: string | null;
  name: string | null;
  role: "higher" | "lower";
  teamSlug?: string | null;
  logoPath?: string | null;
  teamId: string | null;
  winnerTeamId: string | null;
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
  const outcome = nhlTeamSlotOutcome(winnerTeamId, teamId);
  const emphasis =
    outcome === "winner"
      ? "border-emerald-500/40 bg-emerald-950/35 ring-1 ring-emerald-500/20"
      : outcome === "loser"
        ? "border-slate-600/35 bg-slate-950/40 opacity-[0.72]"
        : "border-blue-500/15 bg-slate-950/50";
  const primary = abbr ?? name ?? "TBD";
  const secondary = abbr && name && abbr !== name ? name : null;

  return (
    <div className={`flex items-start gap-2 rounded border px-2 py-1.5 ${emphasis}`}>
      <NhlTeamLogo
        className={`mt-0.5 ${outcome === "loser" ? "opacity-75" : ""}`}
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
          className={`mt-0.5 text-sm font-semibold text-ash-text ${outcome === "loser" ? "text-slate-400" : ""}`}
          title={name ?? abbr ?? undefined}
        >
          {primary}
          {outcome === "winner" ? (
            <span className="ml-1.5 align-middle font-sans text-[10px] font-semibold uppercase tracking-wide text-emerald-300/90">
              W
            </span>
          ) : null}
        </p>
        {secondary ? (
          <p className={`truncate text-[11px] leading-tight ${outcome === "loser" ? "text-slate-600" : "text-slate-500"}`} title={secondary}>
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
  const pres = buildNhlSeriesStatePresentation(series);
  const showScore = Boolean(pres.scoreHigherLower);

  return (
    <div className="rounded-md border border-blue-500/25 bg-slate-950/60 px-3 py-2.5 shadow-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
        <p className="font-mono text-[10px] uppercase tracking-wide text-slate-500">{label}</p>
        <span className="shrink-0 rounded border border-slate-500/35 bg-slate-900/60 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-200/95">
          {pres.statusLabel}
        </span>
      </div>
      {showScore ? (
        <p className="mt-2 text-center text-xs font-semibold tabular-nums text-slate-100">
          {pres.scoreHigherLower}
        </p>
      ) : null}
      <div className={showScore ? "mt-1.5 space-y-1.5" : "mt-2 space-y-1.5"}>
        <TeamBlock
          abbr={series.higher_team_abbr}
          name={series.higher_team_name}
          role="higher"
          teamSlug={series.higher_team_slug}
          logoPath={series.higher_team_logo_path}
          teamId={series.higher_seed_team_id}
          winnerTeamId={pres.winnerTeamId ?? series.winner_team_id}
        />
        <p className="text-center text-[10px] text-slate-500">vs</p>
        <TeamBlock
          abbr={series.lower_team_abbr}
          name={series.lower_team_name}
          role="lower"
          teamSlug={series.lower_team_slug}
          logoPath={series.lower_team_logo_path}
          teamId={series.lower_seed_team_id}
          winnerTeamId={pres.winnerTeamId ?? series.winner_team_id}
        />
      </div>
      <p className="mt-2 text-[11px] leading-snug text-slate-300">{pres.primaryLine}</p>
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
