import type { NhlStandingsStatus } from "@/lib/nhl/types";

export function labelNhlStandingsStatus(status: NhlStandingsStatus): string {
  switch (status) {
    case "no_picks":
      return "No picks yet";
    case "in_progress":
      return "In progress";
    case "complete":
      return "Complete";
    default:
      return "—";
  }
}

/** User-facing hint when the standings RPC migration is missing. */
export function formatNhlStandingsLoadError(message: string): string {
  const m = message.toLowerCase();
  if (
    m.includes("fetch_nhl_edition_standings") &&
    (m.includes("schema cache") || m.includes("does not exist") || m.includes("not find"))
  ) {
    return (
      "The database is missing the NHL standings function. Apply the NHL standings migrations " +
      "(for example `20260504180000_nhl_standings_round_breakdown.sql` and " +
      "`20260520140000_nhl_standings_scoring_winner.sql` via `supabase db push` from the ashbracket " +
      "repo), then refresh this page."
    );
  }
  return message;
}
