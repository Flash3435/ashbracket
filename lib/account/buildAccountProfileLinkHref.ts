/** Anchor id for the reveal results block on `/account/reveal`. */
export const ACCOUNT_REVEAL_RESULTS_HASH = "reveal-results";

export type BuildAccountProfileLinkHrefOptions = {
  hash?: string;
};

/** Build account sub-route links that preserve the selected participant profile. */
export function buildAccountProfileLinkHref(
  basePath: string,
  participantId: string,
  options?: BuildAccountProfileLinkHrefOptions,
): string {
  const trimmedBase = basePath.trim();
  const trimmedId = participantId.trim();
  if (!trimmedBase || !trimmedId) {
    return trimmedBase || basePath;
  }
  const separator = trimmedBase.includes("?") ? "&" : "?";
  const url = `${trimmedBase}${separator}participant=${encodeURIComponent(trimmedId)}`;
  const hash = options?.hash?.trim().replace(/^#/, "") ?? "";
  return hash ? `${url}#${hash}` : url;
}

/** Profile reveal link — scrolls to results after profile selection. */
export function buildAccountRevealProfileLinkHref(
  participantId: string,
  revealBasePath = "/account/reveal",
): string {
  return buildAccountProfileLinkHref(revealBasePath, participantId, {
    hash: ACCOUNT_REVEAL_RESULTS_HASH,
  });
}
