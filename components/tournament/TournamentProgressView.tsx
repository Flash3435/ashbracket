import type {
  PublicTournamentProgressPayload,
  TournamentMatchPublicRow,
} from "../../types/tournamentPublic";
import {
  knockoutAdvancementByStage,
  summarizeTournamentStage,
} from "../../lib/tournament/publicTournamentSummary";

function formatWhen(iso: string | null | undefined): string {
  if (iso == null || iso === "") return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(d);
}

function teamLabel(name: string | null, code: string | null): string {
  if (name) return name;
  if (code) return code;
  return "TBD";
}

function scoreLine(m: TournamentMatchPublicRow): string {
  if (m.status !== "finished" && m.status !== "live") return "—";
  if (m.home_goals == null || m.away_goals == null) return "—";
  let s = `${m.home_goals} – ${m.away_goals}`;
  if (
    m.home_penalties != null &&
    m.away_penalties != null &&
    m.home_goals === m.away_goals
  ) {
    s += ` (${m.home_penalties}–${m.away_penalties} pens)`;
  }
  return s;
}

function statusPill(status: string): string {
  switch (status) {
    case "finished":
      return "rounded-full bg-zinc-200 px-2 py-0.5 text-xs font-medium text-zinc-800";
    case "live":
      return "rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-900";
    case "scheduled":
      return "rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-900";
    case "postponed":
    case "cancelled":
      return "rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-950";
    default:
      return "rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-700";
  }
}

function MatchRow({ m }: { m: TournamentMatchPublicRow }) {
  const meta = [m.stage_label];
  if (m.group_code) meta.push(`Group ${m.group_code}`);

  return (
    <li className="border-b border-zinc-100 py-3 last:border-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-zinc-500">{meta.join(" · ")}</p>
        <span className={statusPill(m.status)}>{m.status}</span>
      </div>
      <p className="mt-1 font-mono text-[11px] text-zinc-400">{m.match_code}</p>
      <p className="mt-1 text-sm text-zinc-500">{formatWhen(m.kickoff_at)}</p>
      <div className="mt-2 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <p className="text-sm font-medium text-zinc-900">
          {teamLabel(m.home_team_name, m.home_country_code)}
          <span className="mx-2 font-normal text-zinc-400">vs</span>
          {teamLabel(m.away_team_name, m.away_country_code)}
        </p>
        <p className="text-sm tabular-nums text-zinc-700">{scoreLine(m)}</p>
      </div>
      {m.status === "finished" && m.winner_team_name ? (
        <p className="mt-1 text-xs text-emerald-800">
          Winner: {m.winner_team_name}
        </p>
      ) : null}
    </li>
  );
}

type Props = {
  payload: PublicTournamentProgressPayload;
};

export function TournamentProgressView({ payload }: Props) {
  const { edition, matches } = payload;
  const narrative = summarizeTournamentStage(matches);

  const completed = matches.filter((m) => m.status === "finished");
  const upcoming = matches.filter(
    (m) => m.status === "scheduled" || m.status === "postponed",
  );
  const live = matches.filter((m) => m.status === "live");

  const koAdvance = knockoutAdvancementByStage(matches);

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
        <h2 className="text-base font-semibold text-zinc-900">Edition</h2>
        {edition ? (
          <ul className="mt-2 space-y-1 text-sm text-zinc-700">
            <li>
              <span className="font-medium text-zinc-900">Name: </span>
              {edition.name}
            </li>
            <li className="text-zinc-500">
              {edition.starts_on ?? "—"} → {edition.ends_on ?? "—"}
            </li>
          </ul>
        ) : (
          <p className="mt-2 text-sm text-amber-900">
            The configured official edition is not in the database yet.
          </p>
        )}
      </section>

      <section className="rounded-lg border border-emerald-200 bg-emerald-50/40 p-4 shadow-sm">
        <h2 className="text-base font-semibold text-zinc-900">Current stage</h2>
        <p className="mt-2 text-sm font-medium text-emerald-950">{narrative.headline}</p>
        <p className="mt-1 text-sm leading-relaxed text-emerald-900/90">
          {narrative.supporting}
        </p>
        <dl className="mt-3 grid gap-2 text-sm text-zinc-700 sm:grid-cols-3">
          <div>
            <dt className="text-xs font-medium text-zinc-500">Finished</dt>
            <dd className="tabular-nums">{completed.length}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-zinc-500">Upcoming</dt>
            <dd className="tabular-nums">{upcoming.length}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-zinc-500">Live</dt>
            <dd className="tabular-nums">{live.length}</dd>
          </div>
        </dl>
      </section>

      {koAdvance.length > 0 ? (
        <section className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
          <h2 className="text-base font-semibold text-zinc-900">
            Knockout progression
          </h2>
          <p className="mt-1 text-xs text-zinc-500">
            Teams that have won a match in each knockout stage (from official results
            in the database).
          </p>
          <ul className="mt-3 space-y-4">
            {koAdvance.map((block) => (
              <li key={block.stage_code}>
                <h3 className="text-sm font-semibold text-zinc-800">
                  {block.stage_label}
                </h3>
                <ul className="mt-1.5 flex flex-wrap gap-2">
                  {block.winners.map((w, i) => (
                    <li
                      key={`${block.stage_code}-${w.name}-${i}`}
                      className="rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1 text-xs text-zinc-800"
                    >
                      {w.name}
                      {w.countryCode ? (
                        <span className="ml-1 text-zinc-500">({w.countryCode})</span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
        <h2 className="mb-2 text-base font-semibold text-zinc-900">
          Recent results
        </h2>
        {completed.length === 0 ? (
          <p className="text-sm text-zinc-600">No finished matches yet.</p>
        ) : (
          <ul className="divide-y divide-zinc-100">
            {[...completed]
              .sort((a, b) => {
                const ta = a.kickoff_at ? new Date(a.kickoff_at).getTime() : 0;
                const tb = b.kickoff_at ? new Date(b.kickoff_at).getTime() : 0;
                return tb - ta;
              })
              .slice(0, 24)
              .map((m) => (
                <MatchRow key={m.match_id} m={m} />
              ))}
          </ul>
        )}
        {completed.length > 24 ? (
          <p className="mt-2 text-xs text-zinc-500">
            Showing the 24 most recent finished matches.
          </p>
        ) : null}
      </section>

      <section className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
        <h2 className="mb-2 text-base font-semibold text-zinc-900">
          Upcoming matches
        </h2>
        {upcoming.length === 0 ? (
          <p className="text-sm text-zinc-600">
            No scheduled matches left in the dataset.
          </p>
        ) : (
          <ul>
            {upcoming.map((m) => (
              <MatchRow key={m.match_id} m={m} />
            ))}
          </ul>
        )}
      </section>

      {live.length > 0 ? (
        <section className="rounded-lg border border-red-200 bg-red-50/50 p-4 shadow-sm">
          <h2 className="text-base font-semibold text-red-950">Live now</h2>
          <ul className="mt-2">
            {live.map((m) => (
              <MatchRow key={m.match_id} m={m} />
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
