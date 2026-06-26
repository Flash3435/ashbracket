/**
 * Post-lock navigation and copy helpers — reveal/leaderboard emphasis after picks lock.
 * Custom-open pools (knockout bracket still editable after pre-knockout lock) stay edit-focused.
 */

export type PostLockNavCta = {
  label: string;
  href: string;
};

export type PostLockNavInput = {
  picksLocked: boolean;
  knockoutBracketPicksUnlocked: boolean;
  /** When set, overrides `knockoutBracketPicksUnlocked` for post-lock engagement mode. */
  knockoutPicksEditable?: boolean;
  revealHref: string | null;
  leaderboardHref: string | null;
  outlookHref?: string | null;
  picksHref: string;
  activityHref: string | null;
};

export type PostLockNavPlan = {
  postLockEngagement: boolean;
  primary: PostLockNavCta;
  secondary: PostLockNavCta;
  tertiary: PostLockNavCta | null;
};

/** True when UI should emphasize reveal/leaderboard over editing picks. */
export function isPostLockEngagementMode(
  picksLocked: boolean,
  knockoutBracketPicksUnlocked: boolean,
  knockoutPicksEditable?: boolean,
): boolean {
  const editable = knockoutPicksEditable ?? knockoutBracketPicksUnlocked;
  return picksLocked && !editable;
}

export function buildPostLockNavPlan(input: PostLockNavInput): PostLockNavPlan {
  const postLockEngagement = isPostLockEngagementMode(
    input.picksLocked,
    input.knockoutBracketPicksUnlocked,
    input.knockoutPicksEditable,
  );
  const activityHref = input.activityHref ?? "/account/activity";

  if (!postLockEngagement) {
    return {
      postLockEngagement: false,
      primary: {
        label: input.picksLocked ? "View picks" : "Edit picks",
        href: input.picksHref,
      },
      secondary: { label: "Activity", href: activityHref },
      tertiary: input.revealHref
        ? {
            label: input.picksLocked ? "See everyone's picks" : "Preview reveal",
            href: input.revealHref,
          }
        : null,
    };
  }

  const revealHref = input.revealHref?.trim() ?? "";
  const hasReveal = revealHref.length > 0;

  if (hasReveal) {
    return {
      postLockEngagement: true,
      primary: { label: "See everyone's picks", href: revealHref },
      secondary: input.leaderboardHref
        ? { label: "View leaderboard", href: input.leaderboardHref }
        : input.outlookHref
          ? { label: "View outlook", href: input.outlookHref }
          : { label: "View picks", href: input.picksHref },
      tertiary: { label: "View activity", href: activityHref },
    };
  }

  if (input.leaderboardHref) {
    return {
      postLockEngagement: true,
      primary: { label: "View leaderboard", href: input.leaderboardHref },
      secondary: { label: "View picks", href: input.picksHref },
      tertiary: { label: "View activity", href: activityHref },
    };
  }

  if (input.outlookHref) {
    return {
      postLockEngagement: true,
      primary: { label: "View outlook", href: input.outlookHref },
      secondary: { label: "View picks", href: input.picksHref },
      tertiary: { label: "View activity", href: activityHref },
    };
  }

  return {
    postLockEngagement: true,
    primary: { label: "View picks", href: input.picksHref },
    secondary: { label: "View activity", href: activityHref },
    tertiary: null,
  };
}

export type PostLockCardVariant = "landing" | "account";

export function postLockCardCopy(variant: PostLockCardVariant): {
  headline: string;
  body: string;
} {
  if (variant === "account") {
    return {
      headline: "Your bracket is locked",
      body: "Now you can reveal the pool, compare picks, and track the leaderboard.",
    };
  }
  return {
    headline: "Picks are locked — let the pool begin",
    body: "Brackets are set. Reveal everyone's picks, compare champion choices, and follow the leaderboard as matches are played.",
  };
}

export type PoolSnapshotStats = {
  totalParticipants: number;
  completeBrackets: number;
  mostPopularChampion: string | null;
};

/** Neutral empty/incomplete notes for pool snapshot cards. */
export function poolSnapshotFootnote(stats: PoolSnapshotStats | null): string | null {
  if (!stats) return null;
  if (stats.totalParticipants === 0) {
    return "No participants in this pool yet — check back once members join.";
  }
  if (stats.completeBrackets < stats.totalParticipants) {
    return "Some brackets were incomplete at lock.";
  }
  return null;
}
