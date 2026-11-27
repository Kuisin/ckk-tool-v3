---
title: "Pending Delivery Orders — User Manual"
description: "A work queue that shows, on one screen, the order lines whose finished products are not yet on a delivery order and the delivery orders that have not…"
---
This is the **未処理出荷書** (pending delivery orders) app, where you check together "orders that are finished but do not have a delivery order yet" and "delivery orders that were made but have not gone out yet". The operation code is `SH03`.

> ⚠️ This app is still being prepared, so it may not appear on the live system yet. If you cannot find it, please ask the person in charge at your company.

> This app belongs to … [Shipping flow](/manual/en/process/shipping)

## What you can do with this app

- You can see, in one list, the order lines whose finished quantity is not yet fully on delivery orders.
- You can go straight to creating a new [delivery order](/manual/en/operations/shipping/delivery-order/user) with that order line already selected.
- You can check the delivery orders that were made but have not shipped yet (draft, confirmed).
- It is handy for deciding which orders to make delivery orders for today, in order of the nearest delivery date.

## Words used on this page

- **注文明細 (order line)** … one line of an order acceptance. It is the unit of an order: "this many pieces of this product".
- **出荷書 (delivery order)** … the shipping document that decides which product to send and how many.
- **完成数 (finished quantity)** … the number of good pieces actually produced by completed work orders. Pieces lost to defects are not included.
- **未手配 (unarranged)** … the finished quantity that is not yet on a delivery order. It is what remains of the finished quantity after taking away the pieces already put on delivery orders.

## How to open it

Press **未処理出荷書** (Pending Delivery Orders) inside 「出荷」 (Shipping) on the home screen. Or type `SH03` into the search box at the top of the screen. You need delivery order permission to view it.

## How to read the screen

The screen has two tabs. Both are work queues that show only things that are not finished yet.

- **未手配** (unarranged) … order lines whose finished quantity is not yet fully on delivery orders. The count is shown in orange.
- **出荷準備中** (preparing to ship) … delivery orders that have not become shipped yet.

You can narrow the list down with the search box at the top and 「**状態**」 (status) — and 「**種別**」 (type) on the preparing tab. Press 「**リセット**」 (reset) to clear the conditions.

### The unarranged tab

Order lines that have at least one completed work order, and whose finished quantity is not yet fully on delivery orders, are listed **earliest delivery date first**.

- **注文明細番号** (order line number) … click it to open the [order line](/manual/en/operations/sales/order-line/user) detail.
- **顧客 / 製品** (customer / product) … whose order it is and which product.
- **完了ロット** (completed lots) … the lot numbers of the completed work orders (shown like `#123`).
- **完成数** (finished quantity) … the number of pieces actually produced by the completed work orders. It is the real output, not the planned quantity, so pieces lost to defects are not included.
- **出荷手配済** (arranged for shipping) … the total quantity already put on delivery orders. Quantities on draft delivery orders also count as arranged.
- **未手配** (unarranged) … the part of the finished quantity not yet on a delivery order, shown as an orange badge.
- **納期 / 状態** (delivery date / status) … the planned delivery date and the line's status (confirmed, in production, partially shipped).

### The preparing-to-ship tab

Delivery orders that have not shipped yet (draft, confirmed) are listed. Click a row to open the [delivery order](/manual/en/operations/shipping/delivery-order/user) detail.

- **出荷書番号 / 顧客・注文明細** (delivery order number / customer & order lines) … which delivery order it is and which orders it covers.
- **種別** (type) … whether it is 「発送」 (dispatch) or 「在庫保管」 (stock storage).
- **数量合計 / 状態** (total quantity / status) … the total number of pieces on the delivery order, and its status (draft, confirmed).

Shipped delivery orders do not appear on this screen. Check them in the [delivery order](/manual/en/operations/shipping/delivery-order/user) list (`SH01`).

## Making a delivery order from an unarranged order

1. On the 「**未手配**」 (unarranged) tab, find the row you want to make a delivery order for.
2. Press 「**出荷書作成**」 (create delivery order) at the right end of the row.
3. The new delivery order screen opens with that order line already selected, so you build the quantities to send from the completed lots.
4. Check the content and save. For the steps after that, see the [delivery order](/manual/en/operations/shipping/delivery-order/user) manual.

When you save, the arranged-for-shipping quantity increases by that amount. A line whose unarranged quantity reaches zero disappears from this tab.

## Frequently asked questions / troubleshooting

**Q. An order that should be finished does not appear on the unarranged tab.**
A. Either it has no completed work order yet, or its finished quantity is already fully on delivery orders. Check whether the work order is completed on the [work order](/manual/en/operations/production/work-order/user) screen.

**Q. The finished quantity shown is smaller than the ordered quantity.**
A. The finished quantity is the work orders' actual output. If defects reduced the good pieces, or only some of the work orders are completed yet, it is smaller than the ordered quantity.

**Q. I left a delivery order as a draft and the unarranged quantity went down.**
A. That is the correct behaviour. Quantities on draft delivery orders also count as arranged, so the same finished pieces are never arranged twice.

**Q. Where can I see shipped delivery orders?**
A. This screen is a work queue, so shipped delivery orders are not shown. Check them in the delivery order list (`SH01`).

**Q. The unarranged tab says 「出荷書待ちの注文明細はありません」 (there are no order lines waiting for a delivery order).**
A. It means there is no order line that needs a delivery order right now. Lines appear here once a work order is completed and finished pieces exist.

<!-- permissions:start -->
## Permissions required

Using this screen requires the **Delivery order** (`delivery_order`) permission.

| What you want to do | Permission needed |
| --- | --- |
| Open the screen, view lists and details | Delivery order — View |
| Add, change or delete | Delivery order — Create / Edit / Delete |

Viewing only needs *View*. Where a screen offers adding, changing or deleting, each of those needs its matching permission.

Permissions come through roles. If something is missing, ask an administrator.

For the whole picture see [Permissions and roles](../../../permissions).
<!-- permissions:end -->
