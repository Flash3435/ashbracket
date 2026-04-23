import { NHL_2026_PLAYOFF_TEAMS } from "./nhl2026PlayoffField";

/** Slugs that have a committed asset under `public/nhl/logos/{slug}.svg`. */
export const NHL_LOGO_ASSET_SLUGS: ReadonlySet<string> = new Set(
  NHL_2026_PLAYOFF_TEAMS.map((t) => t.team_slug),
);

const ABBREV_TO_SLUG: ReadonlyMap<string, string> = new Map(
  NHL_2026_PLAYOFF_TEAMS.map((t) => [t.abbreviation.toUpperCase(), t.team_slug]),
);

/**
 * Resolves a public URL for a team logo image.
 * Prefer `team_slug` + static mapping; `logo_path` from the DB is honored only for same-origin paths.
 * Add new rows to `public/nhl/logos/` and `NHL_2026_PLAYOFF_TEAMS` (or extend this map) for new clubs.
 */
export function resolveNhlTeamLogoPath(input: {
  team_slug?: string | null;
  abbreviation?: string | null;
  logo_path?: string | null;
}): string | null {
  const raw = input.logo_path?.trim();
  if (raw) {
    if (raw.startsWith("/")) return raw;
    if (raw.startsWith("nhl/")) return `/${raw}`;
  }
  const slug =
    (input.team_slug?.trim() && input.team_slug.trim()) ||
    abbrevToSlug(input.abbreviation) ||
    null;
  if (!slug) return null;
  if (!NHL_LOGO_ASSET_SLUGS.has(slug)) return null;
  return `/nhl/logos/${slug}.svg`;
}

export function abbrevToSlug(abbreviation: string | null | undefined): string | null {
  if (!abbreviation?.trim()) return null;
  return ABBREV_TO_SLUG.get(abbreviation.trim().toUpperCase()) ?? null;
}
