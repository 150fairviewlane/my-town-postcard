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
- `spots` — id, campaign_id, size, grid_area, price, status, business_name, business_category, contact_email, contact_phone, ad_file_url, ad_status
- `orders` — id, spot_id, stripe_payment_intent_id, amount_cents, status

## Seed Data

Campaign 1 (Spring 2025) has 10 spots: 7 paid (demo businesses), 3 available (a1=medium $299, a2=small $199, a3=small $199).

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
