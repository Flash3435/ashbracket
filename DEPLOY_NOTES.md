# AshBracket deployment

Small-team workflow: migrate the database first, ship data updates if needed, commit, then let Vercel pick up the app (or deploy explicitly).

## Prerequisites (one-time per machine)

| Tool | Purpose |
|------|---------|
| [Supabase CLI](https://supabase.com/docs/guides/cli) | `supabase db push` to production |
| [Vercel CLI](optional) | `npm run deploy:web` — or rely on Git → Vercel |

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
- [ ] **5. App** — if Vercel is **not** auto-deploying from Git: `npm run deploy:web`
- [ ] **6. Production smoke** — [Manual checklist](#production-smoke-after-deploy) or `npm run verify:prod` with `ASHBRACKET_URL` set

### npm shortcuts

| Script | What it does |
|--------|----------------|
| `npm run deploy:check` | `npm run build` then `npm run lint` — run before every release |
| `npm run deploy:db` | `supabase db push` — applies `supabase/migrations/*` to the linked project |
| `npm run deploy:web` | `vercel deploy --prod` — optional if you deploy from CLI |
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
- **Git push before manual Vercel:** Most teams use Git integration so push = deploy; `deploy:web` is for CLI-only or redeploys.
- **verify:prod:** Catches wrong URL, outage, or 500s on key routes without testing every admin page.
