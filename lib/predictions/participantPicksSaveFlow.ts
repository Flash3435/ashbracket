import type { SaveKnockoutPicksResult } from "../../types/knockoutPicksSave";

export const PICKS_LEDGER_REVALIDATE_WARNING_PREFIX =
  "Your picks were saved, but the pool leaderboard could not be updated yet:";

export const PICKS_PAGE_REFRESH_WARNING =
  "Your picks were saved, but this page could not refresh automatically. Reload if banners or standings look out of date.";

export function savePicksValidationError(error: string): SaveKnockoutPicksResult {
  return { ok: false, kind: "validation_error", error };
}

export function savePicksUnexpectedError(error: string): SaveKnockoutPicksResult {
  return { ok: false, kind: "unexpected_error", error };
}

export function savePicksSuccess(warning?: string): SaveKnockoutPicksResult {
  return warning
    ? { ok: true, kind: "success", warning }
    : { ok: true, kind: "success" };
}

export function mergePicksSaveWarnings(...parts: Array<string | undefined | null>): string | undefined {
  const merged = parts
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part));
  return merged.length > 0 ? merged.join(" ") : undefined;
}

export function buildPostSaveSuccessResult(opts: {
  ledgerError?: string | null;
  revalidateError?: string | null;
}): Extract<SaveKnockoutPicksResult, { ok: true }> {
  const warnings: string[] = [];
  if (opts.ledgerError?.trim()) {
    warnings.push(`${PICKS_LEDGER_REVALIDATE_WARNING_PREFIX} ${opts.ledgerError.trim()}`);
  }
  if (opts.revalidateError?.trim()) {
    warnings.push(PICKS_PAGE_REFRESH_WARNING);
  }
  return savePicksSuccess(
    warnings.length > 0 ? warnings.join(" ") : undefined,
  ) as Extract<SaveKnockoutPicksResult, { ok: true }>;
}

export type PicksSaveClientNextStep =
  | { step: "show_error"; message: string }
  | { step: "redirect"; to: string }
  | { step: "show_saved"; warning?: string };

export function resolvePicksSaveClientNextStep(
  res: SaveKnockoutPicksResult,
  opts: { postSaveRedirectTo?: string },
): PicksSaveClientNextStep {
  if (!res.ok) {
    return { step: "show_error", message: res.error };
  }
  if (opts.postSaveRedirectTo) {
    return { step: "redirect", to: opts.postSaveRedirectTo };
  }
  return { step: "show_saved", warning: res.warning };
}

export function mergeSavedWarningWithRefreshFailure(
  existingWarning: string | undefined,
  refreshFailed: boolean,
): string | undefined {
  if (!refreshFailed) return existingWarning;
  return mergePicksSaveWarnings(existingWarning, PICKS_PAGE_REFRESH_WARNING);
}

export function refreshFailureMessageFromUnknown(error: unknown): string {
  return error instanceof Error && error.message.trim()
    ? error.message.trim()
    : "Connection closed.";
}

export async function tryRefreshPicksPage(
  refresh: () => void | Promise<void>,
): Promise<{ refreshFailed: false } | { refreshFailed: true; message: string }> {
  try {
    await Promise.resolve(refresh());
    return { refreshFailed: false };
  } catch (error) {
    return {
      refreshFailed: true,
      message: refreshFailureMessageFromUnknown(error),
    };
  }
}

export const PARTICIPANT_PICK_REVALIDATE_PATHS = [
  "/account/picks",
  "/account/picks/summary",
  "/account",
  "/account/activity",
] as const;

export function participantPickRevalidatePaths(
  participantId: string,
): string[] {
  return [
    ...PARTICIPANT_PICK_REVALIDATE_PATHS,
    `/participant/${participantId}/snapshot`,
    `/participant/${participantId}`,
  ];
}
