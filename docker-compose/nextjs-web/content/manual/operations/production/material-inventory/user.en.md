---
title: "Inventory Management (Materials and Work in Progress) — User Manual"
description: "Check how much material you can use now, how much you will be able to use once deliveries arrive, and how much is being made right now."
screenshots: [inventory-materials-01, inventory-material-detail-01, inventory-material-transactions-01, inventory-wip-01]
---
This page explains the 「**素材**」 (materials) tab and the 「**仕掛品**」 (work in progress) tab of [inventory management](/manual/en/operations/production/product-inventory/user) (operation code `PD04`). You can check how much material you can use now, and how much is being made right now.

> ⚠️ For now this app works **only in the test environment**. The screens and the steps may change before it can be used for real work.

## What you can do on this page

- You can check how much material is at which site.
- You can see **how many pieces you can really use**, not counting what is set aside (reserved).
- You can check **when and how much** ordered material will arrive.
- You can check how many pieces are at which step of which work order right now.

> 💡 You cannot change the material numbers directly here. The numbers move automatically along with everyday work. The only thing you can do by hand on this screen is 「**在庫移動**」 (stock transfer), which changes where something is kept. For how to do it, see [inventory management](/manual/en/operations/production/product-inventory/user).

## Words used on this page

- **利用可能** (available) … the part of the stock that is not set aside yet. This is what you can really use.
- **予約（取り置き）** (reserved / set aside) … material held for pieces you are about to make.
- **次回入荷** (next arrival) … the date the next ordered material is due to arrive.
- **仕掛品** (work in progress) … items that are half made. They are somewhere in the steps and are not stock yet.

## Where material goes up and down

- **In** … when you register an arrival in [material receipt](/manual/en/operations/purchasing/material-receipt/user) (PU03), the stock at the receiving site goes up.
- **Set aside** … when a 「製造分」 (to make) [work order](/manual/en/operations/production/work-order/user) is approved, the material it will use is set aside for the planned quantity.
- **Down** … when all the steps of that work order are finished, the material that was set aside goes down as material used.
- **Arrivals appear** … the next arrival date and quantity come from the line items of ordered [material purchase orders](/manual/en/operations/purchasing/purchase-order/user) (PU02).

## How to read the materials tab

![Materials tab of inventory management](../../../assets/screenshots/inventory-materials-01.png)

- **素材** (material) … the material code and name.
- **拠点** (site) … which site it is at.
- **保管場所** (storage place) … shown as "place name / shelf code". Ones not decided yet show 「**未割当**」 (not assigned).
- **在庫数** (stock quantity) … how much there really is, shown with the unit.
- **利用可能** (available) … how much of that is not set aside, so you can really use it.
- **次回入荷** (next arrival) … the date the next ordered material is due to arrive.
- **移動** (transfer) … the button you press to change where it is kept.
- Type a material code or material name into the search box at the top to find one. You can also narrow it down with 「**拠点**」 (site).
- Click a row to open the detail screen for that material stock.

## Looking at the detail screen

Click a row to open the detail screen for that one material. Near the top you see the material, site, stock quantity, reserved quantity, available quantity, next arrival, storage place, and notes.

![Material stock detail screen and the ATP timeline](../../../assets/screenshots/inventory-material-detail-01.png)

### The ATP timeline

This is a table, in date order, that starts from how much you can use now and adds the arrivals to come, so you can see **when you will be able to use how much**.

- **時点** (point in time) … the top line is 「**現時点**」 (right now). The lines below are the arrival dates. Amounts with no arrival date decided show 「**未定**」 (not decided).
- **入荷量** (arriving amount) … how much is due to arrive that day.
- **利用可能** (available) … how much you can use after that day, counting the arrivals up to then.
- **参照** (reference) … the number of the purchase order it came from.

A day where 「利用可能」 (available) is a **red number (below zero)** means that at that point you do not have enough. What has been set aside is more than the stock you have plus the arrivals. It is a sign that you may want to order more.

### Transaction history

The record of material movements. The date and time, type, quantity, reference, and notes are kept.

![Transaction history tab of material stock](../../../assets/screenshots/inventory-material-transactions-01.png)

There are five types: 「**入庫**」 (in), 「**出庫**」 (out), 「**予約**」 (reserve), 「**解除**」 (release), and 「**調整**」 (adjust).

## How to read the work in progress tab

This screen lists how much is being made right now, by work order and by step.

![Work in progress tab of inventory management](../../../assets/screenshots/inventory-wip-01.png)

- Items are grouped by product, with a total such as 「計 51」 (51 in total).
- Below that you see 「**指示書番号**」 (work order number), 「**工程**」 (step), and 「**仕掛数**」 (quantity in progress).
- Click a work order number to open that [work order](/manual/en/operations/production/work-order/user) screen.
- When no work order is in progress, the screen shows 「**進行中の仕掛品はありません**」 (There is no work in progress).

> ⚠️ Work in progress is not stock yet. It goes into real stock when all the steps of the work order are finished.

You need inventory permission to use this app. For the products tab, the locations tab, and how to do a stock transfer, see [inventory management](/manual/en/operations/production/product-inventory/user).

## Input fields

Inventory is mostly a **screen for looking things up**; the only input is when moving stock somewhere else.

| Field | Required | What to enter |
|-------|----------|---------------|
| [Destination plant](#field-plant) | Required | Where it moves to |
| [Storage location / shelf](#field-location) | Optional | Where within that plant |
| [Quantity](#field-quantity) | Required | How much moves |
| [Notes](#field-notes) | Optional | Why it moved |

### Destination plant [#field-plant]

Which plant it moves to. **Stock falls at the source and rises at the destination.**

### Storage location / shelf [#field-location]

Where within the destination plant it is put. Setting it makes the physical item easier to find later.

### Quantity [#field-quantity]

How much moves. It cannot exceed what is at the source.

### Notes [#field-notes]

Why it moved. The movement itself is kept in the history.

## Questions and problems

**Q. The reserved quantity is more than the stock quantity. Is that wrong?**
A. No, that is normal. A work order can be approved even when there is not enough stock, and the amount needed is set aside at that time. Being short is a sign that you need to order. Please use the ATP timeline to check whether it will be enough after the arrivals.

**Q. 「利用可能」 (available) is a red number below zero.**
A. What has been set aside is more than the stock you have plus the arrivals to come. Please consider bringing an arrival forward, or whether you need to order more.

**Q. I want to correct a material number by hand.**
A. The only thing you can do from this screen is 「在庫移動」 (stock transfer), which changes where something is kept. If a number is wrong, a stocktake adjustment is needed, so please talk to an administrator.

**Q. The 「次回入荷」 (next arrival) box is empty.**
A. There is no ordered material purchase order for that material. If nothing has been ordered, no arrival is shown.

**Q. Nothing appears on the work in progress tab.**
A. There is no work order in progress. Things appear once a work order is approved and its steps start.

**Q. The work in progress quantity does not appear on the products tab.**
A. Pieces still being made are not stock yet. They go onto the products tab when all the steps are finished.
