/**
 * Validates a client-supplied `slotTeamIdByKey` before apply (must match canonical
 * `"1"`…`"32"` keys with non-empty team ids).
 */
export function normalizeClientR32SlotMap(
  raw: Record<string, string> | null | undefined,
): { ok: true; slotTeamIdByKey: Record<string, string> } | { ok: false; error: string } {
  if (!raw || typeof raw !== "object") {
    return { ok: false, error: "Missing slot map from preview. Generate a preview first." };
  }
  const out: Record<string, string> = {};
  for (let i = 1; i <= 32; i += 1) {
    const k = String(i);
    const v = raw[k];
    if (typeof v !== "string" || !v.trim()) {
      return { ok: false, error: `Invalid preview payload: slot ${k} is missing a team id.` };
    }
    out[k] = v.trim();
  }
  const rawKeys = Object.keys(raw);
  if (rawKeys.length !== 32) {
    return {
      ok: false,
      error: `Invalid preview payload: expected exactly 32 keys (slots 1–32); got ${rawKeys.length}.`,
    };
  }
  const allowed = new Set(Array.from({ length: 32 }, (_, j) => String(j + 1)));
  for (const key of rawKeys) {
    if (!allowed.has(key)) {
      return { ok: false, error: `Invalid preview payload: unknown slot key "${key}".` };
    }
  }
  return { ok: true, slotTeamIdByKey: out };
}
