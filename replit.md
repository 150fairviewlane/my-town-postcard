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

## Database Schema

- `campaigns` — id, name, territory, zip_code, mail_date, homes_count, status
- `spots` — id, campaign_id, **side** (front|back, default front), size, grid_area, price, status, business_name, business_category, contact_email, contact_phone, ad_file_url, ad_status
- `orders` — id, spot_id, stripe_payment_intent_id, amount_cents, status

## Postcard Layout

The postcard is 12"×9" landscape and has TWO sides, both sellable through the same picker, AdGenerator, and payment flow. The picker has a Front/Back toggle pill above the grid.

**Front side** — 9 spots: `mb` (xl, perpetual sponsor demo Mr. Biscuit's), `dn` `re` (xl), `hv` `ins` (large), `pz` `a1` (small), `lw` `a2` (medium), plus `hs` permanent house ad cell.

**Back side** — 7 spots: `bxl` (xl, $450), `bl1` `bl2` (large, $350), `bm1` `bm2` (medium, $250), `bs1` `bs2` (small, $199), plus three house-ad cells (`bhs` vertical, `bhr` row, `bhn` banner) and the non-sellable `ed` USPS EDDM block (4"×2" placeholder with PRESORTED STD indicia, ECRWSS, "Local Postal Customer" line, and barcode placeholder) in the bottom-right corner. Layout in `artifacts/localspot/src/postcardBack.jsx`.

The print page (`/admin/campaign/:id/print`) renders both sides as separate print pages with `page-break-after: always` between them.

## Seed Data

Campaign 1 (Spring 2025) has 16 spots: 9 front-side + 7 back-side. Front: 1 paid (Mr. Biscuit's, the `mb` perpetual sponsor demo) + 8 available. Back: all 7 available.

## Routes

### Frontend (Wouter)
- `/` — PostcardSpotPicker (live postcard grid)
- `/checkout/:spotId` — Stripe payment
- `/upload/:spotId` — Ad file upload / design request
- `/confirmation` — Order confirmation
- `/admin` — Admin dashboard (JWT protected)

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
