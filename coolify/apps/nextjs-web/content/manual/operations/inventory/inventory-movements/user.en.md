---
title: "Stock Movement — User Manual"
description: "See each individual record of stock moving, as a slip. Slips are created automatically by business processes and cannot be created from this screen."
---
See **each individual record of stock moving** as a slip. The operation code is `ST04`.

> ⚠️ This app is currently available **only in the test environment**. The screens and the steps may change before it becomes available for real work.

> This app belongs to … [Production flow](/manual/en/process/production)

## What you can do in this app

- Check, slip by slip, when, for what reason, which item, and how much moved.
- Search by 事由 (cause — what caused it) and by site.
- From a slip, trace back to the business document it came from (work order, delivery order, material receipt, stock take, etc.).

**There is no "create new" in this app.** A slip is created automatically by whatever business process moved the stock — it is not something a person creates here by hand (this is deliberate). The one entry point where a person moves stock by hand is [Manual Stock Movement](/manual/en/operations/inventory/goods-movement/user) (ST06), and a movement made there is also recorded here as a slip.

## Terms used on this page

- **伝票 (Slip)** … the record of one stock movement. It has a slip number.
- **事由 (Cause)** … what caused that slip. See the table below.
- **明細 (Line)** … one item's movement within a slip. A single slip can have multiple lines.
- **元書類 (Source document)** … the original business document that caused the slip (a work order, delivery order, etc.).

## Causes that create a slip

| Cause | What creates it |
|---|---|
| 指示書完了 (Work order completed) | All process steps of a [work order](/manual/en/operations/production/work-order/user) complete, and good (or semi-finished) units enter stock |
| 出荷 (Shipment) | Dispatching via a [delivery order](/manual/en/operations/shipping/delivery-order/user) |
| 素材入荷 (Material receipt) | Registering a receipt in [Material Receipt](/manual/en/operations/purchasing/material-receipt/user) (PU03) |
| 在庫移動 (Stock transfer) | Changing storage location via "Move" in [Inventory Management](/manual/en/operations/inventory/inventory-management/user) (ST01) |
| 引当予約 (Stock reservation) | Stock being held via an order line's "stock check", or a work order being approved |
| 予約解除 (Reservation released) | A hold being released |
| 棚卸調整 (Adjustment) | Confirming a [Stock Take](/manual/en/operations/inventory/stock-takes/user) (ST05) with a discrepancy to correct (a stock take with no discrepancy creates no slip) |
| 手動 (Manual) | A person manually recording a movement in [Manual Stock Movement](/manual/en/operations/inventory/goods-movement/user) (ST06) |
| 不明（移行前） (Unknown, pre-migration) | An old record from before the stock system was rebuilt, whose cause is unknown |

## The screen

The list has these columns:

- **伝票番号 (Slip number)** … click to open the detail screen.
- **日時 (Date/time)** … when the slip occurred.
- **事由 (Cause)** … the colored badge from the table above.
- **拠点 (Site)** … which site it occurred at.
- **明細数 (Line count)** … how many lines are on that slip.
- **元書類 (Source document)** … a reference to the originating business document.

Filter using the search box above (searches by slip number or the source document reference), 「**事由**」(cause), and 「**拠点**」(site). When there are too many rows and the list is **capped at 1000 rows**, an orange notice says so.

## The detail screen

Clicking a slip number opens that slip's detail screen.

At the top: slip number, date/time, cause, site, source document (linked), creator, and notes.

Below is a table of lines:

- **種別 (Type)** … a badge for in / out / reserve / release / adjustment.
- **区分 (Category)** … product or material.
- **品目名 (Item name)** … the name of the item that moved.
- **ロット (Lot)** … the lot number, for a product.
- **保管場所 (Storage location)** … that line's storage location.
- **数量 (Quantity)** … how much moved.
- **備考 (Notes)** … notes on that line.

**This screen has no edit or cancel operation.** A slip is a confirmed record and cannot be corrected afterward. If something is wrong, correct the originating business process (work order, delivery order, etc.), or adjust to the correct state using [Manual Stock Movement](/manual/en/operations/inventory/goods-movement/user) (ST06) or [Stock Take](/manual/en/operations/inventory/stock-takes/user) (ST05).

Using this app requires the inventory permission.

## Frequently asked questions / troubleshooting

**Q. I want to create a new slip, but there's no button for it.**
A. This app has no "create new". To move stock manually, use [Manual Stock Movement](/manual/en/operations/inventory/goods-movement/user) (ST06). A movement made there will appear in this list as a slip with 「事由: 手動」(cause: manual).

**Q. I did a stock take, but no slip appeared.**
A. If the counted quantity matched the book quantity (no discrepancy), confirming the [Stock Take](/manual/en/operations/inventory/stock-takes/user) (ST05) creates no slip — it means there was nothing to correct.

**Q. I want to correct the content of a slip.**
A. You cannot correct it from this screen. Either fix the originating business process, or create a new slip (via manual stock movement or a stock take) that adjusts to the correct state.

**Q. Some slips have an empty "元書類" (source document).**
A. Records from before the stock system was rebuilt (cause 「不明（移行前）」) may have no source document remaining.

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
