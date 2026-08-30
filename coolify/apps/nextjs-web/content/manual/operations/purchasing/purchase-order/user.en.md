---
title: "Material Purchase Order — User Manual"
description: "An app for ordering material from a supplier. You order it after approval, and record it right up to the point where it arrives and goes into stock."
screenshots: [purchase-order-list-01, purchase-order-new-01, purchase-order-detail-02, purchase-order-detail-01, purchase-order-complete-01, purchase-order-attachments-01]
---
This app is for making a **素材発注書** (material purchase order), which is how you order material from a supplier. The operation code is `PU02`.

> ⚠️ This app is still being prepared, so it may not appear on the live system yet. If you cannot find it, please ask the person in charge at your company.

## What you can do with this app

- You can write which supplier, which material, how many pieces, and at what price.
- You can place the order after your manager has given **承認** (approval).
- Once you place the order, the material appears as "arriving soon" on its [stock screen](/manual/en/operations/production/material-inventory/user).
- When the material arrives, you press 「入荷完了」 (Receiving complete) and it **goes into stock automatically**.
- You can keep copies of order forms and delivery notes attached to the purchase order.

## Words used on this page

- **明細** (line item) … one line inside the purchase order. It says "which material, how many, at what price".
- **仕入先** (supplier) … the company you buy the material from.
- **入荷先拠点** (receiving site) … the site (plant or business location) that will receive the material.
- **入荷予定日** (expected arrival date) … the date the material is expected to arrive.
- **入荷** (arrival) … the material actually arriving.
- **証憑** (supporting document) … papers you may want to look at later, such as a copy of the order form or the delivery note.

## Before you start

- The **material you want must be registered in the [material master](/manual/en/operations/masters/material/user)**.
- The **supplier must be registered in the [business partner master](/manual/en/operations/masters/business-partner/user)**. You cannot choose a company that is not registered.
- You need purchasing permission to create, edit, and place orders. If the buttons do not appear, please ask the person in charge at your company.

## The order in which a purchase order moves along

A material purchase order moves along in this order. The coloured badge on the screen tells you where it is now.

1. **下書き** (draft) … you have only created it. This is the only time you can change it.
2. **承認依頼中** (pending approval) … you are waiting for your manager's answer.
3. **承認済** (approved) … it was accepted. You can now order from the supplier.
4. **発注済** (ordered) … you have ordered from the supplier. Now you wait for the material.
5. **入荷完了** (receiving complete) … the material arrived and went into stock.

Before you place the order, you can still withdraw it and make it 「**キャンセル**」 (cancelled).

## How to read the screen

When you open the app, you see a list of the material purchase orders made so far.

![Material purchase order list](../../../assets/screenshots/purchase-order-list-01.png)

- **発注番号** (order number) … a number starting with `PO-`. The system adds it for you.
- **状態** (status) … a coloured badge shows the current situation. Grey is 「下書き」 (draft), yellow is 「承認依頼中」 (pending approval), blue is 「承認済」 (approved), purple is 「発注済」 (ordered), green is 「入荷完了」 (receiving complete), and red is 「キャンセル」 (cancelled).
- Type an order number or a supplier name into the search box at the top to narrow down the list.
- Click a row to open the detail screen for that purchase order.

## Creating a material purchase order

There are two ways to make one.

### Way 1: create it from scratch

1. Press 「**新規作成**」 (New) at the top right of the list screen.
2. Choose the 「**仕入先**」 (supplier). You must choose one.
3. Enter the 「**発注日**」 (order date). You may leave it blank.
4. Click the 「**素材**」 (material) box on the line item, search by material code or name, and choose one.
5. Choose the site that will receive it in 「**入荷先拠点**」 (receiving site). You may leave it blank.
6. Enter the 「**数量**」 (quantity) and the 「**単位**」 (unit).
7. Enter the price for one piece in 「**単価**」 (unit price).
8. Enter the date the material should arrive in 「**入荷予定日**」 (expected arrival date). You may leave it blank.
9. To add another material, press 「**明細を追加**」 (Add line item) and repeat steps 4 to 8.
10. Finally, press 「**保存**」 (Save).

![New material purchase order form](../../../assets/screenshots/purchase-order-new-01.png)

