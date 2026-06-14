import type { ParticipantTeamPicks } from "@/lib/poolActivity/scoreImpact/buildSoftImpact";

export type CompletedGroupMatchForOutlook = {
  matchCode: string;
  winnerTeamId: string;
};

export type BracketOutlookEntry = {
  participantId: string;
  displayName: string;
  helpedMatchCount: number;
  helpedTeamCount: number;
  /** Highest path-importance among helped teams (server-side sort tie-breaker). */
  maxHelpedPathImportance: number;
  topHelpedTeamNames: string[];
};

export type BracketOutlookResult = {
  entries: BracketOutlookEntry[];
  completedMatchCount: number;
};

/** Client-safe row — display names and counts only (no ids or team names in v1). */
export type ClientSafeBracketOutlookEntry = {
  displayName: string;
  helpedMatchCount: number;
  helpedTeamCount: number;
};

export const BRACKET_OUTLOOK_HEADLINE = "Bracket Outlook";

export const BRACKET_OUTLOOK_INTRO =
  "No official points have landed yet, but some brackets are looking stronger based on completed group results.";

export const BRACKET_OUTLOOK_OFFICIAL_NOTE =
  "Official points are still 0. Group-stage advancement points land after each group is complete.";

export const BRACKET_OUTLOOK_DISCLAIMER =
  "This is an unofficial outlook based on completed group results and bracket-path picks. Official standings will appear once pool points are awarded.";

export const BRACKET_OUTLOOK_DASHBOARD_BLURB =
  "Unofficial early read before points are awarded.";

export const BRACKET_OUTLOOK_DASHBOARD_FOOTNOTE =
  "Official leaderboard appears once pool points are awarded.";

/**
 * Counts completed group-stage wins that helped each participant's path picks.
 * Draws and matches without a winner are skipped. Bonus picks excluded upstream.
 */
export function buildBracketOutlook(input: {
  participantPicks: ReadonlyMap<string, ParticipantTeamPicks>;
  participantNames: ReadonlyMap<string, string>;
  completedGroupMatches: readonly CompletedGroupMatchForOutlook[];
  teamNameById: ReadonlyMap<string, string>;
}): BracketOutlookResult | null {
  const decisiveMatches = input.completedGroupMatches.filter(
    (m) => m.matchCode.trim() && m.winnerTeamId.trim(),
  );
  if (decisiveMatches.length === 0) return null;

  const perParticipant = new Map<
    string,
    {
      helpedMatchCodes: Set<string>;
      helpedTeamIds: Set<string>;
      maxImportance: number;
      teamImportance: Map<string, number>;
    }
  >();

  for (const match of decisiveMatches) {
    const winnerTeamId = match.winnerTeamId.trim();
    const matchCode = match.matchCode.trim();

    for (const [participantId, picks] of input.participantPicks) {
      if (!picks.pathTeamIds.has(winnerTeamId)) continue;

      let entry = perParticipant.get(participantId);
      if (!entry) {
        entry = {
          helpedMatchCodes: new Set(),
          helpedTeamIds: new Set(),
          maxImportance: 0,
          teamImportance: new Map(),
        };
        perParticipant.set(participantId, entry);
      }

      // Dedupe per participant / team / match — at most one signal per match.
      if (entry.helpedMatchCodes.has(matchCode)) continue;
      entry.helpedMatchCodes.add(matchCode);

      entry.helpedTeamIds.add(winnerTeamId);
      const importance = picks.maxPathImportanceByTeamId.get(winnerTeamId) ?? 0;
      const prev = entry.teamImportance.get(winnerTeamId) ?? 0;
      if (importance > prev) {
        entry.teamImportance.set(winnerTeamId, importance);
      }
      if (importance > entry.maxImportance) {
        entry.maxImportance = importance;
      }
    }
  }

  const entries: BracketOutlookEntry[] = [];

  for (const [participantId, stats] of perParticipant) {
    const helpedMatchCount = stats.helpedMatchCodes.size;
    if (helpedMatchCount === 0) continue;

    const topHelpedTeamNames = [...stats.teamImportance.entries()]
      .sort((a, b) => {
        if (b[1] !== a[1]) return b[1] - a[1];
        const nameA =
          input.teamNameById.get(a[0])?.trim() || a[0];
        const nameB =
          input.teamNameById.get(b[0])?.trim() || b[0];
        return nameA.localeCompare(nameB, undefined, { sensitivity: "base" });
      })
      .slice(0, 3)
      .map(([teamId]) => input.teamNameById.get(teamId)?.trim() || "Team");

    entries.push({
      participantId,
      displayName:
        input.participantNames.get(participantId)?.trim() || "Participant",
      helpedMatchCount,
      helpedTeamCount: stats.helpedTeamIds.size,
      maxHelpedPathImportance: stats.maxImportance,
      topHelpedTeamNames,
    });
  }

  if (entries.length === 0) return null;

  entries.sort(compareBracketOutlookEntries);

  return {
    entries,
    completedMatchCount: decisiveMatches.length,
  };
}

export function compareBracketOutlookEntries(
  a: BracketOutlookEntry,
  b: BracketOutlookEntry,
): number {
  if (b.helpedMatchCount !== a.helpedMatchCount) {
    return b.helpedMatchCount - a.helpedMatchCount;
  }
  if (b.helpedTeamCount !== a.helpedTeamCount) {
    return b.helpedTeamCount - a.helpedTeamCount;
  }
  if (b.maxHelpedPathImportance !== a.maxHelpedPathImportance) {
    return b.maxHelpedPathImportance - a.maxHelpedPathImportance;
  }
  const nameCmp = a.displayName.localeCompare(b.displayName, undefined, {
    sensitivity: "base",
  });
  if (nameCmp !== 0) return nameCmp;
  return a.participantId.localeCompare(b.participantId);
}

export function bracketOutlookIsMeaningful(
  result: BracketOutlookResult | null,
): boolean {
  return (
    result != null &&
    result.entries.some((entry) => entry.helpedMatchCount > 0)
  );
}

export function toClientSafeBracketOutlookEntries(
  result: BracketOutlookResult,
): ClientSafeBracketOutlookEntry[] {
  return result.entries.map((entry) => ({
    displayName: entry.displayName,
    helpedMatchCount: entry.helpedMatchCount,
    helpedTeamCount: entry.helpedTeamCount,
  }));
}

export function formatBracketOutlookResultLine(entry: ClientSafeBracketOutlookEntry): string {
  const count = entry.helpedMatchCount;
  const label = count === 1 ? "1 helpful result" : `${count} helpful results`;
  return label;
}

export function formatBracketOutlookDetailLine(entry: ClientSafeBracketOutlookEntry): string {
  const teamCount = entry.helpedTeamCount;
  const teamLabel =
    teamCount === 1 ? "1 path team helped" : `${teamCount} path teams helped`;
  return `${formatBracketOutlookResultLine(entry)} · ${teamLabel}`;
}

export const BRACKET_OUTLOOK_DASHBOARD_MAX_ROWS = 5;
