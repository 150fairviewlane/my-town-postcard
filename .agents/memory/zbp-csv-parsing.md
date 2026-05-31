---
name: ZBP CSV parsing quirk
description: zbp22totals.txt has mixed quoting — the name field "CITY, STATE" contains an embedded comma that breaks naïve split(",").
---

`artifacts/api-server/src/data/zbp22totals.txt` (ZIP Business Patterns 2022) uses **mixed quoting**: string fields like `"zip"`, `"name"`, `"city"` are double-quoted; numeric fields like `emp`, `qp1`, `ap`, `est` are **bare** (no quotes). The `name` field always contains an embedded comma in the format `"CITY, STATE"`.

**Why naïve `split(",")` fails:** `"22901","CHARLOTTESVILLE, VA","G",18354,...` produces 13 tokens instead of 12, shifting every column after `name` by one. `est` at expected index 8 becomes the `ap` (annual payroll) field — a number millions of times too large.

**Fix:** Use a proper RFC 4180 CSV parser (`parseZbpCsvLine` in `censusApi.ts`) that reads quoted fields (including embedded commas) and bare numeric fields correctly. After proper parsing, `est` is reliably at column index 8.

**How to apply:** Any future loader for ZBP or similarly mixed-quoting Census CSV files must use `parseZbpCsvLine` or an equivalent RFC 4180-aware parser — never a raw `line.split(",")`.
