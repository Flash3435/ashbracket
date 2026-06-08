import { createElement, type ReactNode } from "react";
import { countryFlagComponentForFifaCode } from "../../lib/teams/fifaCountryCodeToFlagExportKey";

export type FlagSize = "xs" | "sm" | "md" | "lg";

const SIZE_FRAME: Record<FlagSize, string> = {
  /** Tight lists, third-place strip */
  xs: "h-3 w-[18px]",
  /** Group standings, dense tables */
  sm: "h-3.5 w-[21px]",
  /** Pick chooser rows */
  md: "h-5 w-[30px]",
  /** Summary / champion callouts */
  lg: "h-8 w-12",
};

function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

function FlagFrame({
  size,
  className,
  children,
}: {
  size: FlagSize;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <span
      className={cx(
        "relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-[3px]",
        "ring-1 ring-black/15 dark:ring-white/15",
        SIZE_FRAME[size],
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Neutral slot when no SVG exists — fixed size so rows never jump. */
export function CountryFlagPlaceholder({
  size,
  className,
}: {
  size: FlagSize;
  className?: string;
}) {
  return (
    <span aria-hidden>
      <FlagFrame
        size={size}
        className={cx(
          "bg-ash-border/40 dark:bg-ash-border/25",
          className,
        )}
      />
    </span>
  );
}

/**
 * SVG flag only. `countryCode` is the FIFA code stored on teams (e.g. MEX,
 * BIH, CAN); it is mapped to ISO / pack keys internally (lowercase is accepted).
 */
export function CountryFlagIcon({
  countryCode,
  size = "sm",
  className,
  title,
}: {
  countryCode: string;
  size?: FlagSize;
  className?: string;
  /** Optional accessible name; omitted for decorative icons */
  title?: string;
}) {
  const FlagSvg = countryFlagComponentForFifaCode(countryCode);
  if (!FlagSvg) {
    return <CountryFlagPlaceholder size={size} className={className} />;
  }
  return (
    <FlagFrame size={size} className={className}>
      {createElement(FlagSvg, {
        className: "block h-full w-full",
        "aria-hidden": title ? undefined : true,
        ...(title ? { "aria-label": title } : {}),
        focusable: "false",
        preserveAspectRatio: "xMidYMid slice",
      })}
    </FlagFrame>
  );
}

export type FlagNameLayout = "truncate" | "wrap";

type FlagProps = {
  /** FIFA country code from `teams.country_code` (e.g. BIH, ENG). */
  countryCode: string;
  /** When set, rendered after the flag with flexible width. */
  teamName?: string;
  size?: FlagSize;
  className?: string;
  nameClassName?: string;
  nameLayout?: FlagNameLayout;
};

/**
 * Flag + optional team label row: icon on the left, name on the right. Safe
 * fallback keeps layout when the code does not resolve to an SVG.
 */
export function Flag({
  countryCode,
  teamName,
  size = "sm",
  className = "flex w-full min-w-0 items-center gap-2",
  nameClassName = "",
  nameLayout = "wrap",
}: FlagProps) {
  const nameClasses =
    nameLayout === "truncate"
      ? "truncate"
      : "break-words leading-snug line-clamp-2 [overflow-wrap:anywhere]";

  return (
    <span className={className}>
      <CountryFlagIcon countryCode={countryCode} size={size} />
      {teamName != null && teamName !== "" ? (
        <span
          className={cx(
            "min-w-0 flex-1 text-left",
            nameClasses,
            nameClassName,
          )}
          title={teamName}
        >
          {teamName}
        </span>
      ) : null}
    </span>
  );
}
