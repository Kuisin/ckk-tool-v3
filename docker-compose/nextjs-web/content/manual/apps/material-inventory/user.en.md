---
title: "Inventory (Materials & WIP) — User Manual"
description: "How to read the materials and WIP tabs of the Inventory app (PD04), including \"when and how much will be available\" (ATP)."
screenshots: [inventory-materials-01, inventory-wip-01]
---
How to read the **materials** and **WIP (仕掛品)** tabs of the [Inventory](/manual/en/apps/product-inventory/user) app (operation code **PD04**). Check material stock and reservations, plus "when and how much will be available" (ATP) including scheduled receipts.

> This app is currently available **in the development (dev) environment only**. Screens and steps may change before the production release.

## What this page covers

The former Material Inventory (PD05) app has been merged into the **Inventory** app — the old list URL redirects to the materials tab automatically. You never edit quantities here directly — stock moves automatically with business operations (the only write operation is the [stock transfer](/manual/en/apps/product-inventory/user)).

- **Stock-in** … Registering a receipt in [Material Receipt (素材入荷)](/manual/en/apps/material-receipt/user) (PU01) stocks the receiving plant's inventory.
- **Reservation** … When a manufacture-type [work order (指示書)](/manual/en/apps/work-order/user) is approved, its material is reserved for the planned quantity.
- **Consumption (stock-out)** … When all steps of the work order are complete, the reserved material is consumed.
- **Scheduled receipts** … Line items of ordered [material purchase orders (素材発注書)](/manual/en/apps/purchase-order/user) provide the next receipt date and incoming quantities.

## Materials tab

- Columns: **material** (material code + name), **plant**, **storage location**, **quantity** (with unit), **available**, **next receipt** (earliest expected date among ordered line items), **updated at**, and a **移動 (transfer)** row action.
- Search by material code or name, and filter by **plant**.
- Click a row to open the material inventory detail screen. The **transfer** button opens the stock transfer dialog (see the [stock transfer steps](/manual/en/apps/product-inventory/user)).

![Inventory materials tab — next-receipt column and storage locations](../../assets/screenshots/inventory-materials-01.png)

## WIP tab

The number of pieces currently on the process steps, computed per step from in-progress work orders (no inventory records exist — real stock only moves when all steps complete).

- Under a group row per product (total n), rows show the **work order number, step, and WIP quantity**.
- Clicking a work order number navigates to the work order detail.
- With no in-progress work orders, the tab shows "進行中の仕掛品はありません" (no work in progress).

![Inventory WIP tab — quantities per work order and step](../../assets/screenshots/inventory-wip-01.png)

## Material inventory detail screen

The summary shows the material, plant, quantity, reserved, available, next receipt, storage location, and notes.

**ATP timeline** tab … Starts from the currently available quantity and shows how availability accumulates at each scheduled receipt date.

- Columns: **point in time**, **incoming quantity**, **available** (cumulative), and **reference** (purchase order number).
- Points where availability is negative are shown in red — reservations (production commitments) exceed on-hand plus scheduled receipts, a signal that purchasing is needed.

**Transaction history** tab … Every stock movement. Types are **入庫 (in) / 出庫 (out) / 予約 (reserve) / 解除 (release) / 調整 (adjust)**, with timestamp, quantity, reference, and notes.

## FAQ

**Q. Reserved is larger than quantity.** — That is not an error. Approving a work order reserves material even when stock is insufficient (a shortage is the signal to purchase). Check the ATP timeline to see whether scheduled receipts will cover it.

**Q. I want to correct a quantity by hand.** — The only operation available here is the stock transfer (changing the location). Discrepancies need an inventory-adjustment handled on the administrator side.

Using this app requires the inventory (inventory) permission. For the products tab, locations tab, and stock transfer steps, see [Inventory](/manual/en/apps/product-inventory/user).
