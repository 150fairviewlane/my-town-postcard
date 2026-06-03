---
name: territory-finder toast vs modal classes
description: The find-territory page uses two different show-classes for toast vs modal — easy to mix up.
---

In `artifacts/api-server/src/public/territory-finder.html`:

- **Toast** (`#toast`) is shown/hidden via the CSS class `show` (`.toast.show`).
- **Modal backdrop** (`.modal-bg`) is shown/hidden via the CSS class `visible` (`.modal-bg.visible`).

**Why:** A rewrite once used `classList.add('visible')` on the toast, which silently no-ops because the CSS only animates `.toast.show`. Validation/error toasts then never appeared even though the JS ran.

**How to apply:** When touching feedback UI on this page, match the element's own CSS class — `show` for toast, `visible` for modal. Verify by triggering a validation error (e.g. `?zip=abc&city=x&state=TN`) and confirming the toast slides in.
