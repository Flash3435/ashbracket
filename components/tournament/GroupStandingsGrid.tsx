import type { PublicGroupStandingsTable } from "../../lib/tournament/buildPublicGroupStandings";

type Props = {
  tables: PublicGroupStandingsTable[];
  /** Uppercase FIFA country codes from the signed-in user’s saved picks (any stage). */
  pickedCountryCodes?: Set<string> | null;
};

function normCode(c: string): string {
  return c.trim().toUpperCase();
}

export function GroupStandingsGrid({ tables, pickedCountryCodes }: Props) {
  return (
    <section className="ash-surface p-4">
      <h2 className="text-base font-bold text-ash-text">Group standings</h2>
      <p className="mt-1 text-xs leading-relaxed text-ash-muted">
        Tables use the official group draw. Stats update from finished group-stage
        matches only. Top two qualify automatically; third place may still advance
        as one of the best third-place teams.
      </p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {tables.map(({ groupCode, rows }) => (
          <div
            key={groupCode}
            className="rounded-lg border border-ash-border bg-ash-body/35 p-3 shadow-sm"
          >
            <h3 className="border-b border-ash-border pb-2 text-sm font-semibold text-ash-text">
              Group {groupCode}
            </h3>
            <div className="mt-2 overflow-x-auto">
              <table className="w-full min-w-[260px] text-left text-[11px] text-ash-muted">
                <thead>
                  <tr className="border-b border-ash-border/80 text-[10px] font-medium uppercase tracking-wide text-ash-border-hover">
                    <th className="py-1.5 pr-1 font-medium">Team</th>
                    <th className="px-0.5 py-1.5 text-center font-medium tabular-nums">
                      Pld
                    </th>
                    <th className="px-0.5 py-1.5 text-center font-medium tabular-nums">
                      W
                    </th>
                    <th className="px-0.5 py-1.5 text-center font-medium tabular-nums">
                      D
                    </th>
                    <th className="px-0.5 py-1.5 text-center font-medium tabular-nums">
                      L
                    </th>
                    <th className="px-0.5 py-1.5 text-center font-medium tabular-nums">
                      GF
                    </th>
                    <th className="px-0.5 py-1.5 text-center font-medium tabular-nums">
                      GA
                    </th>
                    <th className="px-0.5 py-1.5 text-center font-medium tabular-nums">
                      GD
                    </th>
                    <th className="py-1.5 pl-0.5 text-right font-medium tabular-nums">
                      Pts
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ash-border/60">
                  {rows.map((r, idx) => {
                    const picked =
                      pickedCountryCodes?.has(normCode(r.countryCode)) ?? false;
                    let rowClass = "";
                    if (idx === 0 || idx === 1) {
                      rowClass =
                        "bg-emerald-950/15 border-l-2 border-l-emerald-600/35";
                    } else if (idx === 2) {
                      rowClass = "bg-ash-accent/[0.06] border-l border-l-ash-accent/25";
                    }
                    return (
                      <tr key={r.countryCode} className={rowClass}>
                        <td className="py-1.5 pr-1">
                          <span className="flex min-w-0 flex-col gap-0.5">
                            <span
                              className={`truncate font-medium ${
                                picked ? "text-ash-accent" : "text-ash-text"
                              }`}
                              title={r.teamName}
                            >
                              {r.teamName}
                            </span>
                            {picked ? (
                              <span className="text-[9px] font-medium uppercase tracking-wide text-ash-accent/90">
                                In your bracket
                              </span>
                            ) : null}
                          </span>
                        </td>
                        <td className="px-0.5 py-1.5 text-center tabular-nums">
                          {r.played}
                        </td>
                        <td className="px-0.5 py-1.5 text-center tabular-nums">
                          {r.won}
                        </td>
                        <td className="px-0.5 py-1.5 text-center tabular-nums">
                          {r.drawn}
                        </td>
                        <td className="px-0.5 py-1.5 text-center tabular-nums">
                          {r.lost}
                        </td>
                        <td className="px-0.5 py-1.5 text-center tabular-nums">
                          {r.goalsFor}
                        </td>
                        <td className="px-0.5 py-1.5 text-center tabular-nums">
                          {r.goalsAgainst}
                        </td>
                        <td className="px-0.5 py-1.5 text-center tabular-nums">
                          {r.goalDifference > 0
                            ? `+${r.goalDifference}`
                            : r.goalDifference}
                        </td>
                        <td className="py-1.5 pl-0.5 text-right font-medium tabular-nums text-ash-text">
                          {r.points}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
