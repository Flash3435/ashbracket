/** True when the URL hash looks like a Supabase implicit/recovery redirect. */
export function hasRecoveryTokensInHash(): boolean {
  if (typeof window === "undefined") return false;
  const raw = window.location.hash.replace(/^#/, "");
  if (!raw) return false;
  const params = new URLSearchParams(raw);
  if (params.get("type") === "recovery") return true;
  return params.has("access_token") && params.get("type") !== "signup";
}

/** Remove Supabase auth tokens from the URL hash without a navigation. */
export function clearAuthHashFromUrl(): void {
  if (typeof window === "undefined") return;
  if (!window.location.hash) return;
  const path = `${window.location.pathname}${window.location.search}`;
  window.history.replaceState(null, "", path);
}
