# LendLoop

> Borrow what you need. Lend what you don't.

A neighborhood tool-lending board. Neighbors list tools, request to borrow them for a date range, and the owner approves, declines and marks loans as returned. n8n handles notifications and daily overdue reminders, and writes its results back so every loan shows its automation activity (for example "Reminder sent 2 days ago").

**Stack:** Next.js 15 (App Router) · Clerk (auth) · Convex (data and backend logic) · n8n 2.46 (workflow automation) · TypeScript

---

## Features

**Public page (`/`)**
- Tagline and a read-only list of tools available right now. It shows **name and category only**, with no owner details.
- "Sign in to lend or borrow" opens Clerk.

**Signed-in area (`/app`)**
- **All tools:** every listing with its availability status, filterable by category. You can request to borrow any tool you don't own.
- **My listings:** create, edit and delete your own tools.
- **My requests:** your borrow requests, with status, lender and last automation activity. You can cancel pending ones.
- **Incoming requests:** approve or decline requests on your tools, and mark active loans as returned.
- **Admin** (admins only): remove any listing, see all loans, mark or unmark a user as **Trusted Lender**, and see failed automation runs.

---

## Architecture

```
            ┌──────────── Next.js (UI only) ────────────┐
 browser ──▶│  Clerk session  ──JWT──▶  Convex client     │
            └────────────────────────────┬───────────────┘
                                         │ queries / mutations (JWT verified by Convex)
                                         ▼
 ┌──────────────────────────── Convex ─────────────────────────────┐
 │ tools.ts / loans.ts / users.ts    every function re-checks auth  │
 │   └─ status change ─▶ scheduler ─▶ notifications.sendLoanEvent   │──┐ signed POST
 │ http.ts (HTTP actions, HMAC-verified):                           │  │ /webhook/lendloop-loan-events
 │   GET  /n8n/overdue-loans    POST /n8n/reminders                 │◀─┼──────────┐
 │   POST /n8n/events                                               │  │          │ signed calls
 └──────────────────────────────────────────────────────────────────┘  ▼          │
                                                       ┌───────────── n8n ────────┴──────┐
                                                       │ 1. Loan status notifications     │
                                                       │ 2. Daily overdue reminders (cron)│
                                                       │ 3. Error handler                 │
                                                       └──────────────────────────────────┘
```

### Data model (`convex/schema.ts`)

| Table | Purpose |
|---|---|
| `users` | Linked to the Clerk identity (`tokenIdentifier`). `role` is `admin` or `user`, plus a `trustedLender` flag |
| `tools` | Listings: `ownerId`, `name`, `category`, `condition`, `description` |
| `loans` | Borrow requests: dates (`YYYY-MM-DD`) and `status` (`pending` → `approved` → `returned`, or `declined` / `cancelled`) |
| `reminders` | One row per (loan, day), with a unique `idempotencyKey = loanId:day` |
| `automationEvents` | Activity per loan (notification sent or failed, reminder sent, workflow error), deduped by `eventKey` |

### Roles and rules (enforced in Convex, not just the UI)

All authorization lives in Convex functions (`convex/lib/auth.ts` → `requireUser` / `requireAdmin`), so calling the API directly cannot bypass it:

- **user:** create, edit and delete **only their own** listings (`tools.update/remove` check `ownerId`). They can only act on requests for **their own tools** (`approve/decline/markReturned` check `loan.ownerId`) or on **their own** borrowing (`cancel` checks `loan.borrowerId`). They cannot borrow their own tool, and approval is rejected if it overlaps another approved loan.
- **admin:** `tools.adminRemove`, `loans.all`, `users.listForAdmin`, `users.setTrustedLender` and `automation.recentProblems`.
- The role is **never taken from the client.** A user becomes admin only if their email is in the Convex env var `ADMIN_EMAILS`, or through the operator-only internal mutation `users:setRole`.
- The public query (`tools.publicList`) returns only `_id`, `name` and `category`.

### n8n workflows (`n8n/workflows/*.json`)

1. **Loan status notifications** (`POST /webhook/lendloop-loan-events`)
   Webhook (raw body) → **verify HMAC** → reject with 401, or → send notification (**mock**: logged) → sign write-back → `POST /n8n/events` to Convex → respond 200.
   The notification goes to the person who needs to act or know: a new request goes to the owner; approved, declined and returned go to the borrower; a cancellation goes to the owner.
