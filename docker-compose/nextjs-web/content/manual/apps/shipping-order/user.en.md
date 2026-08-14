---
title: "Shipping Order — User Manual"
description: "Operation code SH01. Create and manage shipping orders (出荷書, SHP-YYYYMM-NNNNN) that record product shipments based on…"
screenshots: []
---
Operation code **SH01**. Create and manage shipping orders (出荷書, SHP-YYYYMM-NNNNN) that record product shipments based on a sales order (注文請書).

> This app is currently available **in the development (dev) environment only**. Screens and steps may change before the production release.

## What you can do with this app

This is the ledger for the **shipping order (出荷書)** you create when finished products leave the plant. The shipping order is the starting point of billing: you create the [delivery note](/manual/en/apps/delivery-note/user) from it, and shipped dispatch orders are grouped into invoices by the [billing closing](/manual/en/apps/billing-closing/user).

- When you pick a sales order (注文請書), the line items are generated automatically from its completed [work orders](/manual/en/apps/work-order/user) (lots).
- Shipping deducts stock from [product inventory](/manual/en/apps/product-inventory/user) and automatically updates the sales order's shipping status (partially shipped / shipped).
- Using this app requires the shipping-order permission (shipping_order).

## Types: dispatch and stock storage

- **Dispatch (発送)**: a normal shipment sent to the customer. Shipping deducts inventory and the shipment becomes billable.
- **Stock storage (在庫保管)**: records spare production kept in stock instead of being sent out. It is outside the billing flow and does not change the sales order's shipping status. Completing the "ship" step adds the quantity to the storage plant's inventory.

## Creating a shipping order

1. Press **新規作成** (Create) on the list page.
2. Search for and select the **sales order (注文請書)**. One line item is generated per completed work order (lot = work order number, quantity = good-part count of the final process step).
3. Choose the **type** (dispatch / stock storage) and the **shipping plant**.
4. Line items (product, lot, quantity, notes) can be added, removed, and edited.
5. Saving registers the document as a **draft**. The sales order cannot be changed after creation.

## Statuses and actions

Actions are in the menu at the top right of the detail page. The status moves through three stages.

- **Draft (下書き / DRAFT)**: can be edited or **cancelled** (deleted). When ready, press **確定** (Confirm).
- **Confirmed (確定 / CONFIRMED)**: no longer editable; delivery notes can now be created. When the goods actually leave, press **出荷** (Ship).
- **Shipped (出荷済 / SHIPPED)**: the ship date is recorded, inventory is deducted, and the sales order's shipping status (partially shipped / shipped) is updated.

- A dispatch whose cumulative shipped quantity would exceed the ordered quantity is rejected (over-shipment guard).
- Shipping also fails if the shipping plant does not have enough stock — check inventory first.

## Working with delivery notes

- The **納品書** (Delivery notes) tab on the detail page lists the delivery notes created from this shipping order.
- After confirmation, use **納品書を作成** (Create delivery note) on the same tab to create a [delivery note](/manual/en/apps/delivery-note/user).

## List and search

- Search by shipping order number, sales order number, customer, or product; filter by type and status.
- Click a row to open the detail page.
