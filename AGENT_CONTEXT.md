# AGENT_CONTEXT.md — My Town Postcard

> Read this file before beginning any task. It describes the full project
> architecture, business model, key decisions, and known patterns so you
> spend less time exploring and more time building.

-----

## 1. WHAT THIS PROJECT IS

**My Town Postcard** is a self-serve EDDM (Every Door Direct Mail) co-op
postcard SaaS. Local businesses buy ad spots on shared 12×9 landscape
postcards mailed to 5,000 homes via USPS. Independent dealers sell ad
space locally and earn commission. The platform handles technology,
printing, payment processing, and fulfillment.

**Live URL:** the Replit deployment URL (picard.replit.dev)
**Stack:** TypeScript monorepo, Express backend (api-server), React
frontend (localspot), PostgreSQL via Drizzle ORM, Stripe payments,
xAI Grok image generation, Resend email.

-----

## 2. MONOREPO STRUCTURE

```
/
├── apps/
│   ├── api-server/          # Express backend (port 8080)
│   │   ├── src/
│   │   │   ├── routes/      # All API route handlers
│   │   │   │   ├── dealers.ts        # Dealer auth + territory
│   │   │   │   ├── adGenGrok.ts      # AI ad generator endpoint
│   │   │   │   ├── campaigns.ts      # Campaign/spot management
│   │   │   │   └── territory*.ts     # Territory finder logic
│   │   │   ├── lib/
│   │   │   │   ├── buildAdPrompt.ts  # Grok prompt builder
│   │   │   │   ├── territoryBuilder.ts # Territory clustering
│   │   │   │   └── censusApi.ts      # ZIP/county data
│   │   │   └── middleware/
│   │   │       └── requireDealerAuth.ts # JWT auth middleware
│   │   ├── attached_assets/ # Template PNG reference images
│   │   └── artifact.toml    # Replit reverse proxy config
│   └── localspot/           # React frontend (Vite, port 5173)
│       ├── src/
│       │   ├── components/  # Shared UI components
│       │   ├── pages/       # Route pages
│       │   │   ├── PostcardPickerSection  # The spot picker UI
│       │   │   ├── DealerDashboard.tsx
│       │   │   ├── DealerLogin.tsx
│       │   │   └── DealerSignup.tsx
│       │   └── App.tsx
│       └── index.html
├── packages/
│   └── db/                  # Drizzle schema + client
│       └── src/schema.ts    # All table definitions
└── pnpm-workspace.yaml
```

-----

## 3. BUSINESS MODEL & PRICING

### Ad Spot Pricing

|Size|Dimensions|Price|
|----|----------|-----|
|XL  |4″×5″     |$499 |
|L   |4″×3″     |$399 |
|M   |3″×2″     |$299 |
|S   |2″×2″     |$199 |

### Dealer Program

- **Setup fee:** $99 one-time
- **Monthly fee:** $99/month
- **Commission:** 70% of net profit per campaign
- **Territory:** 4 distinct postcard zones per dealer
- **Net profit** = gross ad sales − print (~$350) − postage (~$1,235)

### Campaign Revenue (full sell-through)

- Front side: 3×XL + 4×L = $2,793
- Back side: 3×XL + 4×M + 1×S = $2,892
- **Total per campaign: ~$5,685**

-----

## 4. POSTCARD LAYOUT (CRITICAL — DO NOT CHANGE)

### Card Dimensions

- **Physical:** 12″ × 9″ landscape
- **Pixel canvas:** 1200px × 900px (100px/inch)
- **Gray border system:** `boxShadow: "0 0 0 7px #c8c8c8"` with
  ScaledCell offset +3.5px and dimension shrink −7px = equal 7px gaps
  between and around all ads.

### Front Side (CONFIRMED FINAL — DO NOT CHANGE)

```
3 XL (4″×5″) across top row:   x=0,y=0   x=400,y=0  x=800,y=0
4 L  (4″×3″) across bottom row: x=0,y=500 x=300,y=500 x=600,y=500 x=900,y=500
```

Note: Front Large ads are **portrait** (3″×4″ = 300×400px), NOT landscape.

### Back Side (Config 1 — CONFIRMED FINAL — DO NOT CHANGE)

```
3 XL (4″×5″):  x=0,y=0   x=400,y=0  x=800,y=0
4 M  (3″×2″):  x=0,y=500 x=300,y=500 x=600,y=500 x=900,y=500
1 S  (2″×2″):  x=0,y=700
House Ad:       x=200,y=700 w=600,h=200
EDDM Indicia:   x=800,y=700 w=400,h=200  ← bottom-right, legally required
```

-----

## 5. AD GENERATOR (Grok AI)

### How It Works

The ad generator (`adGenGrok.ts`) sends a reference template PNG image +
a detailed text prompt to xAI’s `/v1/images/edits` endpoint. Grok
composites the business content into the template layout.

### Templates (11 real + Surprise Me)

