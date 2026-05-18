---
name: invoice
description: Print-ready A4 invoice — number/dates, from/bill-to blocks, line-items table, tax breakdown, totals, payment instructions.
attribution:
  repo: nexu-io/html-anything
  license: Apache-2.0
  commit: b799c28
---

# Template: Invoice

Re-authored in English for faro from the structure of the upstream
`next/src/lib/templates/skills/invoice` brief (nexu-io/html-anything,
Apache-2.0, @b799c28). No upstream prose is copied. The shared anti-AI-slop
visual directives are prepended by faro's generation assembler — this brief
only adds the section map and the invoice-specific details.

## Intent

Produce a single-page, print-ready invoice with every standard accounting
element. Use the user's real parties, line items, currency, and tax rules.
Compute and show the arithmetic (subtotal → tax → total) from the line items
provided — do not invent amounts.

## Layout (top to bottom)

- **Header** — issuer wordmark, the word "Invoice", invoice number, issue date,
  due date.
- **From / Bill-to** — two address blocks side by side (seller / buyer,
  including tax IDs if supplied).
- **Line-items table** — description, quantity, unit price, line amount.
  Right-aligned numerics with tabular figures.
- **Totals** — right-aligned stack: subtotal, tax (with rate and base), any
  discount, then the grand total emphasized.
- **Payment instructions** — bank/transfer details, accepted methods, terms,
  and a short thank-you / notes line.

## Design details

- **Include print CSS** (`@media print`): A4 page box, no dark background in
  print (keep ink-economical, high-contrast black-on-white when printed even
  though screen view follows the dark default), avoid page-breaking a row.
- This is a financial document — precision over decoration. No charts, no
  marketing flourish, no accent gradients. A single thin rule and disciplined
  alignment carry the design.
- Currency symbol/code and tax rate are unambiguous and consistent. Totals
  reconcile exactly with the line items.
- Generous whitespace so it stays legible when printed or PDF'd.
