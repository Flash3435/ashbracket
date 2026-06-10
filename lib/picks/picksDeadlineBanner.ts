import { formatPoolPickDeadlineLabel } from "./poolPickDeadlineDisplay";
import { poolLocked } from "../pools/poolLocked";

/** Show a softer banner when the deadline is within this window (72 hours). */
export const PICKS_DEADLINE_BANNER_SOON_MS = 72 * 3600_000;

/** Stronger urgency styling when the deadline is within this window (24 hours). */
export const PICKS_DEADLINE_BANNER_URGENT_MS = 24 * 3600_000;

export type PicksDeadlineBannerUrgency = "none" | "soon" | "urgent";

export type PicksDeadlineBannerViewerRole =
  | "signed_out"
  | "admin"
  | "participant_incomplete"
  | "participant_complete"
  | "signed_in_non_participant";

export type PicksDeadlineBannerCopy = {
  headline: string;
  body: string;
  ctaKind: "link" | "copy_invite";
  ctaLabel: string;
  ctaHref: string;
};

export function msUntilPoolLock(
  lockAtIso: string | null | undefined,
  nowMs = Date.now(),
): number | null {
  if (lockAtIso == null || lockAtIso.trim() === "") return null;
  const t = new Date(lockAtIso).getTime();
  if (Number.isNaN(t)) return null;
  return t - nowMs;
}

export function picksDeadlineExpired(
  lockAtIso: string,
  nowMs = Date.now(),
): boolean {
  const ms = msUntilPoolLock(lockAtIso, nowMs);
  return ms != null && ms <= 0;
}

/** Live countdown label for the deadline banner. */
export function formatPicksDeadlineCountdown(
  lockAtIso: string,
  nowMs = Date.now(),
): string {
  const ms = msUntilPoolLock(lockAtIso, nowMs);
  if (ms == null) return "Picks lock soon";
  if (ms <= 0) return "Picks are now locked";

  const totalMinutes = Math.floor(ms / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours >= 1) {
    if (minutes > 0) return `Picks lock in ${hours}h ${minutes}m`;
    return `Picks lock in ${hours}h`;
  }
  if (totalMinutes >= 1) return `Picks lock in ${totalMinutes}m`;
  return "Picks lock in less than 1 minute";
}

export function picksDeadlineBannerUrgency(
  lockAtIso: string | null | undefined,
  isLocked: boolean,
  nowMs = Date.now(),
): PicksDeadlineBannerUrgency {
  if (isLocked || lockAtIso == null || lockAtIso.trim() === "") return "none";
  const ms = msUntilPoolLock(lockAtIso, nowMs);
  if (ms == null || ms <= 0) return "none";
  if (ms > PICKS_DEADLINE_BANNER_SOON_MS) return "none";
  if (ms > PICKS_DEADLINE_BANNER_URGENT_MS) return "soon";
  return "urgent";
}

export function shouldShowPicksDeadlineBanner(
  lockAtIso: string | null | undefined,
  isLocked: boolean,
  nowMs = Date.now(),
): boolean {
  return picksDeadlineBannerUrgency(lockAtIso, isLocked, nowMs) !== "none";
}

export function buildPicksDeadlineBannerCopy(
  role: PicksDeadlineBannerViewerRole,
  urls: {
    joinUrl: string;
    picksUrl: string | null;
    inviteUrl: string | null;
    poolUrl: string;
    adminIncompleteUrl: string | null;
  },
): PicksDeadlineBannerCopy {
  switch (role) {
    case "signed_out":
    case "signed_in_non_participant":
      return {
        headline: "Final chance to join",
        body: "Picks lock soon. Join the pool and make your World Cup picks before the deadline.",
        ctaKind: "link",
        ctaLabel: "Join the pool",
        ctaHref: urls.joinUrl,
      };
    case "participant_incomplete":
      return {
        headline: "Finish your picks before the deadline",
        body: "Picks lock soon. Complete your bracket before changes are closed.",
        ctaKind: "link",
        ctaLabel: "Finish my picks",
        ctaHref: urls.picksUrl ?? "/account/picks",
      };
    case "participant_complete":
      return {
        headline: "You're all set — invite someone before picks lock",
        body: "Your picks are complete. Invite anyone else who wants to join before the deadline.",
        ctaKind: urls.inviteUrl ? "copy_invite" : "link",
        ctaLabel: urls.inviteUrl ? "Copy invite link" : "View pool",
        ctaHref: urls.inviteUrl ?? urls.poolUrl,
      };
    case "admin":
      return {
        headline: "Deadline approaching",
        body: "Picks lock soon. Remind anyone who still has incomplete picks.",
        ctaKind: "link",
        ctaLabel: "View incomplete brackets",
        ctaHref: urls.adminIncompleteUrl ?? urls.poolUrl,
      };
  }
}

export type PicksDeadlineBannerViewModel = {
  lockAtIso: string;
  isLocked: boolean;
  urgency: Exclude<PicksDeadlineBannerUrgency, "none">;
  deadlineLabel: string;
  viewerRole: PicksDeadlineBannerViewerRole;
  copy: PicksDeadlineBannerCopy;
  inviteUrl: string | null;
};

export function buildPicksDeadlineBannerViewModel(input: {
  lockAtIso: string;
  isLocked?: boolean;
  viewerRole: PicksDeadlineBannerViewerRole;
  joinUrl: string;
  picksUrl: string | null;
  inviteUrl: string | null;
  poolUrl: string;
  adminIncompleteUrl: string | null;
  nowMs?: number;
}): PicksDeadlineBannerViewModel | null {
  const nowMs = input.nowMs ?? Date.now();
  const isLocked = input.isLocked ?? poolLocked(input.lockAtIso);
  const urgency = picksDeadlineBannerUrgency(
    input.lockAtIso,
    isLocked,
    nowMs,
  );
  if (urgency === "none") return null;

  const deadlineLabel = formatPoolPickDeadlineLabel(input.lockAtIso);
  const copy = buildPicksDeadlineBannerCopy(input.viewerRole, {
    joinUrl: input.joinUrl,
    picksUrl: input.picksUrl,
    inviteUrl: input.inviteUrl,
    poolUrl: input.poolUrl,
    adminIncompleteUrl: input.adminIncompleteUrl,
  });

  return {
    lockAtIso: input.lockAtIso,
    isLocked,
    urgency,
    deadlineLabel,
    viewerRole: input.viewerRole,
    copy,
    inviteUrl: input.inviteUrl,
  };
}