2. **Daily overdue reminders** (cron `0 9 * * *` UTC, plus a manual "Run now" trigger)
   Sign → `GET /n8n/overdue-loans` → one item per loan → send reminder (**mock**) → sign → `POST /n8n/reminders` with `idempotencyKey = loanId:day`.
3. **Error handler** (Error Trigger)
   Set as `errorWorkflow` on both workflows. Every failed run is logged and recorded in Convex as a `workflow_error`, which admins see on `/app/admin`.

---

## Security and data-minimization decisions

- **Signed in both directions.** Every Convex → n8n and n8n → Convex call carries `x-lendloop-timestamp` and `x-lendloop-signature: sha256=HMAC(secret, "<ts>.<METHOD>.<path>.<rawBody>")`.
  - Including method and path stops a signature for one endpoint from being replayed on another.
  - Requests older than 5 minutes are rejected, and the comparison is constant-time.
  - n8n verifies against the **raw body**, not re-serialized JSON.
- **Secrets stay out of code and workflow JSON.** `LENDLOOP_WEBHOOK_SECRET` lives in the Convex env (`npx convex env set`) and in n8n's container env (`.env.n8n`, git-ignored). Workflows read it through `$env`. The exported workflow JSON contains no secrets. The Clerk issuer and the n8n URL are Convex env vars too.
- **Idempotent write-backs.**
  - Reminders use `loanId:day` as a unique key: retries and a second run on the same day are no-ops, and a success is never downgraded to a failure.
  - Notification records use `eventKey`, which is unique per state change.
  - Convex also skips loans already reminded today when n8n asks for overdue loans.
- **No silent failures.**
  - Convex retries the n8n webhook up to 5 times with exponential backoff, then records `notification_failed` on the loan.
  - n8n HTTP nodes retry 3 times, and any failed execution goes to the error workflow, which records it in Convex.
- **Data minimization.**
  - n8n receives only what it needs to notify one person: recipient name and email, tool name, dates and status. It never gets user ids, other users' data or roles.
  - The overdue endpoint returns only the borrower's name and email, the tool name and the due date.
  - The public page exposes no owner information.
- **Input validation.** Field lengths, allowed categories and conditions, date format and range (no past start, at most 60 days), and size and shape checks on every HTTP payload.

---

## Local setup

