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
    (m.includes("fetch_nhl_edition_standings") ||
      m.includes("fetch_nhl_public_entry_picks") ||
      m.includes("fetch_nhl_public_entry_context")) &&
    (m.includes("schema cache") || m.includes("does not exist") || m.includes("not find"))
  ) {
    return (
      "The database is missing an NHL standings or public entry function. Apply the NHL migrations " +
      "(for example `20260520170000_nhl_public_entry_detail_fix_return_types.sql` via `supabase db push` from the ashbracket " +
      "repo), then refresh this page."
    );
  }
  return message;
}
