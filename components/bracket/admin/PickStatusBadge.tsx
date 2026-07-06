import {
  adminBadgeToneClassName,
  resolveAdminTeamStatusBadge,
  type AdminTeamStatusBadge,
} from "../../../lib/bracket/adminBracketDisplay";

type Props = {
  badge: AdminTeamStatusBadge | null;
};

export function PickStatusBadge({ badge }: Props) {
  if (!badge) return null;
  return (
    <span
      className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide ring-1 ${adminBadgeToneClassName(badge.tone)}`}
    >
      {badge.label}
    </span>
  );
}

export function PickStatusBadgeForSide({
  side,
}: {
  side: Parameters<typeof resolveAdminTeamStatusBadge>[0];
}) {
  return <PickStatusBadge badge={resolveAdminTeamStatusBadge(side)} />;
}