Requirements: **Node 22+** (`.nvmrc`), Docker, a free [Clerk](https://clerk.com) account.

```bash
npm install
```

### 1. Clerk

1. Create a Clerk application (email sign-in is enough).
2. In the Clerk dashboard, enable the **Convex integration**, or create a JWT template named `convex` from the Convex preset. Note the **Frontend API URL** (e.g. `https://xxx.clerk.accounts.dev`).
3. Copy `.env.local.example` to `.env.local` and fill in `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY`.

### 2. Convex

```bash
npx convex dev            # creates a deployment (or choose "run locally", no account needed) and fills CONVEX_* in .env.local
```

In another terminal, set the backend environment:

```bash
SECRET=$(openssl rand -hex 32)
npx convex env set CLERK_JWT_ISSUER_DOMAIN https://xxx.clerk.accounts.dev
npx convex env set LENDLOOP_WEBHOOK_SECRET "$SECRET"
npx convex env set N8N_LOAN_EVENTS_WEBHOOK_URL http://localhost:5678/webhook/lendloop-loan-events
npx convex env set ADMIN_EMAILS you@example.com
echo "$SECRET"            # you'll need the same value for n8n
```

Optional demo data, including an overdue loan: `npx convex run seed:demo`.

### 3. n8n (Docker)

```bash
cp .env.n8n.example .env.n8n      # set N8N_ENCRYPTION_KEY, the same LENDLOOP_WEBHOOK_SECRET, and LENDLOOP_CONVEX_SITE_URL
docker compose up -d

# import and publish the workflows (the error handler first, it is referenced by the others)
for f in error-handler loan-events overdue-reminders; do
  docker compose exec n8n n8n import:workflow --input=/workflows/$f.json
done
for id in LendLoopErrorWf1 LendLoopLoanEvts LendLoopOverdue1; do
  docker compose exec n8n n8n publish:workflow --id=$id
done
docker compose restart n8n
```

`LENDLOOP_CONVEX_SITE_URL` is the Convex **HTTP actions** URL as seen from the container: `http://host.docker.internal:3211` for a local Convex backend, or `https://<deployment>.convex.site` for Convex cloud. With Convex cloud, n8n on `localhost` is not reachable from Convex, so expose it with a tunnel (e.g. `cloudflared tunnel --url http://localhost:5678`) and use that URL for `N8N_LOAN_EVENTS_WEBHOOK_URL`.

The n8n UI is at http://localhost:5678, where you can create the owner account to inspect executions.

### 4. Run the app

```bash
npm run dev     # http://localhost:3000
```

### Testing the integration by hand

```bash
export LENDLOOP_WEBHOOK_SECRET=...   # same secret
node scripts/signed-request.mjs GET http://127.0.0.1:3211/n8n/overdue-loans          # 200 with overdue loans
curl -i http://127.0.0.1:3211/n8n/overdue-loans                                        # 401 (unsigned)
docker compose exec -e N8N_RUNNERS_BROKER_PORT=5690 n8n n8n execute --id=LendLoopOverdue1   # run reminders now
```

What I verified locally:
- A signed request returns 200, and a forged or unsigned one returns 401, in both directions.
- Running the reminder workflow twice on the same day records one reminder per loan.
- With n8n stopped, Convex retries 5 times and records `notification_failed` on the loan.
- A failing n8n run is recorded as `workflow_error` by the error workflow.

### Environment variables

| Where | Variable | Purpose |
|---|---|---|
| `.env.local` | `NEXT_PUBLIC_CONVEX_URL`, `CONVEX_DEPLOYMENT` | Filled by `npx convex dev` |
| `.env.local` | `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` | Clerk keys |
| Convex env | `CLERK_JWT_ISSUER_DOMAIN` | Clerk Frontend API URL, used to verify JWTs |
| Convex env | `LENDLOOP_WEBHOOK_SECRET` | Shared HMAC secret (32+ chars) |
| Convex env | `N8N_LOAN_EVENTS_WEBHOOK_URL` | Where Convex posts loan events |
| Convex env | `ADMIN_EMAILS` | Comma-separated emails that become admin on sign-in |
| `.env.n8n` | `N8N_ENCRYPTION_KEY` | Encrypts n8n's stored credentials |
| `.env.n8n` | `LENDLOOP_WEBHOOK_SECRET` | Same shared secret |
| `.env.n8n` | `LENDLOOP_CONVEX_SITE_URL` | Convex HTTP actions base URL |

---

## What I would change to run this in production

- **Real notification channel.** Swap the mock Code nodes for an email node (Resend, SES) or Slack, with sender-domain authentication. Dedupe sends in n8n by `eventKey` too (n8n Data Table or Redis), so a redelivered webhook never sends the same email twice, not only never records it twice.
- **Secret rotation.** Accept two secrets during a rotation window (current and next) and add a key id header.
- **Replay protection beyond the time window.** Store recent `(timestamp, signature)` pairs for the tolerance period and reject repeats.
- **An outbox instead of fire-and-forget scheduling.** Persist each loan event in a table, mark it delivered on a 2xx, and alert on events that stay undelivered. Today the final failure is only recorded on the loan.
- **n8n hardening.** Run n8n with Postgres instead of SQLite, queue mode with workers, `N8N_BLOCK_ENV_ACCESS_IN_NODE=true`, and secrets injected via n8n's external secrets or credentials, plus HTTPS with basic network allow-listing between Convex and n8n.
- **Time zones.** Store each user's time zone and send reminders in their morning. Today everything is UTC.
- **Scale.** Paginate the tools and loans queries, add a `by_status` index for admin views, and denormalize availability instead of computing it per tool.
- **Observability.** Ship n8n and Convex logs to a log platform, and alert on `workflow_error` and `notification_failed` rather than relying on the admin page.
- **Tests.** Convex function tests (`convex-test`) for every authorization rule, and an end-to-end test of the signed round trip in CI.
- **Abuse and privacy.** Rate-limit requests per user, add an audit log for admin actions, and support account deletion that anonymizes loan history.
