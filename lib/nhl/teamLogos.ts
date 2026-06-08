import {
  NHL_ABBREV_TO_LOGO_SLUG,
  NHL_LOGO_ASSET_SLUGS,
} from "./nhlTeamLogoRegistry";

export { NHL_LOGO_ASSET_SLUGS } from "./nhlTeamLogoRegistry";

/**
 * Resolves a public URL for a team logo image.
 * Prefer `team_slug` + static mapping; `logo_path` from the DB is honored only for same-origin paths.
 * Assets live under `public/nhl/logos/{team_slug}.svg` (see public/nhl/logos/SOURCE.txt).
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
  return NHL_ABBREV_TO_LOGO_SLUG.get(abbreviation.trim().toUpperCase()) ?? null;
}
