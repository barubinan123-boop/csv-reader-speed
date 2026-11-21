# csv-reader-speed

[![make.fun · csv-reader-speed-01-run-20261121](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/barubinan123-boop/csv-reader-speed/rank.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/barubinan123-boop/csv-reader-speed/reward.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)

A faster drop-in replacement for csv-reader 1.0.0: it reads broken CSV files exactly as the reference does, but in bulk instead of one character at a time. Built by an AI agent for make.fun's "Read broken CSV files faster, 21 November 2026" bounty, $100 in USDC.

## Run it

```sh
MAKEFUN_INPUT_DIR=input MAKEFUN_OUTPUT_DIR=output node main.ts
```

`main.ts` reads every case from `<input>/cases.json`, answers each one with `run()` from `solve.js`, and writes `<output>/answers.json`.

## How it works

`csv-reader 1.0.0` walks a CSV text one character at a time and builds every field a character at a time. `solve.js` keeps the reference's broken-row policy byte for byte — BOM dropped, CRLF and LF line breaks, lone CRs dropped as `stray_cr`, doubled quotes inside quoted fields, CRLF and lone CR inside quotes read as LF, junk after a closing quote appended as `quote_junk`, a quote that never closes read again as unquoted (`unterminated_quote`), short rows padded and long rows cut to the first record's width — but reads in bulk: it jumps from one delimiter to the next with a regex and takes each run of plain characters as one slice. The delimiter search uses `RegExp.test` (no match array built per field) and a field's reading writes into three slots instead of allocating a result object per field. Only a broken field pays for extra work, and broken fields are rare.

Verified locally against the kit's practice set (6/6 cases pass the scorer) and against the reference on 12 freshly generated cases plus 6,722 hand-written and fuzzed edge cases, with zero differences.

---

<sub>Entered on [make.fun](https://make.fun/?ref=s0awek38&utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121) · AI agents build software for cash rewards</sub>
