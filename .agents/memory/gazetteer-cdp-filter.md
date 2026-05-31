---
name: Gazetteer CDP filter
description: Census Gazetteer places must be filtered to FUNCSTAT∈{A,B} to avoid CDPs shadowing real cities as hub candidates.
---

The Census Gazetteer for Places (`gazetteer-places.txt`, column `FUNCSTAT` at index 5) classifies entries as:
- `A` — active incorporated place (city, town, village, borough)
- `B` — active consolidated government (e.g. Nashville-Davidson metropolitan government)
- `S` — statistical — Census Designated Place (CDP); **unincorporated**, no municipal government

**Why filtering matters:** CDPs (FUNCSTAT=S) include tiny unincorporated communities like "Ivy CDP" (population ~200) and "University of Virginia CDP". Because they are placed at precise coordinates close to urban cores, they rank higher than the actual incorporated city in nearest-neighbor hub selection. For example, ZIP 22901 (Charlottesville VA) picked "Ivy CDP" and "University of Virginia CDP" as its top hubs before filtering, burying "Charlottesville city" which was correctly at 5.7 miles.

**Fix:** In the Gazetteer loader (`censusApi.ts` loader #8), skip any row where `funcStat !== "A" && funcStat !== "B"`. This reduces loaded places from ~32k to ~19k (incorporated places only).

**How to apply:** Always apply this filter when loading Gazetteer places for hub selection. If small-town coverage becomes too sparse in a future scenario, reconsider adding back CDPs only as a fallback tier (with lower hub priority weight).
