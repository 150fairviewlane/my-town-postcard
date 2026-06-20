---
name: Leaflet iOS tap fix
description: Why Leaflet marker pins require multiple taps on iPad/iOS and how to fix it.
---

## Rule
Never call `setIcon()` from `mouseover`/`mouseout` handlers on Leaflet markers. Remove those handlers entirely.

**Why:** iOS synthesizes mouse events as part of touch→click conversion:
`touchstart` → `touchend` → `mouseover` → `mousedown` → `mouseup` → `click`

When `mouseover` calls `setIcon()`, Leaflet removes the old icon DOM element and creates a new one (`_removeIcon` → re-append in `_initIcon`). By the time `click` fires, it targets the detached old element. iOS dispatches `click` to a detached node and the Leaflet event (navigate) silently drops. This causes 4-5 taps needed to navigate — the user gets lucky only when tap speed beats the synthetic mouseover timing.

Also set `tap: false` in `L.map()` options to disable Leaflet's tap simulation (fixes the separate 2-tap issue where the first tap just "focuses" the map).

**How to apply:** Any time a Leaflet marker has `mouseover`/`mouseout` handlers that replace the icon, strip them. Hover effects don't exist on touch and they actively break the click event chain on iOS.
