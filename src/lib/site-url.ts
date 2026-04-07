/**
 * Canonical public base URL for absolute links in emails and server-side use.
 *
 * Order:
 * 1. `SITE_URL` (server-only; preferred in Vercel so secrets stay off the client bundle)
 * 2. `NEXT_PUBLIC_SITE_URL`
 * 3. Local Next dev → `http://localhost:3000`
 * 4. Vercel preview → `https://<VERCEL_URL>` (invite links in test deployments)
 * 5. Vercel production with neither env set → `https://ashbracket.com` (avoid *.vercel.app in real emails)
 * 6. Otherwise → `http://localhost:3000`
 */
function stripTrailingSlash(url: string): string {
  return url.replace(/\/$/, "");
}

export function getSiteUrl(): string {
  const siteUrl = process.env.SITE_URL?.trim();
  if (siteUrl) return stripTrailingSlash(siteUrl);

  const publicUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (publicUrl) return stripTrailingSlash(publicUrl);

  if (process.env.NODE_ENV === "development") {
    return "http://localhost:3000";
  }

  if (process.env.VERCEL_ENV === "preview") {
    const vercel = process.env.VERCEL_URL?.trim();
    if (vercel) {
      const host = vercel.replace(/\/$/, "");
      return host.startsWith("http")
        ? stripTrailingSlash(host)
        : `https://${host}`;
    }
  }

  if (process.env.VERCEL_ENV === "production") {
    return "https://ashbracket.com";
  }

  return "http://localhost:3000";
}

/** @deprecated Use `getSiteUrl()` — kept for call sites that used the old name. */
export function siteOrigin(): string {
  return getSiteUrl();
}

export function joinInviteUrl(inviteToken: string): string {
  const base = getSiteUrl();
  const q = new URLSearchParams({ invite: inviteToken });
  return `${base}/join?${q.toString()}`;
}
