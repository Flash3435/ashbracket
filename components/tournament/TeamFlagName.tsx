import { flagEmojiForFifaCountryCode } from "../../lib/teams/fifaToIso2ForFlag";

type Props = {
  countryCode: string;
  teamName: string;
  /** Additional classes on the outer flex wrapper */
  className?: string;
  /** Classes for the name span (e.g. font weight / color) */
  nameClassName?: string;
};

export function TeamFlagName({
  countryCode,
  teamName,
  className = "flex w-full min-w-0 items-center gap-1.5",
  nameClassName = "",
}: Props) {
  const flag = flagEmojiForFifaCountryCode(countryCode);
  return (
    <span className={className}>
      <span className="shrink-0 text-[13px] leading-none" aria-hidden>
        {flag || "🌍"}
      </span>
      <span
        className={`min-w-0 flex-1 truncate ${nameClassName}`}
        title={teamName}
      >
        {teamName}
      </span>
    </span>
  );
}
