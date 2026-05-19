# Production rollout: simulation-safe World Cup pools

Use this checklist when deploying edition-scoped simulation isolation to **production** without a staging environment. Data mistakes are harder to undo than reverting an app deploy.

## Before you start

1. **Back up the database** (Supabase dashboard snapshot or `pg_dump` of at least):
   - `pools`, `participants`, `predictions`, `points_ledger`
   - `results`, `tournament_editions`, `tournament_matches`
2. Note the **live pool id(s)** and export current **standings totals** (screenshot or CSV) so you can compare after deploy.
3. Confirm `fifa_wc_2026` official edition exists (run WC seed if needed).

## Deploy order

### 1. Apply database migration

Apply `supabase/migrations/20260518120000_wc_simulation_edition_isolation.sql`:

- Adds `results.edition_id`, `pools.tournament_edition_id`, `pools.is_simulation`, `tournament_editions.is_simulation`
- Backfills existing rows to the live official edition
- Adds RPCs: `clone_tournament_edition_for_simulation`, `bootstrap_simulation_pool`

Verify migration success before deploying the app.

### 2. Deploy the application

Push to the branch Vercel watches (e.g. `main`). Wait for the production build to finish.

### 3. Verify live behavior unchanged

As a global admin:

1. Open **Admin →** a **live** pool → **Standings**. Note “Standings updated” time in the diagnostics table.
2. Open **Admin → Tournament results (live)**. Confirm the green **Live tournament data** banner.
3. Optionally run **Recalculate live pools** (with confirmation on production). Live standings should match your pre-deploy snapshot.
4. Open **Admin → Simulation testing → Pilot verification**. Confirm live pools list looks correct.

Do **not** create a simulation pool until live checks pass.

## Controlled production pilot

### 4. Open the pilot checklist (recommended)

**Admin → Production pilot checklist** (`/admin/pilot`) shows environment, simulation-email status, live vs simulation pools, standings snapshots, and a short event log.

### 5. Create a simulation pool

1. **Admin → Simulation testing**
2. Review the impact summary, check the confirmation box on production, click **Create simulation pool**
3. Confirm the new pool shows **Simulation pool** in the header and links to **Test results**

Or CLI (service role):

```bash
cd ashbracket
npx tsx scripts/bootstrap-simulation-pool.ts "Production pilot sim"
```

### 6. Use test accounts only

- Join the simulation pool with **dedicated test users** (not real money-pool participants).
- Enter picks in the simulation pool only.

### 7. Simulation email on production (blocked by default)

On **production**, real outbound email from **simulation pools** is **blocked by default** (server-enforced). This includes bulk pool email, test sends, participant invites, and pool-admin invite emails.

**Recommended order:**

1. **Do not test email first** — skip invites and pool communications until isolation is verified.
2. Verify **picks**, **test results**, and **simulation standings** in the pilot pool.
3. Only if truly needed, ask your operator to set on the Vercel/host environment:
   - `ALLOW_SIMULATION_EMAIL_IN_PRODUCTION=true`
4. Redeploy, then use **test recipients only**. You must type **`SEND TEST EMAIL`** and confirm the checkboxes before any send goes out.

**Admin → pool → Email participants** shows whether email is blocked or override-enabled. **Participants** invite/resend uses the same rules.

**Live pools** are unchanged: production still uses the normal confirmation checkbox for bulk email; simulation blocking does not apply to live pools.

### 8. Enter fake results and recompute

1. **Admin → Simulation testing → Test results** (or pool → Test results)
2. Enter a few group or knockout results (amber **Simulation** banners)
3. **Recalculate simulation pools** (with production confirmation)
4. Check simulation pool standings updated

### 9. Confirm live standings unchanged

1. Return to a **live** pool → **Standings**
2. Compare totals to your pre-deploy snapshot
3. **Pilot verification** panel: live pool “Standings updated” should be unchanged unless you ran a live action

Use **Compare to latest snapshot** on the pilot page after simulation work.

### 10. Live sync (only when intentional)

**Admin → Tournament data (live)** — red production banner, impact summary, confirmation.

This affects **live edition and live pools only**, not simulation data.

## Audit logs

High-risk admin actions log a single line to server logs:

```
[ashbracket:admin-risk] env=production action=... mode=live|simulation simEmailOverride=false emailBlocked=true ...
```

Simulation email attempts log `simEmailOverride` and `emailBlocked` (blocked vs allowed). Search Vercel/host logs after each pilot step.

## Rollback

- **App rollback**: revert Git deploy on Vercel.
- **Data**: restoring from backup is the safe path if live `results` or ledgers were corrupted. Simulation rows can be deleted by edition/pool id if needed.

## What staging would still add

Without staging you cannot fully rehearse migrations or email delivery. Remaining risks:

- Resend still sends real mail for **live** pools when keys are configured; simulation pools stay blocked until `ALLOW_SIMULATION_EMAIL_IN_PRODUCTION=true`
- Manual SQL on production for match scores in simulation editions
- Human error choosing **Live tournament results** vs **Simulation results** URLs (mitigated by banners and confirmations)
