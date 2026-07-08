---
name: visualViewport pinch-zoom vs ResizeObserver
description: Native pinch-to-zoom triggers ResizeObserver/visualViewport resize events too; naive resize-driven layout recompute fights the zoom and makes it look like pinching shrinks instead of magnifies.
---

Native pinch-zoom on mobile is a purely visual transform — it doesn't change
any CSS layout box's actual size — but browsers still fire
`ResizeObserver` callbacks and `visualViewport` `resize` events during the
gesture. If a component's `ResizeObserver` callback recomputes a `scale` or
`containerSize` state from `clientWidth`/`offsetWidth` on every tick, that
recompute races against and fights the native zoom, and the net visible effect
is the content appearing to shrink when the user pinches to zoom in.

**Why:** Found while fixing a mobile postcard picker where `maximum-scale=1`
in the viewport meta was blamed first (and did need fixing), but the deeper
cause was the component's own resize-driven layout state fighting the
zoom transform on every ResizeObserver tick.

**How to apply:** Inside the `ResizeObserver`/resize callback, check
`window.visualViewport?.scale` and skip the recompute when
`Math.abs(scale - 1) > ~0.05` (i.e., the user is actively zoomed in). Also
listen to `visualViewport`'s own `resize` event (not just `ResizeObserver`) so
the check re-fires as the gesture progresses and the state resettles once the
user releases and scale returns to 1. Pair with viewport meta
`maximum-scale` set high enough (e.g. `5.0`) to actually allow native zoom.
