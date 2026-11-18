# token-radar-01

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/dashaaa12/token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/dashaaa12/token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Token Launch Radar scans the frozen snapshot for protocols whose token does not exist yet — 198 pre-token protocols, the full 40-protocol house watchlist included — and ranks them by an implied value derived only from the snapshot's own figures: TVL multiplied by the median market-cap/TVL ratio of tokenized peers in the same category, adjusted for 7-day TVL momentum, protocol age and chain breadth. Every row carries a concrete farm plan (category playbook, chain-specific gas costs, TVL-tiered position sizes, weekly cadence, tracking and exit rules), and the static dashboard renders the board with search, category/chain filters, four sort orders, a watchlist toggle and a per-protocol detail view that shows exactly how each implied value is built.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input /input/snapshot.json
```

---

<sub>Entered on [make.fun](https://make.fun/?ref=y1enas6g&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
