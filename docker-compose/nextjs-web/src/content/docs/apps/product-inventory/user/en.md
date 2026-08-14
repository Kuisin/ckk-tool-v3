# Product Inventory (製品在庫) — User Manual

Operation code **PD04**. A ledger for checking finished and semi-finished product stock, plus work-in-progress quantities currently in production.

> This app is currently available **in the development (dev) environment only**. Screens and steps may change before the production release.

## What you can do with this app

Product inventory is a **read-only** screen. You never edit quantities here directly — stock moves automatically with business operations.

- **Stock-in** … When all steps of a [work order (指示書)](/docs/apps/work-order/user) are complete, the good pieces are stocked under the lot number. Amounts routed to semi-finished are stocked as semi-finished inventory.
- **Reservation** … Running the stock check on a sales order (注文請書) reserves available stock for that order.
- **Stock-out / release** … Shipping via a [shipping order (出荷書)](/docs/apps/shipping-order/user) issues the stock and releases the reservation.

## Reading the list

A switch at the top of the list toggles between two views: **product stock** and **work in progress (仕掛品)**.

**Product stock** … One row = product × plant × lot.

- Columns: **product** (name + product code), **plant**, **lot**, **quantity**, **reserved**, **available** (quantity − reserved), **kind** (finished / semi-finished), and **updated at**.
- Search by product name or code, and filter by **plant** and **kind**.
- Click a row to open the detail screen.

**Work in progress** … The number of pieces currently on the process steps, computed from in-progress work orders (no inventory records exist — real stock only moves when all steps complete).

- Grouped by product, showing **work order number, step, and WIP quantity**.
- Clicking a work order number navigates to the work order detail.

## Detail screen

- Summary … product, plant, lot, kind, quantity, reserved, available, and storage location. For semi-finished stock, the **originating step** (which work order and step it came from) is also shown.
- **Reservations** tab … The list of reservations against this inventory row. Status moves through **予約中 (reserved)** (in production / after stock check) → **確定 (confirmed)** (when all steps complete) → **解除 (released)** (on shipping or cancellation). Related sales order and work order numbers are shown.
- **Transaction history** tab … Every stock movement. Types are **入庫 (in) / 出庫 (out) / 予約 (reserve) / 解除 (release) / 調整 (adjust)**, with timestamp, quantity, reference (shipping number or work order number), and notes.

## FAQ

**Q. I want to correct a quantity by hand.** — Editing is not possible from this screen. Discrepancies need an inventory-adjustment handled on the administrator side.

**Q. Available is 0 but quantity is not.** — That stock is reserved for other orders. The reservations tab shows which sales orders it is allocated to.

Using this app requires the inventory (inventory) permission. Material stock is checked in [Material Inventory](/docs/apps/material-inventory/user) (PD05).