The amount (quantity × unit price) and the total are shown automatically as you type. You do not need a calculator.

> 💡 If you leave 「発注日」 (order date) blank, the day you press 「発注」 (Order) later becomes the order date automatically.

### Way 2: convert a purchase request

If a [purchase request](/manual/en/operations/purchasing/purchase-request/user) has been approved, you can create the purchase order from 「**発注書へ変換**」 (Convert to purchase order) on its screen. The material, quantity, and site are carried over, but **the unit prices stay at 0 yen**. Please enter the prices from 「編集」 (Edit) while it is still a draft.

## Asking for approval

1. Open the purchase order screen.
2. Press 「**承認依頼**」 (Request approval) on the 「**承認依頼が必要です**」 (approval request needed) card near the top of the screen.

![Draft material purchase order](../../../assets/screenshots/purchase-order-detail-02.png)

The status changes to 「**承認依頼中**」 (pending approval), and the request reaches the person who approves it. The same request also appears on the [approval management](/manual/en/operations/production/approval/user) screen.

## Approving or sending back (for the approver)

Only the person who approves sees these buttons.

- If the content is fine, press 「**承認**」 (Approve). The status becomes 「承認済」 (approved).
- If something needs fixing, press 「**差し戻し**」 (Send back), write your reason in 「**差し戻し理由**」 (reason for sending back), and press 「**差し戻す**」 (Send back).

A purchase order that was sent back returns to 「**下書き**」 (draft). The person who made it can fix the content and press 「承認依頼」 (Request approval) again.

## Ordering from the supplier

1. Open a purchase order with the status 「承認済」 (approved).
2. Press 「**発注**」 (Order).
3. A small window called 「発注の確認」 (confirm order) appears, so press 「**発注する**」 (Place order).

The status becomes 「**発注済**」 (ordered). From this moment, the material you ordered is shown as "arriving soon" on the [stock screen](/manual/en/operations/production/material-inventory/user).

## Recording that the material has arrived

When everything you ordered has arrived, use this to put it into stock.

1. Open a purchase order with the status 「発注済」 (ordered).
2. Press 「**入荷完了**」 (Receiving complete).

![Ordered material purchase order](../../../assets/screenshots/purchase-order-detail-01.png)

3. A small window called 「入荷完了の確認」 (confirm receiving complete) appears.
4. Check the content and press 「**入荷完了にする**」 (Mark as receiving complete).

![Confirm receiving complete screen](../../../assets/screenshots/purchase-order-complete-01.png)

All the quantity that had not arrived yet is treated as arrived, and it is added to the material stock at the receiving site. At the same time, a [material receipt](/manual/en/operations/purchasing/material-receipt/user) record is created automatically, and the person who requested it and the person who made it are notified.

> ⚠️ Please do not use this when only part of the order has arrived. Register just the part that arrived in [material receipt](/manual/en/operations/purchasing/material-receipt/user). 「入荷完了」 (Receiving complete) handles all the remaining quantity at once.

From 「発注済」 (ordered) onwards, each line item shows how many pieces have arrived so far, like 「**入荷済 20**」 (20 received).

## Keeping documents attached

You can keep copies of order forms and delivery notes together with the purchase order.

1. Open the 「**証憑**」 (supporting documents) tab on the purchase order screen.
2. Press 「**アップロード**」 (Upload) and choose a file.
3. A screen called 「証憑のアップロード」 (upload supporting document) appears. If you like, write something such as "copy of order form" in 「**ラベル（任意）**」 (label, optional).
4. Press 「**アップロード**」 (Upload).

![Supporting documents tab](../../../assets/screenshots/purchase-order-attachments-01.png)

You cannot attach files before approval. If you open the tab before approval, the screen shows 「**証憑の添付は承認後（承認済・発注済・入荷完了）に可能になります**」 (Supporting documents can be attached after approval — approved, ordered, or receiving complete).

## Checking the content

The purchase order screen has four tabs.

- **明細** (line items) … the list of material, quantity, unit price, and amount. The total is shown at the bottom.
- **証憑** (supporting documents) … the list of files you attached.
- **概要** (overview) … the notes.
- **履歴** (history) … a record of who changed what and when.

A purchase order made from a purchase request shows a link to the original request number near the top, as 「**変換元（購買依頼）**」 (converted from — purchase request).

