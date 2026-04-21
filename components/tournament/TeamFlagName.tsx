import { Flag } from "./Flag";

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
  return (
    <Flag
      countryCode={countryCode}
      teamName={teamName}
      size="sm"
      className={className}
      nameClassName={nameClassName}
      nameLayout="wrap"
    />
  );
}
