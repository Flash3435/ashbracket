"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import { resolveNhlTeamLogoPath } from "@/lib/nhl/teamLogos";

const PX = { sm: 28, md: 40 } as const;

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
 * NHL-only team mark. Uses static assets under `/nhl/logos/` when mapped; otherwise a compact abbreviation badge.
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
      className={`relative inline-flex shrink-0 items-center justify-center rounded-full bg-slate-900/80 ring-1 ring-white/10 ${className}`}
      style={{ width: dim, height: dim }}
      title={label}
    >
      {showImage ? (
        <Image
          src={resolved!}
          alt=""
          width={dim}
          height={dim}
          className="h-full w-full rounded-full object-cover"
          onError={() => setBroken(true)}
          sizes={`${dim}px`}
          aria-hidden
        />
      ) : (
        <span
          className={`select-none font-mono font-bold leading-none text-slate-100 ${
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
