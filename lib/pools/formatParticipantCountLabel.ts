import { formatParticipantCount } from "../copy/pluralize";

/** e.g. "1 participant" / "12 participants" */
export function formatParticipantCountLabel(count: number): string {
  return formatParticipantCount(count);
}
