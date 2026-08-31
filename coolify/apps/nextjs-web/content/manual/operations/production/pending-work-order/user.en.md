---
title: "Pending Work Orders — User Manual"
description: "A work queue that shows, on one screen, the order lines that do not yet have enough work orders and the work orders that are not finished…"
---
This is the **未処理指示書** (pending work orders) app, where you check together "orders that do not have a work order yet" and "work orders that were made but are not finished yet". The operation code is `PD05`.

## What you can do with this app

- You can see, in one list, the confirmed order lines that do not yet have enough work orders arranged.
- You can go straight to creating a new [work order](/manual/en/operations/production/work-order/user), with the missing quantity already filled in.
- You can check the work orders that were made but are not finished yet (draft, pending approval, approved, in progress).
- It is handy for deciding which orders to make work orders for today, in order of the nearest delivery date.

## Words used on this page

- **注文明細 (order line)** … one line of an order acceptance. It is the unit of an order: "this many pieces of this product".
- **指示書 (work order)** … the manufacturing instruction that says "make this many of this product".
- **手配 (arranging)** … making work orders for an order line. One line can also be split across several work orders.
- **未手配 (unarranged)** … the quantity ordered that has not become a work order yet. It is calculated as **unarranged = ordered quantity − arranged quantity**.

## How to open it

Press **未処理指示書** (Pending Work Orders) inside 「生産」 (Production) on the home screen. Or type `PD05` into the search box at the top of the screen. You need work order permission to view it.

## How to read the screen

The screen has two tabs. Both are work queues that show only things that are not finished yet.

- **未手配** (unarranged) … order lines that do not yet have enough work orders. The count is shown in orange.
- **進行中** (in flight) … work orders that were made and are not completed or cancelled.

You can narrow the list down with the search box at the top and 「**状態**」 (status) — and 「**種別**」 (type) on the in-flight tab. Press 「**リセット**」 (reset) to clear the conditions.

### The unarranged tab

Confirmed order lines whose work order quantity has not reached the ordered quantity are listed, **earliest delivery date first**.

- **注文明細番号** (order line number) … click it to open the [order line](/manual/en/operations/sales/order-line/user) detail.
- **顧客 / 製品** (customer / product) … whose order it is and which product.
- **受注数** (ordered quantity) … the number of pieces ordered.
- **手配済** (arranged) … the total quantity already allocated to work orders. Cancelled work orders are not counted. Also, if a completed work order fell short because of defects, the shortfall returns to unarranged.
- **未手配** (unarranged) … ordered quantity − arranged quantity, shown as an orange badge.
- **在庫引当** (stock reserved) … the quantity already reserved from product stock. This amount can go into a "from stock" work order.
- **納期 / 状態** (delivery date / status) … the planned delivery date and the line's status (confirmed, in production, partially shipped).

### The in-flight tab

Work orders that are not completed or cancelled are listed. Click a row to open the [work order](/manual/en/operations/production/work-order/user) detail.

- **指示書番号 / 注文明細番号** (work order number / order line number) … a work order not tied to an order shows a 「**在庫向け**」 (for stock) badge.
- **種別** (type) … whether it is 「製造分」 (manufactured) or 「在庫分」 (from stock).
- **予定数量 / 承認状態 / 状態** (planned quantity / approval status / status) … how many are planned, how far approval has gone, and which stage the work order is at (draft, pending approval, approved, in progress).

Completed work orders do not appear on this screen. Check them in the [work order](/manual/en/operations/production/work-order/user) list (`PD02`).

## Making a work order from an unarranged order

1. On the 「**未手配**」 (unarranged) tab, find the row you want to make a work order for.
2. Press 「**指示書作成**」 (create work order) at the right end of the row.
3. The new work order screen opens. That order line is selected, the type is 「**製造分**」 (manufacture), and the quantity is pre-filled with the **unarranged quantity**.
4. Check the content and save. For the steps after that, see the [work order](/manual/en/operations/production/work-order/user) manual.

When you save, the arranged quantity increases by that amount. A line whose unarranged quantity reaches zero disappears from this tab.

## Frequently asked questions / troubleshooting

**Q. An order line that was in the list has disappeared.**
A. The whole ordered quantity has been allocated to work orders (the unarranged quantity became zero). You can find the work orders you made on the in-flight tab or in the work order list (`PD02`).

**Q. I cancelled a work order and the order came back to the unarranged tab.**
A. That is the correct behaviour. The quantity of a cancelled work order is removed from the arranged quantity, so that amount returns to unarranged and can be arranged again.

**Q. The unarranged tab says 「指示書待ちの注文明細はありません」 (there are no order lines waiting for a work order).**
A. It means there is no order line that needs a work order right now. Order lines appear here once they are confirmed (once they get a branch number).

**Q. Where can I see completed work orders?**
A. This screen is a work queue, so completed and cancelled work orders are not shown. In the work order list (`PD02`), filter the status to 「完了」 (completed).

**Q. Can I split one order across several work orders?**
A. Yes. If you reduce the quantity in 「指示書作成」 (create work order) and save, the remaining quantity stays in this list as unarranged.

<!-- permissions:start -->
## Permissions required

Using this screen requires the **Work order** (`work_order`) permission.

| What you want to do | Permission needed |
| --- | --- |
| Open the screen, view lists and details | Work order — View |
| Add, change or delete | Work order — Create / Edit / Delete |

Viewing only needs *View*. Where a screen offers adding, changing or deleting, each of those needs its matching permission.

Permissions come through roles. If something is missing, ask an administrator.

For the whole picture see [Permissions and roles](../../../permissions).
<!-- permissions:end -->
