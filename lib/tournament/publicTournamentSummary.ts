import type { TournamentMatchPublicRow } from "../../types/tournamentPublic";

export type PublicStageNarrative = {
  headline: string;
  supporting: string;
};

const UNFINISHED = new Set(["scheduled", "live", "postponed"]);

function minSortOrderForPredicate(
  matches: TournamentMatchPublicRow[],
  pred: (m: TournamentMatchPublicRow) => boolean,
): TournamentMatchPublicRow[] {
  let min = Infinity;
  const out: TournamentMatchPublicRow[] = [];
  for (const m of matches) {
    if (!pred(m)) continue;
    if (m.stage_sort_order < min) {
      min = m.stage_sort_order;
      out.length = 0;
      out.push(m);
    } else if (m.stage_sort_order === min) {
      out.push(m);
    }
  }
  return out;
}

/**
 * Short narrative for the current tournament moment (group vs knockout, live, etc.).
 */
export function summarizeTournamentStage(matches: TournamentMatchPublicRow[]): PublicStageNarrative {
  if (matches.length === 0) {
    return {
      headline: "No schedule published",
      supporting:
        "Match rows for this edition are not in the database yet. Check back after the organizer seeds the tournament.",
    };
  }

  const live = matches.filter((m) => m.status === "live");
  if (live.length > 0) {
    const stages = [...new Set(live.map((m) => m.stage_label))];
    return {
      headline: "Match in progress",
      supporting: `There ${live.length === 1 ? "is" : "are"} ${live.length} live match${live.length === 1 ? "" : "es"} (${stages.join(", ")}).`,
    };
  }

  const unfinished = matches.filter((m) => UNFINISHED.has(m.status));
  if (unfinished.length === 0) {
    const finalFinished = matches.filter(
      (m) => m.stage_code === "final" && m.status === "finished",
    );
    if (finalFinished.length > 0 && finalFinished[0]?.winner_team_name) {
      return {
        headline: "Tournament complete",
        supporting: `Champion: ${finalFinished[0].winner_team_name}.`,
      };
    }
    return {
      headline: "All listed matches are final",
      supporting:
        "There are no upcoming or live matches in the current dataset. The bracket may be complete, or additional rounds may be added later.",
    };
  }

  const nextStageRows = minSortOrderForPredicate(matches, (m) => UNFINISHED.has(m.status));
  const label = nextStageRows[0]?.stage_label ?? "Next round";
  const stageCode = nextStageRows[0]?.stage_code ?? "";

  const groupUnfinished = unfinished.filter((m) => m.stage_code === "group");
  const koUnfinished = unfinished.filter((m) => m.stage_code !== "group");

  if (groupUnfinished.length > 0 && koUnfinished.length === 0) {
    return {
      headline: "Group stage",
      supporting: `${groupUnfinished.length} group match${groupUnfinished.length === 1 ? "" : "es"} still to play. Next stage after groups: knockout rounds.`,
    };
  }

  if (stageCode === "group") {
    return {
      headline: label,
      supporting: `${unfinished.length} match${unfinished.length === 1 ? "" : "es"} remaining before the knockout rounds.`,
    };
  }

  return {
    headline: label,
    supporting: `${unfinished.length} knockout or placement match${unfinished.length === 1 ? "" : "es"} still scheduled or to be played.`,
  };
}

export type KnockoutAdvancement = {
  stage_code: string;
  stage_label: string;
  stage_sort_order: number;
  winners: { name: string; countryCode: string | null }[];
};

/**
 * Finished knockout matches and their winners, grouped by stage (excludes group stage).
 */
export function knockoutAdvancementByStage(
  matches: TournamentMatchPublicRow[],
): KnockoutAdvancement[] {
  const map = new Map<string, KnockoutAdvancement>();

  for (const m of matches) {
    if (m.stage_code === "group") continue;
    if (m.status !== "finished" || !m.winner_team_name) continue;

    let row = map.get(m.stage_code);
    if (!row) {
      row = {
        stage_code: m.stage_code,
        stage_label: m.stage_label,
        stage_sort_order: m.stage_sort_order,
        winners: [],
      };
      map.set(m.stage_code, row);
    }

    row.winners.push({
      name: m.winner_team_name,
      countryCode: m.winner_country_code,
    });
  }

  return [...map.values()].sort((a, b) => a.stage_sort_order - b.stage_sort_order);
}
