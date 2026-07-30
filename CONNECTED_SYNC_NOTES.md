# Taylor Scout Budget ↔ Bible Sync

## What is connected

- Bible reads the matching shared Budget page by `sharedLocationId`.
- Bible's locked amount is calculated from real Budget line items rather than hard-coded demo amounts.
- Bible saves structured commitments for each vendor order, including status, amount, PO number, vendor, budget section, and location ID.
- Budget reads the shared Bible document in real time.
- Budget shows total committed, remaining/over-budget variance, and section-level committed amounts.
- Only orders marked Ordered/Committed/Paid count toward Budget commitments.

## Deployment order

1. Deploy Budget v24.
2. Deploy Bible v17.
3. Open both from the same Taylor Scout show dashboard.
4. In Bible, update an order and mark it Ordered, then click Save.
5. Open or refresh Budget. The commitment should appear automatically.

No new SQL migration is required beyond the connected core already installed.
