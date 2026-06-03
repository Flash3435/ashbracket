import { NHL_2026_PLAYOFF_TEAMS } from "./nhl2026PlayoffField";

/**
 * Teams with a committed asset at `public/nhl/logos/{team_slug}.svg` beyond the
 * 2026 playoff field (e.g. draft-order clubs). Same SOURCE.txt / NHL CDN convention.
 */
export const NHL_ADDITIONAL_LOGO_TEAMS: readonly {
  team_slug: string;
  /** NHL assets.nhle.com abbrev (`{abbrev}_light.svg`). */
  logo_abbreviation: string;
}[] = [
  { team_slug: "maple-leafs", logo_abbreviation: "TOR" },
  { team_slug: "sharks", logo_abbreviation: "SJS" },
  { team_slug: "canucks", logo_abbreviation: "VAN" },
  { team_slug: "blackhawks", logo_abbreviation: "CHI" },
  { team_slug: "rangers", logo_abbreviation: "NYR" },
  { team_slug: "flames", logo_abbreviation: "CGY" },
  { team_slug: "kraken", logo_abbreviation: "SEA" },
  { team_slug: "jets", logo_abbreviation: "WPG" },
  { team_slug: "panthers", logo_abbreviation: "FLA" },
  { team_slug: "predators", logo_abbreviation: "NSH" },
];

export type NhlTeamLogoLookup = {
  assetSlugs: ReadonlySet<string>;
  abbrevToSlug: ReadonlyMap<string, string>;
};

/** Built once: playoff field + additional logo teams (draft order, etc.). */
export function buildNhlTeamLogoLookup(): NhlTeamLogoLookup {
  const assetSlugs = new Set<string>();
  const abbrevToSlug = new Map<string, string>();

  for (const t of NHL_2026_PLAYOFF_TEAMS) {
    assetSlugs.add(t.team_slug);
    abbrevToSlug.set(t.abbreviation.toUpperCase(), t.team_slug);
  }

  for (const t of NHL_ADDITIONAL_LOGO_TEAMS) {
    assetSlugs.add(t.team_slug);
    abbrevToSlug.set(t.logo_abbreviation.toUpperCase(), t.team_slug);
  }

  return { assetSlugs, abbrevToSlug };
}

const LOOKUP = buildNhlTeamLogoLookup();

export const NHL_LOGO_ASSET_SLUGS: ReadonlySet<string> = LOOKUP.assetSlugs;

export const NHL_ABBREV_TO_LOGO_SLUG: ReadonlyMap<string, string> =
  LOOKUP.abbrevToSlug;
