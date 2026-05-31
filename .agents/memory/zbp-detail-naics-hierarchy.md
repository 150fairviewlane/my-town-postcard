---
name: ZBP detail NAICS hierarchy trap
description: zbp22detail.txt contains 5 levels of NAICS rollups per ZIP — must filter to 6-digit leaf codes only to avoid 5x double-counting.
---

## The rule

When reading `zbp22detail.txt` (Census ZBP detail file), only keep rows where the `naics` field is exactly 6 decimal digits (no dashes or slashes). All other rows are hierarchical rollup aggregates that represent the same underlying establishments.

## Why

The file contains 5 NAICS levels for every ZIP × sector combination:
- `NN----` — 2-digit sector total
- `NNN///` — 3-digit subsector total
- `NNNN//` — 4-digit industry group total
- `NNNNN/` — 5-digit industry total
- `NNNNNN` — 6-digit specific industry (leaf — count these only)

If you accept all levels, each establishment is counted ~5x. First attempt at filtering sectors 44-45/52-53/62/71/72/81 + contractor prefixes produced counts like 9,177 for ZIP 29464 (Mt Pleasant). After restricting to 6-digit codes only: 1,805 — the correct leaf count.

## How to apply

In the Python filter script (or any reader):
```python
def is_postcard_6digit(naics: str) -> bool:
    if len(naics) != 6 or not naics.isdigit():
        return False
    sector = naics[:2]
    if sector in POSTCARD_SECTORS:
        return True
    if naics in CONTRACTOR_6DIGIT:
        return True
    return False
```

The check `naics.isdigit()` rejects dashes and slashes in one shot.

## File locations

- Raw source: `artifacts/api-server/src/data/zbp22detail.txt` (275 MB, gitignored)
- Filtered output: `artifacts/api-server/src/data/zbp-postcard.csv` (7.2 MB, committed)
  - 495,023 rows across 20,998 ZIPs
- Re-download source: `https://www2.census.gov/programs-surveys/cbp/datasets/2022/zbp22detail.zip`
