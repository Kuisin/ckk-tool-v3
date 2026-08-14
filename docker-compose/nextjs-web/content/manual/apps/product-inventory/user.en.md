---
title: "Inventory — User Manual"
description: "Operation code PD04. Check products, materials, WIP, and locations in one screen, and record stock transfers between storage locations."
screenshots: [inventory-products-01, inventory-locations-01]
---
Operation code **PD04**. Check products, materials, WIP, and locations in one screen, and record stock transfers between storage locations.

> This app is currently available **in the development (dev) environment only**. Screens and steps may change before the production release.

## What you can do with this app

The former Product Inventory (PD04) and Material Inventory (PD05) apps have been unified into a single **Inventory** app (the old list URLs redirect here automatically). The screen has four tabs.

- **製品 (Products)** … The finished / semi-finished product stock ledger (covered on this page).
- **素材 (Materials)** / **仕掛品 (WIP)** … Material stock (ATP) and in-production quantities. → [Inventory (Materials & WIP)](/manual/en/apps/material-inventory/user)
- **ロケーション (Locations)** … A plant → storage location → shelf view of "what is where" (covered on this page).

You never edit quantities here directly — stock moves automatically with business operations, and the only write operation on this screen is the **stock transfer**.

- **Stock-in** … When all steps of a [work order (指示書)](/manual/en/apps/work-order/user) are complete, the good pieces are stocked under the lot number. Amounts routed to semi-finished are stocked as semi-finished inventory.
- **Reservation** … Running the stock check on a sales order (注文請書) reserves available stock for that order.
- **Stock-out / release** … Shipping via a [shipping order (出荷書)](/manual/en/apps/shipping-order/user) issues the stock and releases the reservation.

## Products tab

- Columns: **product** (name + product code), **plant**, **storage location** ("location name / shelf code", or 未割当 when unassigned), **lot**, **quantity**, **available** (available count, plus a "予約 n" badge when some is reserved), **kind** (finished / semi-finished), **updated at**, and a **移動 (transfer)** row action.
- Search by product name or code, and filter by **plant** and **kind** (finished / semi-finished).
- Click a row to open the product inventory detail screen.

![Inventory products tab — storage locations, reservation badges, and kind](../../assets/screenshots/inventory-products-01.png)

## Stock transfers

The **移動 (transfer)** button on each row (also on the stock chips of the locations tab) opens the stock transfer dialog.

1. The source (current location) is shown.
2. Choose the destination as **plant → storage location → shelf**.
3. Enter the **quantity** (capped at the available count; whole numbers only for products) and optionally a **note**.

A transfer is recorded as a stock-out / stock-in transaction pair and appears in the transaction history tab. **Reserved stock cannot be moved.**

## Locations tab

Selecting a plant shows its **storage location cards** (name + code), each containing a **shelf grid** (shelf code, free space, and stock chips: item + quantity + transfer button). Stock without a shelf inside a location is grouped in a "棚未割当" (no shelf) frame, and stock with no storage location at all in a "未割当（保管場所なし）" (unassigned) frame.

If the plant has a floor map with placed storage-location pins, a **floor map** is also shown. Each pin reads "location name (code) ｜ 在庫 n 件"; clicking it scrolls to and highlights that location's card.

Storage locations and shelves are registered in the storage location master (MS0E).

![Inventory locations tab — storage location cards and shelf grids](../../assets/screenshots/inventory-locations-01.png)

## Product inventory detail screen

- Summary … product, plant, lot number, kind, quantity, reserved, available, and storage location. For semi-finished stock, the **originating step** (which work order and step it came from) is also shown.
- **Reservations** tab … The list of reservations against this inventory row. Status moves through **予約中 (reserved)** → **確定 (confirmed)** (when all steps complete) → **解除 (released)** (on shipping or cancellation). Related sales order and work order numbers are shown.
- **Transaction history** tab … Every stock movement. Types are **入庫 (in) / 出庫 (out) / 予約 (reserve) / 解除 (release) / 調整 (adjust)**; stock transfers appear as an out/in pair.

## FAQ

**Q. I want to correct a quantity by hand.** — The only operation available here is the stock transfer (changing the location). Discrepancies need an inventory-adjustment handled on the administrator side.

**Q. Available is 0 but quantity is not.** — That stock is reserved for other orders. The reservations tab shows which sales orders it is allocated to.

Using this app requires the inventory (inventory) permission. For the materials and WIP tabs, see [Inventory (Materials & WIP)](/manual/en/apps/material-inventory/user).
