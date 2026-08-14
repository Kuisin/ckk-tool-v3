---
title: "Price List — User Manual"
description: "Operation code SA01. Manages per-customer product unit prices. Quote prices are resolved automatically from here."
screenshots: []
---
Operation code **SA01**. Manages per-customer product unit prices. Quote prices are resolved automatically from here.

## What you can do here

A ledger of the **selling price** of each [product](/manual/en/masters/product/user) per [customer](/manual/en/masters/customer/user). Once registered, the unit price fills in automatically when you create a quote.

- Prices are usually taken from a **Trial Estimate (SA05)** linked to the product (manual entry is also possible).
- Within one price list (customer × product) you set **per-order-type prices** and **quantity tiers** (quantity → multiplier) so larger quantities are cheaper.

## Price-list entry

One entry = **customer + product** (immutable after creation). Prices per order type (production / test / sample / other) live inside the entry as **variants**.

- Each variant has its own **base unit price**, **validity period** (an end date is required for test/sample), status, and estimate link.
- **Quantity tiers**: a multiplier per quantity range (e.g. 1–99 pcs = ×1.05, 100+ pcs = ×1.00). Unit price = base price × multiplier (manual override per row is possible).

## How to create

1. From **New** in the list, choose the **customer and product**.
2. Set the price per order type. If the chosen product has **linked confirmed estimates (SA05)**, you can pick one as the **price source** — its estimate unit price becomes the base price (recommended).
3. Without an estimate, or to use a different price, a **manual base price** is possible (custom price with confirmation).
4. Using an estimate as the source locks it as used (REGISTERED).

## Adding / editing order-type variants

- On the detail screen → **Edit**, you can add/remove order types and change base prices, validity periods, and quantity tiers.
- Discount rules are registered per variant on the detail screen's **Discounts** tab.

## List & search

- Filter by customer, product, order type, and status. One row = customer × product (order types shown as badges).
- Only one price list may exist per customer × product; a duplicate is rejected (edit the existing one instead).
