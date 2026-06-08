import { getSiteUrl } from "@/lib/site-url";
import { safeNhlDraft26RedirectPath } from "./safeNhlDraft26RedirectPath";

export function buildNhlDraft26EmailConfirmRedirectUrl(
  redirectAfterConfirm: string,
): string {
  const next = safeNhlDraft26RedirectPath(redirectAfterConfirm, "/nhldraft26/picks");
  const base = getSiteUrl();
  const u = new URL("/auth/confirm", `${base.replace(/\/$/, "")}/`);
  u.searchParams.set("next", next);
  return u.toString();
}
