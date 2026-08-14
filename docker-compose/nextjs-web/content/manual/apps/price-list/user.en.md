---
title: "Price List — User Manual"
description: "Operation code SA01. Manages per-customer product prices. Quote prices resolve automatically from here."
screenshots: [price-list-list-01, price-list-detail-01, price-list-discounts-01, price-list-edit-01]
---
Operation code **SA01**. Manages per-customer product prices. Quote prices resolve automatically from here.

## What you can do here

A ledger of **selling prices** — "this [product](/manual/en/masters/product/user) costs this much for this [customer](/manual/en/masters/customer/user)". Once registered, unit prices and discounts fill in automatically when creating a [quote](/manual/en/apps/quote/user) (there is no manual price entry on the quote side).

- The base unit price is usually taken from a **confirmed trial estimate (SA05)** linked to the product (manual entry is also possible — with confirmation).
- One price list (customer × product) holds **per-order-type prices** and **quantity tiers (quantity range → multiplier)** for volume pricing.
- Register **discount rules** (period and quantity conditions) and they apply automatically when a quote is created.
- The **validity period** is set per variant (order type). An end date is required for Test and Sample.

![Price list](../../assets/screenshots/price-list-list-01.png)

## Price list entries

1 entry = **customer + product** (unchangeable after creation; only one entry per combination). Per-order-type prices (Production / Test / Sample / Other) are held as **variants** inside the entry.

- Each variant has a **base unit price**, **validity period**, active flag, and an estimate link (price source).
- **Quantity tiers**: a multiplier per quantity range (e.g. 1–49 = ×1.05, 50–99 = ×1.00, 100+ = ×0.95). Tier price = base unit price × multiplier. A tier can also be overridden with a fixed manual price (with confirmation — the adopted price shows "manual").

![Price list detail (pricing tab)](../../assets/screenshots/price-list-detail-01.png)

## Creating

1. From **New** in the list, choose the **customer and product**. If a price list for the same customer × product already exists, a warning is shown (edit the existing one; saving also fails with a duplicate error).
2. Set prices per order type. If the product has a **linked confirmed estimate (SA05)**, you can select it as the **price source** and its quoted unit price fills the base price (recommended).
3. Without an estimate — or to use a different price — check **Use custom price** and set the base price manually (with confirmation).
4. Set the **valid-from date**. For Test and Sample the **valid-until date is also required**.
5. **Add order type** adds another variant to the same entry.
6. Saving with an estimate as the source locks that estimate as **REGISTERED**.

## Editing & discount rules

- Detail → **Edit** lets you add/remove order types and change base prices (only when custom), validity periods, and quantity tiers. The order type and price source of a saved variant cannot be changed.

![Price list edit form](../../assets/screenshots/price-list-edit-01.png)

- **Discount rules** are registered per order type on the detail page's **Discounts** tab. Set the name, type (rate % / amount ¥ per piece), quantity conditions, and validity period; matching rules apply automatically when quotes are created (when several match, the one with the largest discount wins).

![Discounts tab](../../assets/screenshots/price-list-discounts-01.png)

## List, search & other actions

- Search by customer/product; filter by customer, product, and order type. 1 row = customer × product (order types as badges, price shown as a range, plus estimate source, discount count, and validity columns).
- The row menu offers **Create quote** (drafts a quote from this price list), **Duplicate with new validity**, **Copy to another customer/product** (estimate links are dropped — becomes manual), and **Delete**.
- Select rows for bulk **Activate / Deactivate / Delete**.
- The detail **Related** tab shows the source estimates and the quotes created from this price list.
