# Workspace

## Overview

**LocalSpot Mailer** — a local direct-mail advertising platform for Clarkesville, GA. Businesses buy ad spots on a 9×12 co-op postcard mailed to 5,000 homes via USPS EDDM.

pnpm workspace monorepo using TypeScript.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)
- **Frontend**: React + Vite + Wouter routing + TailwindCSS
- **Payments**: Stripe (backend `stripe` pkg + frontend `@stripe/stripe-js`)
- **Email**: Resend (`resend` pkg)
- **Auth**: JWT via `jsonwebtoken` (admin dashboard only)

## Artifacts

| Artifact | Path | Purpose |
|---|---|---|
| `artifacts/localspot` | `/` | React+Vite frontend (PostcardSpotPicker, checkout, upload, admin) |
| `artifacts/api-server` | `/api` | Express backend (campaigns, spots, checkout, admin routes) |

## Campaign management

- Campaigns have status `draft | active | completed` (default `draft`).
  Migrated from the legacy `[active, closed, mailed]` enum on 2026-05-02.
- Only one campaign can be `active` at a time. The public picker calls
  `GET /api/campaigns/active` and renders the first row it gets back.
- Admin endpoints (all require `Authorization: Bearer <admin token>`):
  - `GET /api/admin/campaigns` — list with revenue rollups (single GROUP BY).
  - `POST /api/admin/campaigns` — create campaign + auto-generate the standard
    16-spot postcard layout in a single transaction (9 sellable front cells:
    `mb dn re hv ins lw a2 pz a1`; 7 sellable back cells: `bxl bl1 bl2 bm1 bm2
    bs1 bs2`). House-ad cells (`hs bhs bhr bhn`) and the EDDM block (`ed`) are
    rendered statically by the frontend and intentionally have no DB row.
  - `GET /api/admin/campaigns/:id` — single campaign + spots + revenue summary.
  - `POST /api/admin/campaigns/:id/activate` — transactional: demotes any other
    active campaign to `completed`, then promotes the target.
  - `POST /api/admin/campaigns/:id/complete` — sets `completed`, fires the
    admin notification email with revenue and sell-through.
- `POST /api/spots/:id/reserve` rejects when the parent campaign is not
  `active` (defense in depth — the picker already only shows active campaigns).

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)

## Environment Variables / Secrets Required

See `.env.example` for full documentation. Summary:

| Secret | Required for | Notes |
|---|---|---|
| `STRIPE_SECRET_KEY` | Payments | `sk_test_...` for sandbox; connect via Replit Stripe integration |
| `VITE_STRIPE_PUBLISHABLE_KEY` | Stripe frontend | `pk_test_...`; must be set as a secret |
| `RESEND_API_KEY` | Email notifications | Connect via Replit Resend integration |
| `ADMIN_EMAIL` | Admin notifications | Where new order emails are sent |
| `FROM_EMAIL` | Email sender | Must be verified in Resend |
| `VITE_CLOUDINARY_CLOUD_NAME` | Ad file uploads | Cloudinary cloud name |
| `VITE_CLOUDINARY_UPLOAD_PRESET` | Ad file uploads | Unsigned upload preset |
| `ADMIN_PASSWORD` | Admin dashboard | Default: `localspot-admin-2025` |
| `SESSION_SECRET` | JWT signing | Already set ✓ |
| `APP_URL` | Email links | Your deployed domain |

## Pending Integrations (skipped by user — connect when ready)

- **Stripe**: Use Replit Stripe integration, or manually add `STRIPE_SECRET_KEY` + `VITE_STRIPE_PUBLISHABLE_KEY` as secrets.
- **Resend**: Use Replit Resend integration, or manually add `RESEND_API_KEY`, `ADMIN_EMAIL`, `FROM_EMAIL` as secrets.
- Both gracefully degrade — the app works without them but payments and emails won't function.

## Multi-issue subscription commitments