## Input fields

Every field on the material purchase order screen. The **?** next to a field in the app links straight to its description here.

| Field | Required | What to enter |
|-------|----------|---------------|
| [Supplier](#field-supplier) | Required | Who you are buying from |
| [Order date](#field-order-date) | Optional | The date of the order |
| [Notes](#field-notes) | Optional | Notes for the whole order |
| [Material](#field-material) | Required | The material being ordered |
| [Receiving plant](#field-plant) | Optional | Where it will be received |
| [Quantity](#field-quantity) | Required | How much to order |
| [Unit](#field-unit) | Required | Pieces, kg and so on |
| [Unit price](#field-unit-price) | Required | Price per unit |
| [Expected arrival](#field-expected-date) | Optional | When it is due |
| [Line notes](#field-item-notes) | Optional | Notes for that material only |

### Supplier [#field-supplier]

Who you are buying the material from. If they are not listed, register them in the [business partner master](/manual/en/operations/masters/business-partner/user).

### Order date [#field-order-date]

The date of the order. You may leave it blank — when it is empty, the day you press 「発注」 (Order) is filled in automatically.

### Notes [#field-notes]

Notes about the order as a whole. Anything specific to one material belongs in the line notes.

### Material [#field-material]

The material being ordered. If the order was created from a purchase request, the request's contents are carried over.

### Receiving plant [#field-plant]

The plant that receives the material. **Recording the arrival increases stock at this plant.** If it is not decided yet, you may leave it blank.

### Quantity [#field-quantity]

How much to order. **Arrivals can be recorded in parts** when the delivery arrives across several shipments.

### Unit [#field-unit]

Pieces, kg, m and so on. Choosing the material fills in its default unit.

### Unit price [#field-unit-price]

The price per unit. **This amount is used as the reference material price in trial estimates**, so enter the real transaction price.

### Expected arrival [#field-expected-date]

The date the material is due, as agreed with the supplier.

### Line notes [#field-item-notes]

Notes for that material only. Notes about the whole order go in the notes field above.

## Questions and problems

**Q. The 「編集」 (Edit) button does not appear.**
A. You can only change a purchase order while it is 「下書き」 (draft). Once approval has been requested, you cannot change it. If you try anyway, the screen shows 「**下書きの素材発注書のみ編集できます**」 (Only material purchase orders that are drafts can be edited). If you need to change it, ask the approver to send it back to you.

**Q. The 「承認」 (Approve) and 「差し戻し」 (Send back) buttons do not appear.**
A. Only people in that step's approval group (or a stand-in for them) can approve. Instead of the buttons, the screen shows 「**◯◯ のメンバーのみ承認・差し戻しできます**」 with the group name (Only members of that group can approve or send back).

**Q. I see 「仕入先を選択してください」 (Please select a supplier) and cannot save.**
A. The supplier is still empty. Click the 「仕入先」 (supplier) box and choose a company from the list.

**Q. I want to cancel an order that has already been placed.**
A. 「発注済」 (ordered) and 「入荷完了」 (receiving complete) cannot be cancelled. You can only cancel before the order is placed (draft, pending approval, or approved). If you try anyway, the screen shows 「**発注前の素材発注書のみキャンセルできます**」 (Only material purchase orders before ordering can be cancelled).

**Q. The material arrived in several deliveries.**
A. Register just the part that arrived in [material receipt](/manual/en/operations/purchasing/material-receipt/user). When everything has arrived, press 「入荷完了」 (Receiving complete) and the rest is handled together.

**Q. I see 「未入荷の明細がありません」 (There are no line items still to arrive).**
A. All the quantity is already treated as arrived. There is nothing left to do on this purchase order.

<!-- permissions:start -->
## Permissions required

Using this screen requires the **Purchasing** (`purchase_order`) permission.

| What you want to do | Permission needed |
| --- | --- |
| Open the screen, view lists and details | Purchasing — View |
| Add, change or delete | Purchasing — Create / Edit / Delete |

Viewing only needs *View*. Where a screen offers adding, changing or deleting, each of those needs its matching permission.

Permissions come through roles. If something is missing, ask an administrator.

For the whole picture see [Permissions and roles](../../../permissions).
<!-- permissions:end -->
