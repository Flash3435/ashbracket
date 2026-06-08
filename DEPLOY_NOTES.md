# AshBracket deployment

Small-team workflow: migrate the database first, ship data updates if needed, commit, then let Vercel pick up the app (or deploy explicitly).

## Prerequisites (one-time per machine)

| Tool | Purpose |
|------|---------|
| [Supabase CLI](https://supabase.com/docs/guides/cli) | `supabase db push` to production |
| [Vercel CLI](optional) | `npm run deploy:vercel-cli` — only if you do not use Git → Vercel |

### Required environment variables (Vercel production)

| Variable | Example | Purpose |
|----------|---------|---------|
| `NEXT_PUBLIC_SITE_URL` | `https://ashbracket.com` | Canonical site URL for password-reset emails, invites, and absolute links |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://<project>.supabase.co` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | (from Supabase dashboard) | Browser/server anon key |

Optional: `SITE_URL` (server-only) overrides `NEXT_PUBLIC_SITE_URL` for server-side email/link generation.

**Local dev:** set `NEXT_PUBLIC_SITE_URL=http://localhost:3000` in `.env.local` (or rely on the dev fallback in `getSiteUrl()`).

### Supabase Authentication → URL Configuration

Required for signup, email change, and **password reset** links to land on production (not `localhost`).

| Setting | Production value |
|---------|------------------|
| **Site URL** | `https://ashbracket.com` (keep this — do not set back to localhost) |
| **Redirect URLs** (add each; all are required for password reset) | `https://ashbracket.com/reset-password` |
| | `https://ashbracket.com/**` |
| | `https://ashbracket.com/auth/confirm` |

**Local dev** may also include:

- `http://localhost:3000/**`
- `http://localhost:3000/reset-password`

Password-reset emails should include a `redirect_to` query param like  
`https://ashbracket.com/auth/confirm?next=%2Freset-password` (the app sends this via `POST /api/auth/forgot-password` → `resetPasswordForEmail(..., { redirectTo })`).

If the emailed link shows only `redirect_to=https://ashbracket.com` (no path), Supabase rejected the redirect URL and fell back to Site URL. Ensure these are in **Redirect URLs**:

- `https://ashbracket.com/auth/confirm`
- `https://ashbracket.com/reset-password`
- `https://ashbracket.com/**`

Request a **new** reset email after any dashboard change. Check Vercel logs for `[forgot-password] resetPasswordForEmail redirectTo:` to confirm what the app sent.

**Recovery email template (optional):** Under Authentication → Email Templates → Reset password, Supabase’s PKCE-friendly link format is documented in [Email Templates](https://supabase.com/docs/guides/auth/auth-email-templates). If you customize the template, use `{{ .RedirectTo }}` (not only `{{ .SiteURL }}`) when building the action link.

Link the repo to your Supabase project (from `ashbracket/`):

```bash
supabase login
supabase link --project-ref <your-project-ref>
```

## Release checklist (order matters)

Use this every time schema, data, or app code changes together.

- [ ] **1. Local sanity** — `npm run deploy:check` (build + lint)
- [ ] **2. Database** — `npm run deploy:db` (runs `supabase db push`)
- [ ] **3. Data** — only when needed (see [Seed / data updates](#seed--data-updates))
- [ ] **4. Git** — commit and `git push origin main`
- [ ] **5. App** — normally **skip**: `git push` triggers Vercel. Only if Git integration is off: `npm run deploy:vercel-cli`
- [ ] **6. Production smoke** — [Manual checklist](#production-smoke-after-deploy) or `npm run verify:prod` with `ASHBRACKET_URL` set
- [ ] **7. Auth URLs** (when auth/email behavior changed) — `NEXT_PUBLIC_SITE_URL` on Vercel; Supabase [URL Configuration](#supabase-authentication--url-configuration) matches production domain

### npm shortcuts

| Script | What it does |
|--------|----------------|
| `npm run deploy:check` | `npm run build` then `npm run lint` — run before every release |
| `npm run deploy:db` | `supabase db push` — applies `supabase/migrations/*` to the linked project |
| `npm run deploy:vercel-cli` | `vercel deploy --prod` — rare; default is Git push → Vercel |
| `npm run verify:prod` | HTTP smoke test (needs `ASHBRACKET_URL`) — see below |

### Seed / data updates

Not every release needs this.

- **Local / fresh Supabase:** `supabase db reset` applies migrations + `supabase/seed.sql` (destructive locally).
- **Production:** Prefer targeted SQL in the Supabase SQL editor, admin UI, or small one-off scripts. Avoid blindly pasting full `seed.sql` into production if it wipes data.
- **Content scripts in repo:** `npm run seed:wc2026`, `npm run seed:fifa-ranks` — use when those datasets need refreshing (see script headers).

### If `supabase db push` ever failed halfway

Fix migration state once in the Supabase dashboard (migration history / SQL), then rely on repo migrations — avoid permanent one-off patches that drift from Git.

---

## Production smoke (after deploy)

Do this in the browser (logged out is enough for public pages), or run the script.

| URL | What to confirm |
|-----|-----------------|
| `/` | Standings load; no Supabase error banner |
| `/rules` | Pool name, entry/prizes/scoring sections render |
| `/tournament` | Tournament view loads |
| `/account/picks` | Page loads or sensible login redirect (no 500) |

**CLI smoke test** (requires network):

```bash
ASHBRACKET_URL=https://your-production-domain npm run verify:prod
```

---

## Recommended release flow (summary)

1. `npm run deploy:check`
2. `npm run deploy:db`
3. Update production data only if this release requires it
4. `git push` (triggers Vercel when connected to Git)
5. `ASHBRACKET_URL=… npm run verify:prod` and/or quick browser pass

---

## Audit notes (why this order)

- **DB before app:** New code may expect new columns or views; deploying the app first can cause runtime errors until `db push` runs.
- **Git push is the app deploy:** Vercel builds from the repo; `deploy:vercel-cli` is only for CLI-only or emergency redeploys.
- **verify:prod:** Catches wrong URL, outage, or 500s on key routes without testing every admin page.
