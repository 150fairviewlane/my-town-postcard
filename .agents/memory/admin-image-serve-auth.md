---
name: Admin image serve — no auth for static assets
description: Browser img tags cannot send Bearer tokens; omit requireAdmin for file-serving routes
---

HTML `<img src="...">` elements issue plain GET requests with no custom headers.
The Express `requireAdmin` middleware checks `Authorization: Bearer <token>`, so any
image served through an auth-gated route will return 401 and fail to load in the browser.

**Rule:** Routes that serve static binary assets (PNG, JPEG) that are not sensitive must omit
`requireAdmin`. The filename whitelist regex (`/^[a-zA-Z0-9._\-{}]+\.(png|jpe?g)$/i`) and
`path.join` to a fixed directory are sufficient protection against path traversal.

**How to apply:**
- `GET /api/admin/template-image/:filename` — no auth, regex + fixed dir guard only.
- If you ever need auth on an image route, use a signed URL or a short-lived query-param
  token pattern instead of Bearer, since `<img>` cannot set headers.
