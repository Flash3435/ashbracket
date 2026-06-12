import { revalidatePath } from "next/cache";
import { participantPickRevalidatePaths } from "./participantPicksSaveFlow";

/**
 * Revalidates account and participant pages after a pick save.
 * Returns an error message when revalidation throws; never throws itself.
 */
export function safeRevalidateParticipantPickPaths(
  participantId: string,
): string | null {
  try {
    for (const path of participantPickRevalidatePaths(participantId)) {
      revalidatePath(path);
    }
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : "Revalidation failed.";
  }
}