Added in May 2026 (project task #84). Two new commitment tiers sit alongside the existing one-time PaymentIntent flow:

- **Growth Plan** — 6 consecutive issues, 10% discount, billed monthly.
- **Premium Visibility Plan** — 12 consecutive issues, 20% discount, billed monthly.

Customer flow:

1. Pick a spot, reserve as usual.
2. On `/checkout/:spotId` choose between **One-Time Placement** (existing embedded card form) and the two new plans.
3. Subscription picks redirect to Stripe Checkout (hosted), then to `/subscription-confirmation`.
4. Stripe `cancel_at` is set to `now() + N months`, so customers are NEVER auto-renewed. They get T-30, T-7, and post-end reminder emails to renew opt-in.

Backend:

- New tables: `spot_subscriptions`, `subscription_issue_assignments`, `stripe_webhook_events` (global webhook dedup keyed on `event_id`).
- New routes in `artifacts/api-server/src/routes/subscriptions.ts` — public `/checkout/create-subscription-session` + `/checkout/subscription-confirm`, plus admin `/admin/subscriptions*` + `/admin/webhook-events` + `/admin/campaigns/:id/preCommitted`.
- Webhook handlers in `routes/webhooks.ts` now route on `metadata.kind=spot_subscription`. Single-issue path unchanged.
- Renewal scheduler in `lib/renewalScheduler.ts` runs every hour (immediately on boot) and fires Resend emails at the T-30, T-7, and post-end milestones.
- Issues are counted as fulfilled ONLY when the admin completes the campaign (single GROUP BY on assignments; never stored on the subscription row).

Admin:

- `/admin/subscriptions` — list, MRR widget, reconcile-with-Stripe button, cancel button, last 50 webhook events.
- Dashboard link: **🔁 Subscriptions**.

Optional Stripe setup (for prettier Dashboard reporting only — runtime uses inline `price_data`):

```bash
pnpm --filter @workspace/scripts run provision-stripe-prices
```

Test plan: see `artifacts/api-server/docs/SUBSCRIPTIONS_TEST_PLAN.md`.

### Deploy checklist additions

- Confirm `STRIPE_WEBHOOK_SECRET` is set so the webhook dedup table actually receives events.
- Confirm `APP_URL` (or `PUBLIC_APP_URL`) is set so Stripe Checkout `success_url` resolves to your real domain.
- After first deploy, hit `/admin/subscriptions` once to verify MRR card and webhook events are populating.

## Database Schema

- `campaigns` — id, name, territory, zip_code, mail_date, homes_count, status
- `spots` — id, campaign_id, **side** (front|back, default front), size, grid_area, price, status, business_name, business_category, contact_email, contact_phone, website, ad_file_url, ad_status, **tracking_code** (unique, nullable; populated when status → paid), **expires_at** (timestamptz, nullable; set to NOW()+30min on reserve, cleared on paid/cleanup)
- `orders` — id, spot_id, stripe_payment_intent_id, amount_cents, status
- `qr_scans` — id, spot_id, campaign_id, scanned_at (default now), user_agent, ip_address, city — one row per QR scan recorded by `/go/:code`

## Postcard Layout

The postcard is 12"×9" landscape and has TWO sides, both sellable through the same picker, AdGenerator, and payment flow. The picker has a Front/Back toggle pill above the grid. Aspect ratio is locked via `padding-bottom: 75%` wrapper (not `aspect-ratio` CSS) to guarantee exact 12:9 at all viewports.

**Front side** — 7 spots, 100% paid coverage (no house ad):
- Top row: `mb` `dn` `re` — XL (4"×5", 400×500 natural px), each 4 cols × 5 rows.
- Bottom row: `l1` `l2` `l3` `l4` — Large portrait (3"×4", 300×400 natural px), each 3 cols × 4 rows.
- Grid: rows 1-5 = XL, rows 6-9 = Large portrait. All 108 cells covered (no house ad strip).

**Back side** — 8 spots: `bxl` `bxl2` `bxl3` (xl, $499 each — 3 columns of 4"×5", rows 1-5), `bm1` `bm2` `bm3` `bm4` (medium, $299 each — 4 columns of 3"×2", rows 6-7), `bs1` (small, $199, 2"×2", rows 8-9 cols 1-2). House-ad strip `bhs` (6"×2", rows 8-9 cols 3-8) and USPS EDDM block `bed` (4"×2", rows 8-9 cols 9-12) are non-sellable. Layout in `artifacts/localspot/src/postcardBack.jsx`.

**Medium and Small spots** are both 2"×2" (200×200 natural px). They differ only in price ($299 vs $199) and content density in the sample ads.

The print page (`/admin/campaign/:id/print`) renders both sides as separate print pages with `page-break-after: always` between them.

## Seed Data

Campaign 1 (Spring 2025) has 15 spots: 7 front + 8 back. Front: `mb` `re` paid; `dn` `l1` `l2` `l3` `l4` available. Back: `bxl` paid; `bxl2` `bxl3` `bm1` `bm2` `bm3` `bm4` `bs1` available. (Old spots `lw`/`a2` are orphaned DB rows — grid skips them via GRID_POSITIONS lookup.)

## Reservation Expiration

Unpaid reservations are held for **30 minutes**. After that they are released automatically so the spot doesn't sit blocked.

- `POST /api/spots/:id/reserve` sets `expires_at = NOW() + 30 min` on the spot row alongside the customer's business info.
- A periodic sweeper (`artifacts/api-server/src/lib/expirationCleanup.ts`) runs every 5 minutes (and once immediately on server boot) via `setInterval` registered in `index.ts`. It runs a single conditional UPDATE on rows where `status='reserved' AND expires_at < now()`, resetting them to `available` and clearing `business_name`, `business_category`, `contact_email`, `contact_phone`, `website`, `expires_at`. Idempotent and concurrency-safe.
- Stripe webhook listens for `checkout.session.expired` and calls `releaseReservedSpot(spotId)` to free the spot immediately rather than waiting for the next sweep tick. Acts only if the spot is still in `reserved` status (paid spots are never reset).
- On payment success (both webhook + `/checkout/confirm`), `expires_at` is set to NULL alongside `status='paid'` so the sweeper never looks at a paid row.
- Frontend (`artifacts/localspot/src/components/ReservationCountdown.jsx`) displays a live "⏱️ This spot is held for you for M:SS" banner above the Pay button on `/checkout/:spotId`, fed by the spot's `expiresAt` field. The banner flips to amber under 5 min, and on expiry it clears the customer's localStorage entry and redirects them back to the picker. The picker also shows a "Resume checkout for <business>" banner if the customer comes back to `/` while their hold is still active (state stored in `localStorage` under `localspot:reservation:<spotId>`).

## QR Code Tracking

Every paid spot is automatically issued a URL-safe slug `tracking_code` (e.g. `romas-pizza-spring2026`) by the Stripe webhook (and idempotently by the synchronous `/checkout/confirm` path). The frontend's `qrUtils.jsx` builds QR codes pointing to `https://<host>/go/<code>`.

- `GET /go/:code` (api-server, mounted at app root via the `/go` path in `artifact.toml`) — looks up the spot by tracking_code, fire-and-forget inserts a row into `qr_scans` (user-agent, IP from `X-Forwarded-For` via `app.set("trust proxy", true)`), then 302-redirects to `normalizeWebsite(spot.website)` (or `/` if no website is stored). Unknown codes return 404.
- `GET /api/admin/scans` (admin auth) — per-spot aggregate: `totalScans`, `scansLast7Days`, `scansLast30Days`, `lastScannedAt` (only includes spots that have a tracking_code).
- Spot API responses (active campaign, GET spot, admin campaign) now include `trackingCode` and `scanCount` for the frontend.

## Routes

### Frontend (Wouter)
- `/` — PostcardSpotPicker (live postcard grid)
- `/checkout/:spotId` — Stripe payment
- `/upload/:spotId` — Ad file upload / design request
- `/confirmation` — Order confirmation
- `/admin` — Admin dashboard (JWT protected)
- `/go/:code` — QR redirect (handled by api-server, not the frontend)

### Backend (Express, all under `/api`)
- `GET /api/campaigns/active`
- `POST /api/spots/:id/reserve`
- `POST /api/spots/:id/upload-ad`
- `POST /api/checkout/create-payment-intent`
- `POST /api/checkout/confirm`
- `POST /api/admin/login`
- `GET /api/admin/campaign`
- `POST /api/admin/spots/:id/approve`

## Admin Access

- URL: `/admin`
- Default password: `localspot-admin-2025` (set `ADMIN_PASSWORD` secret to change)
