# Material Inventory (素材在庫) — User Manual

Operation code **PD05**. A ledger for checking material stock and reservations, plus "when and how much will be available" (ATP) including scheduled receipts.

> This app is currently available **in the development (dev) environment only**. Screens and steps may change before the production release.

## What you can do with this app

Material inventory is a **read-only** screen. You never edit quantities here directly — stock moves automatically with business operations.

- **Stock-in** … Registering a receipt in [Material Receipt (素材入荷)](/docs/apps/material-receipt/user) (PU01) stocks the receiving factory's inventory.
- **Reservation** … When a manufacture-type [work order (指示書)](/docs/apps/work-order/user) is approved, its material is reserved for the planned quantity.
- **Consumption (stock-out)** … When all steps of the work order are complete, the reserved material is consumed.
- **Scheduled receipts** … Line items of ordered [material purchase orders (素材発注書)](/docs/apps/purchase-order/user) (status 発注済) provide the next receipt date and incoming quantities.

## Reading the list

One row = material × factory.

- Columns: **material** (material code + name), **factory**, **quantity** (with unit), **reserved**, **available** (quantity − reserved), **next receipt** (earliest expected date among ordered line items), and **updated at**.
- Search by material code or name, and filter by **factory**.
- Click a row to open the detail screen.

## Detail screen

The summary shows the material, factory, quantity, reserved, available, next receipt, and storage location.

**ATP timeline** tab … Starts from the currently available quantity and shows how availability accumulates at each scheduled receipt date.

- Columns: **point in time** (now → each expected receipt date; orders without a date show "未定" (undated)), **incoming quantity**, **available** (cumulative), and **reference** (purchase order number).
- Points where availability is negative are shown in red — reservations (production commitments) exceed on-hand plus scheduled receipts, a signal that purchasing is needed.

**Transaction history** tab … Every stock movement. Types are **入庫 (in) / 出庫 (out) / 予約 (reserve) / 解除 (release) / 調整 (adjust)**, with timestamp, quantity, reference (work order number, receipt, etc.), and notes.

## FAQ

**Q. Reserved is larger than quantity.** — That is not an error. Approving a work order reserves material even when stock is insufficient (a shortage is the signal to purchase). Check the ATP timeline to see whether scheduled receipts will cover it.

**Q. I want to correct a quantity by hand.** — Editing is not possible from this screen. Discrepancies need an inventory-adjustment handled on the administrator side.

Using this app requires the inventory (inventory) permission. Product stock is checked in [Product Inventory](/docs/apps/product-inventory/user) (PD04).
