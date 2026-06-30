import type {
  ParticipantRaceOutlook,
  ParticipantRaceOutlookRow,
  RaceOutlookStatus,
} from "@/lib/pool/buildParticipantRaceOutlook";

type Props = {
  outlook: ParticipantRaceOutlook;
};

function statusClass(status: RaceOutlookStatus): string {
  switch (status) {
    case "Leading":
      return "border-emerald-500/40 bg-emerald-950/30 text-emerald-100";
    case "Dangerous":
      return "border-amber-500/40 bg-amber-950/25 text-amber-100";
    case "Champion dead":
      return "border-red-500/40 bg-red-950/25 text-red-200";
    case "Low upside":
      return "border-ash-border/60 bg-ash-body/30 text-ash-muted";
    default:
      return "border-sky-500/30 bg-sky-950/20 text-sky-100";
  }
}

function championLine(row: ParticipantRaceOutlookRow): string {
  if (!row.hasChampionPick || !row.championTeamName) {
    return "No champion pick";
  }
  const aliveLabel = row.championAlive ? "alive" : "dead";
  return `${row.championTeamName} champion ${aliveLabel}`;
}

function RaceOutlookRow({ row }: { row: ParticipantRaceOutlookRow }) {
  const liveLabel =
    row.liveKnockoutPicksRemaining === 1
      ? "1 live pick"
      : `${row.liveKnockoutPicksRemaining} live picks`;

  return (
    <li className="flex flex-wrap items-start justify-between gap-3 py-3 first:pt-0 last:pb-0">
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex min-w-[2rem] items-center justify-center rounded-full border border-ash-border/60 bg-ash-body/40 px-2 py-0.5 text-xs font-bold tabular-nums text-ash-muted">
            {row.rank}
          </span>
          <p className="font-semibold text-ash-text">{row.displayName}</p>
          <span
            className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${statusClass(row.statusLabel)}`}
          >
            {row.statusLabel}
          </span>
        </div>
        <p className="text-sm text-ash-muted">
          {row.totalPoints} pts — {championLine(row)} — {liveLabel}
        </p>
      </div>
    </li>
  );
}

export function ParticipantRaceOutlookCard({ outlook }: Props) {
  if (outlook.rows.length === 0) return null;

  return (
    <section className="rounded-xl border border-ash-border/70 bg-ash-body/25 px-5 py-5 sm:px-6">
      <h2 className="text-lg font-bold text-ash-text sm:text-xl">Race outlook</h2>
      <p className="mt-2 max-w-3xl text-sm leading-relaxed text-ash-muted">
        Top participants by current standings, champion survival, and remaining live
        knockout picks.
      </p>

      <ul className="mt-4 divide-y divide-ash-border/50">
        {outlook.rows.map((row) => (
          <RaceOutlookRow key={row.participantId} row={row} />
        ))}
      </ul>
    </section>
  );
}
