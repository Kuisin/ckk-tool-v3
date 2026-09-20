---
title: "Stock Requirements — User Manual"
description: "Pick one item, and see \"what happened before\" and \"will there be enough\" in one timeline, per site."
---
Pick one item and see, per site, **what happened before** and **whether there will be enough** in one timeline. The operation code is `ST03`.

> ⚠️ This app is currently available **only in the test environment**. The screens and the steps may change before it becomes available for real work.

> This app belongs to … [Production flow](/manual/en/process/production)

## What you can do in this app

- Choose one item and one site to see, in a single timeline, the history of in/out movements so far and the expected future arrivals, shipments and usage.
- Look ahead to check "is there a day coming when this will run short".
- A shortfall row is highlighted red so it isn't missed.

This app is **a view of "is there enough of this item" from the item's side**. To see "what is where" from the location's side, use [Stock Overview](/manual/en/operations/inventory/stock-overview/user) (ST02). Both look at the same stock, just from different directions, and they do not link to each other.

## Terms used on this page

- **品目 (Item)** … a product or a material.
- **手持ち (On hand)** … the quantity actually present.
- **予約 (Reserved)** … the portion held for a specific order or work order.
- **利用可能（現時点） (Available, now)** … on-hand minus reserved, right now.
- **次回入荷 (Next arrival)** — for materials, the date the next already-ordered quantity is expected.

## How to use it

1. Search for and choose an 「**品目**」(item) — by item code, name, or keyword.
2. Choose a 「**拠点**」(site).
3. Once both are chosen, the table appears below. With only one chosen, nothing shows.

The chosen item and site stay in the URL, so reloading the page keeps the same item and site.

## The screen

The summary at the top shows the item (with a type badge), site, on-hand quantity, reserved quantity, available quantity (now), and next arrival.

Below it is a single chronological table.

- **過去 (Past)** … the actual record of stock movements. One row is added for every in/out/reserve/release/adjustment. From a row, you can go to the [Stock Movement](/manual/en/operations/inventory/inventory-movements/user) (ST04) slip it came from (a record with no slip number has a reason shown in its place).
- **現在庫 (Current)** … the "today" row. Above it are actual records; below it are projections.
- **未来 (Future)** … the arrivals, shipments and usage expected from here on. What shows depends on the item's type.
  - **For a material** … lines from an ordered but not-yet-received [Material Purchase Order](/manual/en/operations/purchasing/purchase-order/user) (PU02) (with an expected date) show as an arrival (increase); the still-unused reserved quantity of a work order shows as usage (decrease, dated by the earliest delivery date among that work order's allocated order lines).
  - **For a product** … the planned quantity of an approved or in-progress [work order](/manual/en/operations/production/work-order/user) shows as completion (increase); the unshipped portion of a confirmed / in-production / partially-shipped [order line](/manual/en/operations/sales/order-line/user) shows as shipment (decrease). From a row, you can go to the source work order or order line.
  - **For a semi-finished item** … expected arrivals show, but **future consumption is not modeled** (when and what a semi-finished item will be used for cannot be predicted ahead of time).

**A row that runs short is highlighted red.** If any running balance goes negative, a warning banner also appears at the top of the screen — don't miss it.

When there are too many past rows and they are **capped at 300**, an orange notice says so.

This app is **view-only**. You cannot arrive, ship, or transfer stock from here — use the original screen for each ([Material Purchase Order](/manual/en/operations/purchasing/purchase-order/user), [work order](/manual/en/operations/production/work-order/user), [delivery order](/manual/en/operations/shipping/delivery-order/user), etc.).

Using this app requires the inventory permission.

## Frequently asked questions / troubleshooting

**Q. I chose an item and a site, but nothing shows.**
A. If there is no stock record for that item/site combination, the table is empty — meaning there has been no movement in the past. Check that you chose the right item and site.

**Q. For a semi-finished item, the future rows only show arrivals (increases). Where do I see planned decreases?**
A. This app deliberately does not look ahead for when/what a semi-finished item will be used for. Once a plan to use it is decided, it will show up as a "past" row at that point.

**Q. The full planned quantity shows under "shipment", without deducting the part already partially shipped.**
A. Even for an order line already partially shipped, the unshipped portion shows as the **full order quantity** (it is not calculated by subtracting what has already gone out). Check the actual remaining quantity on the [order line](/manual/en/operations/sales/order-line/user) screen.

**Q. A negative warning is showing. What should I do?**
A. It means that, by that date, on-hand plus expected arrivals will fall short of what's reserved or planned for use. For a material, consider ordering more; for a product, consider reviewing the work order.

**Q. The past rows are cut off at 300.**
A. Older records are not shown. If you need more detailed history, use the "取引履歴" (transaction history) tab in [Inventory Management](/manual/en/operations/inventory/inventory-management/user) (ST01) or the [Stock Movement](/manual/en/operations/inventory/inventory-movements/user) (ST04) list.

<!-- permissions:start -->
## Permissions required

Using this screen requires the **Inventory** (`inventory`) permission.

| What you want to do | Permission needed |
| --- | --- |
| Open the screen, view lists and details | Inventory — View |
| Add, change or delete | Inventory — Create / Edit / Delete |

Viewing only needs *View*. Where a screen offers adding, changing or deleting, each of those needs its matching permission.

Permissions come through roles. If something is missing, ask an administrator.

For the whole picture see [Permissions and roles](../../../permissions).
<!-- permissions:end -->
