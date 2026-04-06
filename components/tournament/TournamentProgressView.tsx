import type {
  PublicTournamentProgressPayload,
  TournamentMatchPublicRow,
} from "../../types/tournamentPublic";
import { formatKickoffAmericaEdmonton } from "../../lib/datetime/scheduleDisplay";
import {
  knockoutAdvancementByStage,
  summarizeTournamentStage,
} from "../../lib/tournament/publicTournamentSummary";

function formatWhen(iso: string | null | undefined): string {
  const p = formatKickoffAmericaEdmonton(iso);
  if (p.singleLineFallback) {
    return p.singleLineFallback === "Time TBD" ? "—" : p.singleLineFallback;
  }
  return `${p.dateLine} · ${p.timeLine}`;
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
      return "rounded-full bg-slate-600 px-2 py-0.5 text-xs font-medium text-slate-100";
    case "live":
      return "rounded-full border border-red-800/60 bg-red-950/50 px-2 py-0.5 text-xs font-medium text-red-200";
    case "scheduled":
      return "rounded-full bg-ash-accent/15 px-2 py-0.5 text-xs font-medium text-ash-accent";
    case "postponed":
    case "cancelled":
      return "rounded-full bg-amber-950/50 px-2 py-0.5 text-xs font-medium text-amber-100";
    default:
      return "rounded-full bg-ash-surface px-2 py-0.5 text-xs font-medium text-ash-muted";
  }
}

function MatchRow({ m }: { m: TournamentMatchPublicRow }) {
  const meta = [m.stage_label];
  if (m.group_code) meta.push(`Group ${m.group_code}`);

  return (
    <li className="border-b border-ash-border py-3 last:border-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-ash-muted">{meta.join(" · ")}</p>
        <span className={statusPill(m.status)}>{m.status}</span>
      </div>
      <p className="mt-1 font-mono text-[11px] text-ash-border-hover">{m.match_code}</p>
      <p className="mt-1 text-sm text-ash-muted">{formatWhen(m.kickoff_at)}</p>
      <div className="mt-2 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <p className="text-sm font-medium text-ash-text">
          {teamLabel(m.home_team_name, m.home_country_code)}
          <span className="mx-2 font-normal text-ash-border-hover">vs</span>
          {teamLabel(m.away_team_name, m.away_country_code)}
        </p>
        <p className="text-sm tabular-nums text-ash-muted">{scoreLine(m)}</p>
      </div>
      {m.status === "finished" && m.winner_team_name ? (
        <p className="mt-1 text-xs text-ash-accent">
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
      <section className="ash-surface p-4">
        <h2 className="text-base font-bold text-ash-text">Edition</h2>
        {edition ? (
          <ul className="mt-2 space-y-1 text-sm text-ash-muted">
            <li>
              <span className="font-medium text-ash-text">Name: </span>
              {edition.name}
            </li>
            <li className="text-ash-border-hover">
              {edition.starts_on ?? "—"} → {edition.ends_on ?? "—"}
            </li>
          </ul>
        ) : (
          <p className="mt-2 text-sm text-amber-200">
            The configured official edition is not in the database yet.
          </p>
        )}
      </section>

      <section className="rounded-xl border border-ash-accent/30 bg-ash-accent/10 p-4 shadow-[0_4px_12px_rgba(0,0,0,0.3)]">
        <h2 className="text-base font-bold text-ash-text">Current stage</h2>
        <p className="mt-2 text-sm font-medium text-ash-text">{narrative.headline}</p>
        <p className="mt-1 text-sm leading-relaxed text-ash-muted">
          {narrative.supporting}
        </p>
        <dl className="mt-3 grid gap-2 text-sm text-ash-muted sm:grid-cols-3">
          <div>
            <dt className="text-xs font-medium text-ash-border-hover">Finished</dt>
            <dd className="tabular-nums text-ash-text">{completed.length}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-ash-border-hover">Upcoming</dt>
            <dd className="tabular-nums text-ash-text">{upcoming.length}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-ash-border-hover">Live</dt>
            <dd className="tabular-nums text-ash-text">{live.length}</dd>
          </div>
        </dl>
      </section>

      {koAdvance.length > 0 ? (
        <section className="ash-surface p-4">
          <h2 className="text-base font-bold text-ash-text">
            Knockout progression
          </h2>
          <p className="mt-1 text-xs text-ash-muted">
            Teams that have won a match in each knockout stage (from official results
            in the database).
          </p>
          <ul className="mt-3 space-y-4">
            {koAdvance.map((block) => (
              <li key={block.stage_code}>
                <h3 className="text-sm font-semibold text-ash-text">
                  {block.stage_label}
                </h3>
                <ul className="mt-1.5 flex flex-wrap gap-2">
                  {block.winners.map((w, i) => (
                    <li
                      key={`${block.stage_code}-${w.name}-${i}`}
                      className="rounded-md border border-ash-border bg-ash-body/40 px-2 py-1 text-xs text-ash-muted"
                    >
                      {w.name}
                      {w.countryCode ? (
                        <span className="ml-1 text-ash-border-hover">({w.countryCode})</span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="ash-surface p-4">
        <h2 className="mb-2 text-base font-bold text-ash-text">
          Recent results
        </h2>
        {completed.length === 0 ? (
          <p className="text-sm text-ash-muted">No finished matches yet.</p>
        ) : (
          <ul className="divide-y divide-ash-border">
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
          <p className="mt-2 text-xs text-ash-muted">
            Showing the 24 most recent finished matches.
          </p>
        ) : null}
      </section>

      <section className="ash-surface p-4">
        <h2 className="mb-2 text-base font-bold text-ash-text">
          Upcoming matches
        </h2>
        {upcoming.length === 0 ? (
          <p className="text-sm text-ash-muted">
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
        <section className="rounded-xl border border-red-800/60 bg-red-950/25 p-4 shadow-[0_4px_12px_rgba(0,0,0,0.3)]">
          <h2 className="text-base font-bold text-red-100">Live now</h2>
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
