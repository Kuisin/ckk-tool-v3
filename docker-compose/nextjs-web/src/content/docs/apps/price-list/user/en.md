# Price List — User Manual

Operation code **SA01**. Manages per-customer product unit prices. Quote prices are resolved automatically from here.

## What you can do here

A ledger of the **selling price** of each [product](/docs/masters/product/user) per [customer](/docs/masters/customer/user). Once registered, the unit price fills in automatically when you create a quote.

- Prices are usually registered from a **Trial Estimate (SA05)** result (manual entry is also possible).
- You can set **quantity tiers** (quantity → unit price) so larger quantities are cheaper.
- You can set a **validity period**, and prices are managed for that period.

## Price-list entry

One entry = **customer + product + order type**, and holds:

- **Validity period** (valid_from / valid_until), currency, and status.
- **Quantity tiers**: a unit price per quantity range (e.g. 1–99 pcs = ¥250, 100+ pcs = ¥230).

Customer, product, and order type are the identity key and cannot be changed after creation.

## How to create

- **From an estimate**: confirm an estimate (SA05), then **Register to price list**. The cost-based unit price is applied (recommended).
- **Manually**: from **New** in the list, enter the customer, product, order type, validity, and tier prices directly.

## Editing quantity tiers

- Add and edit tiers on the detail screen. Each tier has a **minimum quantity** and a **unit price** (or multiplier).
- Tiers share the parent entry's validity period and currency.

## List & search

- Filter by customer, product, order type, validity, and status.
- Only one price list may exist per identity key; a duplicate is rejected (edit the existing one instead).
