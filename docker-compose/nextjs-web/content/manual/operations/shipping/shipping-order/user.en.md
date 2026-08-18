---
title: "Shipping Order — User Manual"
description: "A document that records what products you sent, and how many, when you ship finished products to a customer."
screenshots: [shipping-order-list-01, shipping-order-new-01, shipping-order-detail-01, shipping-order-menu-01, shipping-order-confirm-01, shipping-order-delivery-notes-01]
---
This app creates a **shipping order** (出荷書) — a document that records **what you sent and how many** when finished products go out to a customer. The operation code is `SH01`.

> ⚠️ This app is still being prepared. Screens and steps may change before it is fully released.

## What you can do with this app

- Make a shipping order that lists the products and the number of pieces you are sending.
- Just pick a sales order, and **the lines for the finished work are filled in for you** (no need to type them again).
- When you record a shipment, **the stock goes down automatically**.
- Make a [delivery note](/manual/en/operations/shipping/delivery-note/user) from a shipping order.
- Also record items you keep in-house instead of sending (for example, spare pieces you made).

The shipping order is an important document — it is the source used later when an [invoice](/manual/en/operations/billing/invoice/user) is made.

## Words used on this page

- **受注明細 (sales order)** … The document that decides "which customer, which product, how many pieces, by when". You look at this when you make a shipping order.
- **指示書 (work order)** … The document that tells the factory "please make this many of this product". You ship the pieces from work orders that are finished.
- **Lot** … The number given to a batch of products made together. The work order number becomes the lot number.
- **発送 / 在庫保管 (Dispatch / Keep in stock)** … "発送" means the pieces you send to the customer. "在庫保管" means the pieces you keep in-house instead of sending.
- **明細 (line)** … One row inside the shipping order. It says "which product, how many pieces".

## Before you start

- The **受注明細 (sales order)** for what you want to ship must already be registered.
- Check that the products are finished (the [work order](/manual/en/operations/production/work-order/user) is complete). Finished work orders are what gets filled into the lines for you.
- You need shipping permission to make a shipping order or to ship. If you cannot use it, please ask your administrator.

## How to read the screen

When you open the app, you see a list of the shipping orders made so far.

![Shipping order list screen](../../../assets/screenshots/shipping-order-list-01.png)

- **出荷書番号 (Shipping order number)** … A number that starts with `SHP-`. The system adds it for you.
- **種別 (Type)** … A blue 「発送」 (Dispatch) means pieces sent to the customer. A grey 「在庫保管」 (Keep in stock) means pieces kept in-house.
- **状態 (Status)** … Grey is 「下書き」 (Draft), blue is 「確定」 (Confirmed), green is 「出荷済」 (Shipped).
- In the search box at the top you can type a shipping order number, a sales order number, a customer name, or a product name to narrow the list. This box is for **finding shipping orders you have already made**; it is a different box from the one for picking a sales order when you make a new shipping order.
- The list shows **shipping orders sent from the site you belong to**.
- Click a row to open the detail screen for that shipping order.

## Making a shipping order

1. Press 「**新規作成**」 (New) at the top right of the list screen.
2. Click the 「**受注明細**」 (Sales order) box and pick the sales order you want to ship. Inside this box you search by the **customer name, product name, or the customer's order number** (unlike the search box on the list screen, you cannot search here by a sales order number starting with `ORD-`).
3. The finished work orders are **filled into the lines for you** (one row per work order). The quantity is the number of good pieces made by that work order (if nothing is recorded yet, it is the number that was planned).
4. In 「**種別**」 (Type), choose 「**発送**」 (Dispatch) or 「**在庫保管**」 (Keep in stock). Normally you leave it as 「発送」.
5. In 「**出荷元拠点**」 (Shipping site), choose where you are sending from.
6. Change the 「**数量**」 (Quantity) on each line to the number of pieces you are really sending.
7. To add a row, press 「**明細を追加**」 (Add line). To remove a row, press the trash-can mark at the right of the row.
8. Press 「**保存**」 (Save).

![New shipping order form](../../../assets/screenshots/shipping-order-new-01.png)

After you save, it is registered as a 「**下書き**」 (Draft) and the detail screen opens.

> 💡 When you pick a sales order, its contents (customer, product, ordered pieces, number of finished work orders) appear in a blue band. Please check that it is correct before going on.

> ⚠️ The sales order cannot be changed after you save. If you picked the wrong one, cancel that shipping order and make a new one.

## Checking the contents

![Shipping order detail screen](../../../assets/screenshots/shipping-order-detail-01.png)

At the top you see the shipping order number, sales order number, customer, product, type, shipping site, quantity, and shipping date.

- **数量合計 (Total quantity)** … Shown as "30 / 受注 50", so you can see the pieces being sent next to the pieces that were ordered.
- The 「明細」 (Lines) area below shows the product, lot, quantity, and notes.
- There are three tabs. **概要** (Overview) shows the notes, **納品書** (Delivery notes) shows the delivery notes made from this shipping order, and **履歴** (History) shows a record of who changed what and when.

## The three stages before shipping

A shipping order moves through three stages: 「下書き」 (Draft) → 「確定」 (Confirmed) → 「出荷済」 (Shipped). You do this from the 「**…**」 button (the three dots) at the top right of the screen.

![The "…" menu on the detail screen](../../../assets/screenshots/shipping-order-menu-01.png)

### 1. Fixing the contents (Confirm)

