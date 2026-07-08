---
name: 100dvh section below a sticky header
description: A full-viewport-height (100dvh) section clips its own bottom content when a sticky/in-flow header sits above it and the section doesn't subtract the header's height.
---

A section styled `height: 100dvh` with `overflow: hidden` assumes it owns the
entire viewport height. If a header above it is `position: sticky` (or plain
in-flow), that header still reserves its normal box height in document flow —
so the 100dvh section's bottom edge overshoots the true remaining viewport
space by exactly the header's height, and its own overflow:hidden clips
whatever content falls past that edge.

**Why:** Discovered while fixing a mobile ad-picker: on short landscape phone
viewports (e.g. 844×390), a sticky nav bar (72–92px) sitting above a `100dvh`
picker section caused the bottom row of the picker grid to be invisibly
clipped, even though scrolling further would never reveal it (the section's
own box, not just viewport scroll position, was too short).

**How to apply:** Publish the header's actual height as a CSS custom property
(set it in a `useEffect` keyed on any responsive breakpoint state) and have
the section below size itself with `calc(100dvh - var(--header-h, <fallback>))`
instead of a bare `100dvh`. Do this whenever a full-viewport section sits below
any sticky/fixed/in-flow chrome, especially chrome whose height changes across
breakpoints.
