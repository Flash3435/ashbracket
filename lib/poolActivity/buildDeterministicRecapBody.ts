export type RecapFacts = {
  participantCount: number;
  submittedCount: number;
  topChampionTeamName: string | null;
  topChampionPickCount: number;
};

export function buildDeterministicRecapBody(facts: RecapFacts): string {
  const { participantCount, submittedCount, topChampionTeamName, topChampionPickCount } =
    facts;
  if (participantCount <= 0) {
    return "Ash's daily recap: this pool is warming up - no participants yet, so the bracket gossip can wait.";
  }
  let line = `Ash's daily recap: ${submittedCount} of ${participantCount} participant${participantCount === 1 ? "" : "s"} ha${submittedCount === 1 ? "s" : "ve"} submitted picks`;
  if (topChampionTeamName && topChampionPickCount > 0) {
    line += `. ${topChampionTeamName} is the most popular champion pick so far (${topChampionPickCount} pick${topChampionPickCount === 1 ? "" : "s"})`;
  }
  line += ".";
  return line;
}