Each template has a portrait PNG and a landscape PNG in `attached_assets/`.

|Key                |Name                                    |
|-------------------|----------------------------------------|
|`parchment-classic`|Parchment Classic                       |
|`made-fresh`       |Made Fresh                              |
|`health-wellness`  |Health & Wellness                       |
|`at-your-service`  |At Your Service                         |
|`neighborhood-pro` |Neighborhood Pro                        |
|`home-elegance`    |Home Elegance                           |
|`sage-organic`     |Sage Organic                            |
|`purple-sage`      |Purple Sage                             |
|`brush-stroke`     |Brush Stroke                            |
|`heritage-home`    |Heritage Home                           |
|`wok-fire`         |Wok Fire                                |
|`surprise-me`      |Surprise Me (picks random real template)|

### Surprise Me — Critical Notes

- Resolves to a random real template BEFORE building `refLines` and
  `outputRequirements`. If resolution happens after prompt building,
  Grok gets a mismatched template image + wrong prompt = bad output.
- Store `const isSurpriseMe = (originalTemplate === "surprise-me")`
  before resolution to apply visual variations later.
- Three variations applied only when `isSurpriseMe`:
1. Font swap: slab serif ↔ geometric sans-serif in headline rule
1. Accent color on coupon box instead of primary color
1. Coupon style swap: dashed ↔ solid filled block
- Template IMAGE 1 descriptions must NOT describe hero photo content
  (e.g. “tool belt”, “wok flames”) — only zone shape/position/blending.
  Industry-appropriate photos come from `ipc.hero` in outputRequirements.

### Ad Spot Sizes → Grok Aspect Ratios

|Spot|Aspect|Crop (px)|
|----|------|---------|
|XL  |3:4   |1200×1500|
|L   |3:4   |900×1200 |
|M   |3:2   |900×600  |
|S   |1:1   |600×600  |

### Opening the Generator

Use a named window target so returning users focus the existing tab:

```js
const tab = window.open(url, 'mytown_ad_generator');
if (tab) tab.focus();
```

-----

## 6. TERRITORY SYSTEM

### Data Files

- `zip-centroids.csv` — ZIP lat/lng centroids (all US ZIPs)
- `zip-county.csv` — ZIP → county FIPS mapping
- `us-cities.csv` / Census Gazetteer — city lat/lng + population

### Known Issues & Fixes Applied

- **203 Atlanta-metro ZIPs** missing from `zip-county.csv` (USPS labels
  suburbs like Dunwoody/Sandy Springs/Norcross as “Atlanta”). Fixed by
  backfilling from `zip-centroids.csv`’s county column at startup in
  `censusApi.ts`.
- **Resilience:** `getCountyTerritoryHubs` must NOT bail on null
  `homeGeoid` — fall back to radius search instead of returning `[]`.
- **Seed city always Zone 1** — the entered city must be pinned as the
  first zone before clustering runs.
- **Sort by distance, not population** — prevents metro cores from
  dominating suburban territories.
- **Hub minimum threshold** — cities need enough households in their own
  ZIP footprint to qualify as hubs. Berkeley Lake GA (pop ~600) was
  passing because it inherited Duluth’s businesses via shared ZIP 30096.
  Fix: `getCityZipBusinessCount(city, state) >= 1` as a hard filter in
  `getCountyTerritoryHubs`.
- **Map polygon bleed** — ZIP polygons extend into neighboring counties.
  Fix: exclude ZIPs whose centroid is outside the territory’s county
  before drawing the map shading.

### Territory Algorithm Flow

1. Geocode seed city → lat/lng
1. Pin seed city as Zone 1
1. Find candidate hubs within 15-mile radius (expand 5mi if < 3 found)
1. Filter: `localBiz >= COUNTY_MIN_LOCAL_BIZ` AND
   `getCityZipBusinessCount >= 1`
1. Sort by distance (ascending), county proximity weight applied:
   same county ×0.7, adjacent ×0.85, other ×1.0
1. Return top 3 as Zones 2-4

-----

## 7. DEALER AUTHENTICATION

### Architecture

- **JWT tokens** in httpOnly cookies (7-day expiry)
- **“Remember me”** = session cookie if unchecked
- **Password hashing:** bcrypt
- **CSRF:** double-submit cookie pattern — `dealer_csrf` (non-httpOnly)
  cookie + `X-CSRF-Token` header on all auth mutations
- **Rate limiting:** 10 req/min login, 3 req/min forgot-password
- **Account lockout:** 5 failed attempts → locked 10 minutes

### Key Routes (all under `/api/dealers/`)

|Method|Path              |Purpose                          |
|------|------------------|---------------------------------|
|POST  |`/signup`         |Create dealer + hash password    |
|POST  |`/login`          |Authenticate + set JWT cookie    |
|POST  |`/logout`         |Clear JWT cookie                 |
|POST  |`/forgot-password`|Send reset email                 |
|POST  |`/reset-password` |Validate token + set new password|
|GET   |`/me`             |Get current dealer profile       |

