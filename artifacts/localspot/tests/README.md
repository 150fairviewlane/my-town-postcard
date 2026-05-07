# Ad Visual Regression Tests

Automated Playwright suite that screenshots every (fixture × template × size)
combination of the ad generator and asserts no layout overflow / out-of-bounds
elements / broken images.

**Total cases:** 12 fixtures × 5 templates × 4 sizes = **240 tests**.

## How it works

1. **Test render route** — `/test/ad?template=<id>&size=<XL|L|M|S>&fixture=<id>`
   is a hidden React page (`src/pages/TestAdPage.jsx`) that renders one template
   at its natural pixel dimensions inside `#ad-container`. It sets
   `body[data-ready="1"]` once all fonts + images have loaded.

2. **Fixtures** — `src/testFixtures.js` defines 12 deterministic test cases
   covering: baseline, long headline, long business name, missing logo, oversized
   logo, missing photo, no website (no QR), with website (QR), short phone,
   missing tagline, long offer, long address. Images are inlined SVG data URLs
   so baselines aren't affected by Unsplash CDN drift.

3. **Spec** — `tests/ad-visual.spec.ts` loops fixtures × templates × sizes,
   takes a screenshot of `#ad-container`, and compares to the baseline. It also
   walks the DOM and asserts: no element escapes the container bounds, no text
   has horizontal overflow, every `<img>` loaded successfully.

4. **Baselines** — first run creates `tests/screenshots/<name>.png`.
   Re-runs compare against those baselines (≤2% diff pixel ratio allowed).
   Playwright's transient outputs (traces, failure screenshots, HTML report) are
   written to `/tmp/playwright-{results,report}-localspot/` — **not** under
   `artifacts/localspot/`, because Vite watches that whole tree and would
   trigger HMR page reloads mid-test.

## First-time baseline generation

The repo only ships a small set of seed baselines. On a fresh checkout, run:

```bash
pnpm test:ads:update     # generates all 240 baselines (~10–15 min on Replit)
git add artifacts/localspot/tests/screenshots
```

Subsequent runs (`pnpm test:ads`) compare against those baselines. Re-run
`pnpm test:ads:update` whenever you intentionally change a template's design.

## Running

The localspot dev server must be running (it normally is via the Replit
`artifacts/localspot: web` workflow). Then from the repo root:

```bash
# First-time only: download the Chromium browser binary (~130MB).
pnpm --filter @workspace/localspot exec playwright install chromium

# Run the full suite.
pnpm test:ads

# Run only one fixture / template:
pnpm --filter @workspace/localspot exec playwright test -g "baseline-photo-bold"

# Update baselines after an intentional design change:
pnpm --filter @workspace/localspot exec playwright test --update-snapshots

# Debug mode — opens a headed browser, pauses on each step:
pnpm --filter @workspace/localspot exec playwright test --debug

# View the HTML report after a run:
pnpm --filter @workspace/localspot exec playwright show-report tests/report
```

If the Replit env can't run a headed browser, `--debug` may fail; use
`PWDEBUG=1` or open `tests/report/index.html` after a run instead.

## Pointing at a different host

By default tests hit `http://localhost:80` (the Replit shared proxy that routes
to the localspot dev server). To target a different URL:

```bash
PLAYWRIGHT_BASE_URL=https://your-domain.replit.app pnpm test:ads
```

## Adding a new fixture

Edit `src/testFixtures.js` and add an entry to `FIXTURES`. The fixture key
becomes part of the test name and the screenshot filename. After adding,
run with `--update-snapshots` once to create the new baselines.
