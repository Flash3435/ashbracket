/** "is" when count is 1, otherwise "are". */
export function verbIsAre(count: number): "is" | "are" {
  return Math.max(0, Math.floor(count)) === 1 ? "is" : "are";
}

/** "has" when count is 1, otherwise "have". */
export function verbHasHave(count: number): "has" | "have" {
  return Math.max(0, Math.floor(count)) === 1 ? "has" : "have";
}

/** e.g. "1 bracket" / "12 brackets" */
export function formatBracketCount(count: number): string {
  const n = Math.max(0, Math.floor(count));
  return n === 1 ? "1 bracket" : `${n} brackets`;
}

/** e.g. "1 participant" / "12 participants" */
export function formatParticipantCount(count: number): string {
  const n = Math.max(0, Math.floor(count));
  return n === 1 ? "1 participant" : `${n} participants`;
}

/** e.g. "1 entry" / "12 entries" */
export function formatEntryCount(count: number): string {
  const n = Math.max(0, Math.floor(count));
  return n === 1 ? "1 entry" : `${n} entries`;
}

/** e.g. "1 activity item" / "12 activity items" */
export function formatActivityItemCount(count: number): string {
  const n = Math.max(0, Math.floor(count));
  return n === 1 ? "1 activity item" : `${n} activity items`;
}

/** e.g. "1 new participant joined" / "4 new participants joined" */
export function formatNewParticipantsJoined(count: number): string {
  const n = Math.max(0, Math.floor(count));
  return n === 1 ? "1 new participant joined" : `${n} new participants joined`;
}

/** e.g. "1 person updated their picks" / "6 people updated their picks" */
export function formatPeopleUpdatedPicks(count: number): string {
  const n = Math.max(0, Math.floor(count));
  return n === 1 ? "1 person updated their picks" : `${n} people updated their picks`;
}

/** e.g. "Still waiting on 1 bracket." / "Still waiting on 3 brackets." */
export function formatRemainingBracketPhrase(count: number): string {
  const n = Math.max(0, Math.floor(count));
  if (n === 0) return "No brackets left.";
  if (n === 1) return "Still waiting on 1 bracket.";
  return `Still waiting on ${n} brackets.`;
}

/** e.g. "1 bracket remains undecided." / "3 brackets remain undecided." */
export function formatRemainingBracketsUndecided(count: number): string {
  const n = Math.max(0, Math.floor(count));
  if (n === 1) return "1 bracket remains undecided.";
  return `${n} brackets remain undecided.`;
}

/** e.g. "0 of 1 brackets are complete." */
export function formatBracketsCompleteLine(completed: number, total: number): string {
  return `${completed} of ${total} brackets are complete.`;
}

/** e.g. "still needs to finish" / "still need to finish" */
export function formatStillNeedToFinishVerb(incompleteCount: number): string {
  return incompleteCount === 1 ? "still needs to finish" : "still need to finish";
}

/** e.g. "1 participant still needs to finish." / "3 participants still need to finish." */
export function formatParticipantsStillNeedToFinish(count: number): string {
  const n = Math.max(0, Math.floor(count));
  if (n === 0) return "";
  if (n === 1) return "1 participant still needs to finish.";
  return `${n} participants still need to finish.`;
}