### Middleware

`requireDealerAuth` — validates JWT on every `/dealer/*` route.
On invalid/expired token: clear cookie + redirect with `?reason=session_expired`.

### Database Tables

- `dealers` — id, name, email, password_hash, last_login_at,
  failed_login_attempts, locked_until, setup_fee_paid, subscription_active
- `dealer_password_resets` — id, dealer_id, token_hash, expires_at, used_at
- `dealer_sessions` — id, dealer_id, token_hash, expires_at (if stateful)
- `admin_actions` — id, admin_id, action, target_dealer_id, timestamp

### Password Rules

- Min 8 chars, 1 number, 1 special character
- Validated on both client AND server
- `confirmPassword` checked server-side in both creation routes
- Never stored plain text, never passed in URL params (use sessionStorage)

-----

## 8. DATABASE SCHEMA (KEY TABLES)

```sql
campaigns        -- id, side (front/back), status, dealer_id
spots            -- id, campaign_id, side, size, status, template_data (jsonb),
                    price, business_name, industry
territories      -- id, dealer_id, territory_name, status, created_at
territory_zones  -- id, territory_id, zone_number, city, state, zip_codes[]
dealers          -- see section 7
```

**Important:** `template_data` is jsonb and stores the full Grok form
data including `finishedAdUrl`. If a spot is reset to `available`, clear
`template_data` too or the UI will show it as filled.

-----

## 9. COMMON PATTERNS & GOTCHAS

### API Response Caching

The browser caches `GET /api/campaigns/active` aggressively. After DB
changes, clients may get 304s with stale data. Add cache-busting headers
or force a fresh fetch when needed.

### Reverse Proxy (artifact.toml)

Only specific paths should route to the api-server. `/dealer` (the SPA
routes) must NOT be in api-server paths — they should fall through to
Vite/the React frontend. Only `/api/*` and specific non-SPA server routes
like `/dealer/claim-territory` belong in api-server paths.

### Template PNG Files

All template reference images live in `attached_assets/`. Both portrait
and landscape variants exist for every template. The file map in
`adGenGrok.ts` maps template keys to filenames — keep both maps in sync.

### Prompt Byte Limit

xAI enforces an 8,000-byte hard limit on prompts. The code uses
`Buffer.byteLength(s, 'utf8')` (not `.length`) and trims menu items
progressively if over limit. Multi-byte UTF-8 chars inflate byte count.

### Industries (38 total)

The industry select in the ad generator has 38 options. Each industry
has default tagline, menu items, and offer text pre-populated. The image
library (`/api/image-library?industry=`) returns approved Unsplash photos.

### QR Codes

Generated via `api.qrserver.com`. `showLabel={false}` on all QR
components. Size varies by ad size (XL: 54px, L: 46px, M: 34px).

-----

## 10. ACTIVE KNOWN ISSUES (as of last session)

1. **Surprise Me photo bleed** — heritage-home, wok-fire, brush-stroke,
   at-your-service template IMAGE 1 descriptions contain content-specific
   photo descriptions that cause Grok to reproduce wrong imagery. Fix:
   strip content from hero photo zone descriptions in IMAGE 1 blocks,
   leave only zone shape/position/blending. (Issue #222 in progress)
1. **Territory map polygon bleed** — some ZIPs extend visually into
   neighboring counties (e.g. Vinings showing in Dunwoody territory).
   Fix: exclude ZIPs whose centroid is outside territory counties from
   map rendering.
1. **Back-side spot reservation** — stale `template_data` with
   `finishedAdUrl` on a reset spot causes UI to show it as filled.
   Fix: always clear `template_data` when resetting a spot to available.

-----

## 11. DEPLOY & WORKFLOW

- **Run:** `pnpm dev` starts both api-server and localspot concurrently
- **Typecheck:** `pnpm --filter @workspace/api-server tsc --noEmit`
- **Prompt size check:** `pnpm --filter @workspace/api-server run check:prompt-size`
  (must pass all 24 template×orientation checks before merging ad prompt changes)
- **DB migrations:** Drizzle — `pnpm db:push` to sync schema
- **Environment vars:** `XAI_API_KEY`, `STRIPE_SECRET_KEY`,
  `RESEND_API_KEY`, `JWT_SECRET`, `DATABASE_URL`

-----

## 12. STYLE CONVENTIONS

- TypeScript strict mode throughout
- Drizzle ORM for all DB queries — no raw SQL string concatenation
- Parameterized queries only
- `req.log` (pino) for server logging, not `console.log`
- React components in `.tsx`, utilities in `.ts`
- Tailwind for styling in the frontend where used
- All monetary values stored in cents as integers in the DB
- Dates stored as UTC timestamps

-----

*Last updated: June 2026*
*Primary dev environment: Replit*
*For questions about this file contact the project owner.*