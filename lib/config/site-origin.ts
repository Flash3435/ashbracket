/**
 * Absolute site URL for invite links and emails.
 * Set NEXT_PUBLIC_SITE_URL in production (e.g. https://ashbracket.example.com).
 */
export function siteOrigin(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (explicit) {
    return explicit.replace(/\/$/, "");
  }
  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) {
    const host = vercel.replace(/\/$/, "");
    return host.startsWith("http") ? host : `https://${host}`;
  }
  return "http://localhost:3000";
}

export function joinInviteUrl(inviteToken: string): string {
  const base = siteOrigin();
  const q = new URLSearchParams({ invite: inviteToken });
  return `${base}/join?${q.toString()}`;
}
