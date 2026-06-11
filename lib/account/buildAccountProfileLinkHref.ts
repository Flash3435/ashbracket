/** Build account sub-route links that preserve the selected participant profile. */
export function buildAccountProfileLinkHref(
  basePath: string,
  participantId: string,
): string {
  const trimmedBase = basePath.trim();
  const trimmedId = participantId.trim();
  if (!trimmedBase || !trimmedId) {
    return trimmedBase || basePath;
  }
  const separator = trimmedBase.includes("?") ? "&" : "?";
  return `${trimmedBase}${separator}participant=${encodeURIComponent(trimmedId)}`;
}
