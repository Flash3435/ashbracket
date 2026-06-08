import type { ComponentType, SVGProps } from "react";
import * as CountryFlags from "country-flag-icons/react/3x2";
import { iso2ForFifaCode } from "./fifaToIso2ForFlag";

/**
 * Keys exported by `country-flag-icons/react/3x2` (ISO alpha-2 like `MX`, or
 * subdivisions such as `GB_ENG`). Used to resolve stored FIFA codes from
 * `teams.country_code` to a concrete SVG component — not a team-name lookup
 * (names always travel with codes from the database).
 */
export type CountryFlagPackKey = keyof typeof CountryFlags;

/**
 * FIFA codes that should not use the default ISO-2 mapping from
 * {@link iso2ForFifaCode} (e.g. England / Scotland use UK subdivision flags).
 */
const FIFA_TO_FLAG_PACK_KEY: Partial<Record<string, CountryFlagPackKey>> = {
  ENG: "GB_ENG",
  SCO: "GB_SCT",
};

/**
 * Maps a FIFA country code (as in `teams.country_code`) to a
 * `country-flag-icons` export key. Normalizes via ISO alpha-2 in uppercase for
 * pack lookup; asset files are keyed the same way in the library.
 */
export function flagPackExportKeyForFifaCountryCode(
  fifaCode: string,
): CountryFlagPackKey | null {
  const u = fifaCode.trim().toUpperCase();
  if (!u) return null;

  const overridden = FIFA_TO_FLAG_PACK_KEY[u];
  if (overridden && CountryFlags[overridden]) {
    return overridden;
  }

  const iso2 = iso2ForFifaCode(fifaCode);
  if (!iso2) return null;

  const k = iso2.toUpperCase() as CountryFlagPackKey;
  return CountryFlags[k] ? k : null;
}

export function countryFlagComponentForFifaCode(
  fifaCode: string,
): ComponentType<SVGProps<SVGSVGElement>> | null {
  const key = flagPackExportKeyForFifaCountryCode(fifaCode);
  if (!key) return null;
  return CountryFlags[key] as ComponentType<SVGProps<SVGSVGElement>>;
}
