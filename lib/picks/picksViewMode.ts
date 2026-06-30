export type PicksViewMode = "list" | "bracket";

/** URL `view` param → mode; defaults to bracket when absent or unrecognized. */
export function resolvePicksViewMode(viewParam: string | undefined): PicksViewMode {
  if (viewParam === "list") return "list";
  if (viewParam === "bracket") return "bracket";
  return "bracket";
}

/**
 * Build list/bracket toggle hrefs. Bracket is the default (no `view` param);
 * list view is explicit (`view=list`).
 */
export function buildPicksViewHrefs(
  basePath: string,
  params: URLSearchParams,
): { listHref: string; bracketHref: string } {
  const shared = new URLSearchParams(params);
  shared.delete("view");

  const listQs = new URLSearchParams(shared);
  listQs.set("view", "list");

  const listSuffix = listQs.toString();
  const bracketSuffix = shared.toString();

  return {
    listHref: listSuffix ? `${basePath}?${listSuffix}` : `${basePath}?view=list`,
    bracketHref: bracketSuffix ? `${basePath}?${bracketSuffix}` : basePath,
  };
}
