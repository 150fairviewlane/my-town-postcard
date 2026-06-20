---
name: County possessive naming rule
description: How multi-county territory names should be spelled in possessive form (hero headlines, etc.)
---

## Rule

When a territory name ends with "Counties" (plural), the possessive hero headline must use "County's" — never "Counties's".

**Example:** "White / Habersham Counties" → "White / Habersham County's"

**Why:** User explicitly requested this convention. "Counties's" is grammatically awkward; "County's" reads naturally as a collective possessive for multi-county territories.

**How to apply:**

- In `artifacts/localspot/src/pages/TerritoryLandingPage.tsx`, `buildCopy()`:
  ```ts
  countyPossessive: territory
    ? `${territory.replace(/\bCounties\b$/, "County")}'s`
    : DEFAULT_COPY.countyPossessive,
  ```
- When creating new campaigns whose territory field ends with "Counties", the regex handles it automatically.
- When naming territories in the DB or admin UI, do not pre-correct to "County" — let the display layer apply the rule so the stored name ("White / Habersham Counties") stays accurate for other uses.
