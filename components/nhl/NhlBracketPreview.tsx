import type { NhlAdminBracketViewModel } from "@/lib/nhl/bracketViewModel";
import { roundLabel } from "@/lib/nhl/bracketViewModel";
import type { NhlSeriesRow } from "@/lib/nhl/types";

function TeamLine({
  abbr,
  name,
  role,
}: {
  abbr: string | null;
  name: string | null;
  role: "higher" | "lower";
}) {
  if (!abbr && !name) {
    return (
      <div className="rounded border border-slate-700/50 bg-slate-950/50 px-2.5 py-2">
        <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
          {role === "higher" ? "Higher seed" : "Lower seed"}
        </p>
        <p className="mt-0.5 text-sm font-medium text-slate-500">TBD</p>
      </div>
    );
  }
  const primary = abbr ?? name ?? "—";
  const secondary = abbr && name && abbr !== name ? name : null;
  return (
    <div className="rounded border border-blue-500/20 bg-slate-950/55 px-2.5 py-2">
      <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
        {role === "higher" ? "Higher seed" : "Lower seed"}
      </p>
      <p className="mt-0.5 text-sm font-semibold text-ash-text" title={name ?? abbr ?? undefined}>
        {primary}
      </p>
      {secondary ? (
        <p className="truncate text-[11px] leading-tight text-slate-500" title={secondary}>
          {secondary}
        </p>
      ) : null}
    </div>
  );
}

function statusPhrase(status: NhlSeriesRow["status"]) {
  if (status === "complete") return "Series complete";
  if (status === "in_progress") return "In progress";
  return null;
}

function PublicMatchupCard({
  series,
  headline,
}: {
  series: NhlSeriesRow;
  headline: string;
}) {
  const status = statusPhrase(series.status);
  const winner =
    series.winner_team_abbr ??
    (series.winner_team_name ? series.winner_team_name.slice(0, 12) : null);

  return (
    <div className="rounded-lg border border-blue-500/20 bg-slate-950/50 px-3 py-2.5 shadow-sm">
      <p className="font-mono text-[10px] uppercase tracking-wide text-slate-500">{headline}</p>
      <div className="mt-2 space-y-1">
        <TeamLine abbr={series.higher_team_abbr} name={series.higher_team_name} role="higher" />
        <p className="py-0.5 text-center text-[10px] text-slate-500">vs</p>
        <TeamLine abbr={series.lower_team_abbr} name={series.lower_team_name} role="lower" />
      </div>
      {status ? <p className="mt-2 text-[10px] text-slate-400">{status}</p> : null}
      {winner ? (
        <p className="mt-1 text-[10px] text-emerald-300/90">
          Winner: <span className="font-semibold">{winner}</span>
        </p>
      ) : null}
    </div>
  );
}

function Round1Column({
  title,
  labelPrefix,
  rows,
}: {
  title: string;
  labelPrefix: string;
  rows: NhlSeriesRow[];
}) {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-2">
      <h3 className="text-center text-xs font-semibold uppercase tracking-wider text-blue-200/85">
        {title}
      </h3>
      <p className="text-center text-[11px] text-slate-500">{roundLabel("R1")}</p>
      <div className="flex flex-col gap-2">
        {rows.map((s) => (
          <PublicMatchupCard
            key={s.id}
            series={s}
            headline={`${labelPrefix}${s.slot_index}`}
          />
        ))}
      </div>
    </div>
  );
}

function LaterRoundStrip({
  title,
  rows,
  single,
  emptyHint,
}: {
  title: string;
  rows: NhlSeriesRow[];
  single?: NhlSeriesRow | null;
  emptyHint: string;
}) {
  const list = single !== undefined ? (single ? [single] : []) : rows;
  const hasAnyTeams = list.some(
    (s) =>
      s.higher_team_abbr ||
      s.higher_team_name ||
      s.lower_team_abbr ||
      s.lower_team_name,
  );

  return (
    <div className="rounded-lg border border-blue-500/10 bg-slate-950/35 px-3 py-3">
      <p className="text-center text-xs font-semibold text-slate-300">{title}</p>
      {!hasAnyTeams ? (
        <p className="mt-2 text-center text-xs leading-relaxed text-slate-500">{emptyHint}</p>
      ) : (
        <div
          className={`mt-3 grid gap-2 ${list.length > 1 ? "sm:grid-cols-2" : "grid-cols-1"}`}
        >
          {list.map((s) => (
            <PublicMatchupCard
              key={s.id}
              series={s}
              headline={single !== undefined ? title : `${title} · ${s.slot_index}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/** Read-only bracket preview for public NHL pages (no admin copy). */
export function NhlBracketPreview({ model }: { model: NhlAdminBracketViewModel }) {
  const eastR1 = [...model.east.r1].sort((a, b) => a.slot_index - b.slot_index);
  const westR1 = [...model.west.r1].sort((a, b) => a.slot_index - b.slot_index);

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-center lg:gap-5">
        <Round1Column title="Eastern Conference" labelPrefix="E · " rows={eastR1} />
        <Round1Column title="Western Conference" labelPrefix="W · " rows={westR1} />
      </div>

      <LaterRoundStrip
        title={roundLabel("R2")}
        rows={[...model.east.r2, ...model.west.r2].sort((a, b) => {
          const side = (x: NhlSeriesRow) => (x.side_or_conference === "west" ? 1 : 0);
          const ds = side(a) - side(b);
          if (ds !== 0) return ds;
          return a.slot_index - b.slot_index;
        })}
        emptyHint="Round 2 slots fill in once Round 1 winners advance."
      />

      <div className="grid gap-3 md:grid-cols-2">
        <LaterRoundStrip
          title={`East ${roundLabel("CF")}`}
          rows={[]}
          single={model.east.cf}
          emptyHint="Conference final matchup is set after earlier rounds."
        />
        <LaterRoundStrip
          title={`West ${roundLabel("CF")}`}
          rows={[]}
          single={model.west.cf}
          emptyHint="Conference final matchup is set after earlier rounds."
        />
      </div>

      <LaterRoundStrip
        title={roundLabel("SCF")}
        rows={[]}
        single={model.scf}
        emptyHint="Stanley Cup Final pairing is set once conference champions are known."
      />
    </div>
  );
}
