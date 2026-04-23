"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import { resolveNhlTeamLogoPath } from "@/lib/nhl/teamLogos";

const PX = { sm: 28, md: 40 } as const;

/** NHL CDN primary marks use a wide viewBox (~960×640); keep layout predictable beside text. */
const NHL_LOGO_BOX_ASPECT = 960 / 640;

export type NhlTeamLogoSize = keyof typeof PX;

type Props = {
  size?: NhlTeamLogoSize;
  teamSlug?: string | null;
  abbreviation?: string | null;
  /** Optional DB override; only local paths are used (see `resolveNhlTeamLogoPath`). */
  logoPath?: string | null;
  /** Accessibility / tooltip */
  name?: string | null;
  className?: string;
};

/**
 * NHL-only logo: real transparent mark in a neutral box when an asset resolves;
 * dashed abbreviation badge only when missing or failed to load.
 */
export function NhlTeamLogo({
  size = "sm",
  teamSlug,
  abbreviation,
  logoPath,
  name,
  className = "",
}: Props) {
  const dim = PX[size];
  const boxW = Math.max(Math.round(dim * NHL_LOGO_BOX_ASPECT), dim + 4);
  const resolved = useMemo(
    () =>
      resolveNhlTeamLogoPath({
        team_slug: teamSlug,
        abbreviation,
        logo_path: logoPath,
      }),
    [teamSlug, abbreviation, logoPath],
  );
  const [broken, setBroken] = useState(false);
  const abbr = (abbreviation?.trim().slice(0, 3).toUpperCase() || "—").slice(0, 3);
  const label = name?.trim() || abbreviation?.trim() || teamSlug || "Team";

  const showImage = Boolean(resolved && !broken);

  return (
    <span
      className={`relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-md ${
        showImage
          ? "bg-slate-950/25 ring-1 ring-white/5"
          : "border border-dashed border-amber-400/45 bg-slate-950/70 ring-1 ring-amber-500/15"
      } ${className}`}
      style={{ height: dim, width: boxW }}
      title={label}
    >
      {showImage ? (
        <Image
          src={resolved!}
          alt=""
          width={960}
          height={640}
          className="object-contain p-0.5"
          style={{ width: "100%", height: "100%" }}
          onError={() => setBroken(true)}
          sizes={`${boxW}px`}
          priority={false}
          aria-hidden
        />
      ) : (
        <span
          className={`select-none px-0.5 font-mono font-semibold leading-none tracking-tight text-amber-100/90 ${
            size === "md" ? "text-[11px]" : "text-[9px]"
          }`}
          aria-hidden
        >
          {abbr}
        </span>
      )}
      <span className="sr-only">{label}</span>
    </span>
  );
}