1. On the shipping order screen, press 「**…**」 at the top right.
2. Choose 「**確定**」 (Confirm).
3. A small window called 「確定の確認」 (Confirm check) appears. Read it and press 「**確定**」 (Confirm).

![Confirm check window](../../../assets/screenshots/shipping-order-confirm-01.png)

Once confirmed, **you can no longer edit it**, but you can now make a delivery note.

### 2. When you have really sent it (Ship)

1. Press 「**…**」 at the top right.
2. Choose 「**出荷**」 (Ship).
3. 「出荷の確認」 (Ship check) appears. Press 「**出荷する**」 (Ship).

When you ship, today's date is recorded as the **出荷日 (shipping date)** and the status becomes 「**出荷済**」 (Shipped). At the same time, the [product stock](/manual/en/operations/production/product-inventory/user) goes down by the pieces you sent, and the sales order changes by itself to "一部出荷" (Partly shipped) or "出荷済" (Shipped).

### If you made a mistake (Cancel)

Only while it is a 「下書き」 (Draft) can you remove it, using 「**キャンセル**」 (Cancel) in the 「**…**」 menu at the top right. After it is confirmed, it cannot be removed.

## Keeping pieces in-house instead of sending (Keep in stock)

When you keep pieces in-house instead of sending them to the customer — for example spare pieces you made — choose 「**在庫保管**」 (Keep in stock) in 「**種別**」 (Type).

- When you ship with 「在庫保管」, the products are **added** to the stock at the storing site.
- They are not billed. The status of the sales order does not change either.

When you choose 「在庫保管」 in Type, an explanation appears on the screen.

## Making a delivery note

1. On the shipping order screen, open the 「**納品書**」 (Delivery notes) tab.
2. Press 「**納品書を作成**」 (Create delivery note).
3. The [delivery note](/manual/en/operations/shipping/delivery-note/user) creation screen opens with the shipping order already chosen.

![Delivery notes tab](../../../assets/screenshots/shipping-order-delivery-notes-01.png)

This tab also lists the delivery notes made from this shipping order (delivery number, delivery destination, method, status, delivery date).

## Input fields

Every field on the shipping order screen. The **?** next to a field in the app links straight to its description here.

| Field | Required | What to enter |
|-------|----------|---------------|
| [Order line](#field-order-line) | Required | Which order this shipment is for |
| [Type](#field-type) | Required | Dispatch, or stock storage |
| [Shipping plant](#field-plant) | Required | Which plant it leaves from |
| [Notes](#field-notes) | Optional | Notes for the whole shipping order |
| [Product](#field-product) | Required | The product going out |
| [Lot (stock)](#field-lot) | Required | Which production run it comes from |
| [Quantity](#field-quantity) | Required | How many pieces go out |

### Order line [#field-order-line]

Which order this shipment is for. Choosing it shows that order's products and the quantity still outstanding.

### Type [#field-type]

The kind of shipment. **Only dispatch goes on to a delivery note and billing.**

- **Dispatch** — going to the customer; continues to the delivery note and billing
- **Stock storage** — spare production kept in-house; **does not continue to billing**

### Shipping plant [#field-plant]

Which plant it leaves from. **Stock falls at this plant**, so choose the one the goods physically leave.

### Notes [#field-notes]

Notes about the shipping order as a whole. Notes about one line go in that line's own notes.

### Product [#field-product]

The product going out, chosen from the products on the sales order.

### Lot (stock) [#field-lot]

Which production run (lot) it comes from. **The lot number is the same as the work order number**, which is how you can trace later which production run went to which customer. Only lots with stock at the shipping plant can be chosen.

### Quantity [#field-quantity]

How many pieces go out. It cannot exceed the lot's stock. To ship in parts, create separate shipping orders.

## Questions and problems

**Q. In the 「受注明細」 box on the new shipping order screen, I search but the sales order I want to ship does not appear.**
A. In this box, type the **customer name, product name, or the customer's order number**. Here you cannot find it by the sales order number starting with `ORD-` (this is a different box from the search box at the top of the list screen, where sales order numbers do work). If it still does not appear, that sales order may already be shipped or cancelled.

**Q. I picked a sales order, but only one line was filled in.**
A. When there are no finished work orders yet, only one empty row is added. Either make the shipping order again after the products are finished, or type the number of pieces yourself.

**Q. I get 「受注数量 50 を超える出荷になります（累計 60）」 (This ships more than the ordered quantity of 50; total 60) and cannot ship.**
A. You are trying to send more pieces than were ordered on the same sales order. Lower the quantity on this shipping order, or check what has already been shipped.

**Q. I get 「在庫が不足」 (Not enough stock) and cannot ship.**
A. The site you are sending from does not have enough stock for the pieces you want to send. Check the numbers in [product stock](/manual/en/operations/production/product-inventory/user) and try again.

**Q. I made a mistake and want to fix it, but 「編集」 (Edit) does not appear.**
A. You can only edit while it is a 「下書き」 (Draft). After it is confirmed it cannot be fixed, so leave that shipping order as it is and make a new one with the correct contents.

**Q. I shipped, but the sales order does not become 「出荷済」 (Shipped).**
A. Check whether the type is 「在庫保管」 (Keep in stock). That type is a record of pieces kept in-house, so the sales order status does not change. Also, if you sent only part of the ordered pieces, it becomes 「一部出荷」 (Partly shipped).
