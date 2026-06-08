/** Server and client: pool `name` column allows up to 200 characters (trimmed). */
export const POOL_NAME_MAX_LEN = 200;

export function validatePoolNameInput(
  raw: string,
): { ok: true; name: string } | { ok: false; error: string } {
  const name = raw.trim();
  if (!name) {
    return { ok: false, error: "Pool name is required." };
  }
  if (name.length > POOL_NAME_MAX_LEN) {
    return {
      ok: false,
      error: `Pool name must be at most ${POOL_NAME_MAX_LEN} characters.`,
    };
  }
  return { ok: true, name };
}
