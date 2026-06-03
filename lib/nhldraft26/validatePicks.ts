import { NHL_DRAFT26_PICK_COUNT } from "@/lib/nhldraft26/config";
import { buildNhlDraft26ProspectMap } from "@/lib/nhldraft26/prospects";

export type ValidateNhlDraft26PicksResult =
  | { ok: true; prospectIds: string[] }
  | { ok: false; error: string };

export function validateNhlDraft26PickList(
  rawProspectIds: unknown,
): ValidateNhlDraft26PicksResult {
  if (!Array.isArray(rawProspectIds)) {
    return { ok: false, error: "Invalid picks payload." };
  }

  const prospectIds = rawProspectIds.map((id) =>
    typeof id === "string" ? id.trim() : "",
  );

  if (prospectIds.length !== NHL_DRAFT26_PICK_COUNT) {
    return {
      ok: false,
      error: `Submit exactly ${NHL_DRAFT26_PICK_COUNT} ranked picks.`,
    };
  }

  if (prospectIds.some((id) => id.length === 0)) {
    return { ok: false, error: "Each pick must reference a prospect." };
  }

  const unique = new Set(prospectIds);
  if (unique.size !== NHL_DRAFT26_PICK_COUNT) {
    return { ok: false, error: "Each prospect can only appear once in your top 10." };
  }

  const pool = buildNhlDraft26ProspectMap();
  for (const id of prospectIds) {
    if (!pool.has(id)) {
      return { ok: false, error: "One or more picks are not in the current prospect pool." };
    }
  }

  return { ok: true, prospectIds };
}
