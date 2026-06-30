import type { KnockoutProgressContext } from "../picks/knockoutMatchProgress";
import {
  buildParticipantDashboardMissingKnockoutPicks,
  type ParticipantDashboardMissingKnockoutPicks,
} from "../admin/adminKnockoutPickStatus";

export type DashboardMissingPicksModel = {
  actionableCount: number;
  headline: string;
  detail: string;
  tone: "action" | "complete";
  ctaLabel: string | null;
};

function formatEnglishList(items: string[]): string {
  const unique = [...new Set(items.map((s) => s.trim()).filter(Boolean))];
  if (unique.length === 0) return "";
  if (unique.length === 1) return unique[0]!;
  if (unique.length === 2) return `${unique[0]} and ${unique[1]}`;
  return `${unique.slice(0, -1).join(", ")}, and ${unique[unique.length - 1]}`;
}

export function formatDashboardMissingKnockoutCopy(
  missing: Pick<
    ParticipantDashboardMissingKnockoutPicks,
    "actionableCount" | "matchups" | "categorySummaryLines"
  >,
): Pick<DashboardMissingPicksModel, "headline" | "detail" | "tone" | "ctaLabel"> {
  if (missing.actionableCount === 0) {
    return {
      headline: "Your bracket is up to date",
      detail:
        "All currently available knockout picks are filled. Future matchups will unlock as results become official.",
      tone: "complete",
      ctaLabel: null,
    };
  }

  const headline =
    missing.actionableCount === 1
      ? "You still need 1 pick"
      : `You still need ${missing.actionableCount} picks`;

  const matchupList = formatEnglishList(missing.matchups);
  let detail: string;
  if (matchupList) {
    detail = `Pick winners for ${matchupList} before kickoff.`;
  } else {
    const categoryList = formatEnglishList(missing.categorySummaryLines);
    detail = categoryList
      ? `Complete ${categoryList} before kickoff.`
      : "Complete your remaining knockout picks before kickoff.";
  }

  return {
    headline,
    detail,
    tone: "action",
    ctaLabel: "Complete picks",
  };
}

export function buildDashboardMissingPicksModel(
  context: KnockoutProgressContext & { nowMs?: number },
): DashboardMissingPicksModel {
  const missing = buildParticipantDashboardMissingKnockoutPicks(context);
  const copy = formatDashboardMissingKnockoutCopy(missing);
  return {
    actionableCount: missing.actionableCount,
    ...copy,
  };
}
