---
title: "Stock Overview — User Manual"
description: "See what is at each location (site, storage location, shelf) and how much, product and material together in one table."
---
See what is where and how much, **product and material together in one table**. The operation code is `ST02`.

> ⚠️ This app is currently available **only in the test environment**. The screens and the steps may change before it becomes available for real work.

> This app belongs to … [Production flow](/manual/en/process/production)

## What you can do in this app

- Narrow down by site, storage location and shelf to see what is at that location.
- Compare product and material side by side in the same table.
- Hide rows with zero stock to see only what actually exists.
- Search by item name or item code.

This app is **a view of "what is where" from the location's side**. To see "is there enough of this item" from the item's side, use [Stock Requirements](/manual/en/operations/inventory/stock-requirements/user) (ST03). To move stock in detail, or to see product, WIP and location separately, use [Inventory Management](/manual/en/operations/inventory/inventory-management/user) (ST01). These three all look at the same stock, just from different directions.

## Terms used on this page

- **品目 (Item)** … a product or a material. Each row's badge shows which one it is.
- **拠点 (Site)** … a large-scale location, such as a factory or a warehouse.
- **保管場所 / 棚 (Storage location / shelf)** … a place within a site.
- **ロット (Lot)** … the number attached to a batch of product made together.
- **手持ち (On hand)** … the quantity actually present.
- **予約 (Reserved)** … the portion held for a specific order or work order.
- **利用可能 (Available)** … the portion of on-hand stock not yet reserved.

## The screen

- **品目 (Item)** … the item's name, with a badge for "製品" (Product) or "素材" (Material).
- **コード (Code)** … the item code.
- **拠点 (Site)** … which site it is at.
- **保管場所・棚 (Storage location / shelf)** … shown as "location name / shelf code". Not yet decided shows "**未割当**" (unassigned).
- **ロット (Lot)** … the lot number, for product rows.
- **手持ち (On hand)** … the quantity actually present.
- **予約 (Reserved)** … how much of it is reserved (this column can be hidden).
- **利用可能 (Available)** … on-hand minus reserved — what you can actually use.
- **単位 (Unit)** … the unit of quantity (this column can be hidden).
- **更新日 (Updated)** … the date that row's stock last moved.

Above the list: a search box, 「**拠点**」(site), 「**保管場所**」(storage location — narrowed to that site's locations once a site is chosen), and 「**品目種別**」(item type — product / material).

The 「**在庫ゼロを隠す**」(hide zero stock) switch is **on** by default. Turn it off to also show locations with zero on hand — useful for confirming that "there really is nothing where there should be something".

Below the list, a summary shows the row count, item count, and site count shown. When there are too many rows and the list is **capped at 1000 rows**, an orange notice says so — add more filters to reduce the count.

This app has no detail screen and no create screen — it is **a view-only list**. To move stock, use [Inventory Management](/manual/en/operations/inventory/inventory-management/user) (ST01) or [Manual Stock Movement](/manual/en/operations/inventory/goods-movement/user) (ST06).

Using this app requires the inventory permission.

## Frequently asked questions / troubleshooting

**Q. The item I'm looking for doesn't show in the list.**
A. If "在庫ゼロを隠す" (hide zero stock) is on, locations with zero on hand won't show. Turn it off and check. If it still doesn't show, check whether your filters (site / storage location / item type) match.

**Q. The list is cut off at 1000 rows.**
A. Add more filters (site / storage location / item type / search) to reduce the count. This list has no pagination — it is designed to always be narrowed with filters instead.

**Q. I want to transfer stock from here.**
A. You cannot transfer from this app. Use the matching row in [Inventory Management](/manual/en/operations/inventory/inventory-management/user) (ST01), or [Manual Stock Movement](/manual/en/operations/inventory/goods-movement/user) (ST06).

**Q. The same stock also shows in [Inventory Management](/manual/en/operations/inventory/inventory-management/user) (ST01). Which one is correct?**
A. Both are correct — they just show the same stock from a different direction. Use this app when you want a quick count across locations; use ST01 when you want to look at product, material and WIP separately in detail.

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
