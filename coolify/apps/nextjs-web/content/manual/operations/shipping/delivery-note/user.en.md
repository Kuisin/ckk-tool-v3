---
title: "Delivery Note — User Manual"
description: "Make the delivery note that goes with the products you ship, turn it into a PDF, and print it."
screenshots: [delivery-note-list-01, delivery-note-new-01, delivery-note-detail-noprice-01, delivery-note-direct-01, delivery-note-issue-01, delivery-note-detail-01]
---
This app makes the **delivery note** (納品書) that goes together with the products you ship. The operation code is `SH02`.

> ⚠️ This app is still being prepared. Screens and steps may change before it is fully released.

## What you can do with this app

- Make the delivery note you hand to the place receiving the goods.
- Just pick a [shipping order](/manual/en/operations/shipping/delivery-order/user), and **the receiver and the contents are filled in for you**.
- Choose whether to **show or hide** the amounts.
- Turn the delivery note into a **PDF** to print it or put it in the box.
- Record where things stand — "issued", "delivered".

## Words used on this page

- **出荷書 (shipping order)** … The document that records what you send and how many. The delivery note is made from it.
- **納品先 (delivery destination)** … The customer who placed the order. It is decided by the shipping order.
- **通常納品 / ユーザー直送 (Normal delivery / Direct to end user)** … "通常納品" means delivering to the customer who ordered. "ユーザー直送" means delivering straight to the company that actually uses the product.
- **最終需要家 (end user)** … The company that actually uses the product. It is the receiver when you deliver direct to the end user.
- **価格記載 (show prices)** … The setting for whether unit prices and amounts appear on the delivery note.

## Before you start

- You need a [shipping order](/manual/en/operations/shipping/delivery-order/user) first. It must also be 「**確定**」 (Confirmed) or 「**出荷済**」 (Shipped). You cannot make a delivery note from a 「下書き」 (Draft) shipping order.
- If you deliver direct to the end user, the receiving company must be registered as a [business partner](/manual/en/operations/masters/business-partner/user) with the 最終需要家 (End user) role.
- You need delivery note permission to make one. If you cannot use it, please ask your administrator.

## How to read the screen

When you open the app, you see a list of the delivery notes made so far.

![Delivery note list screen](../../../assets/screenshots/delivery-note-list-01.png)

- **納品番号 (Delivery number)** … A number that starts with `DRN-`. The system adds it for you.
- **方法 (Method)** … An orange 「ユーザー直送」 (Direct to end user) means it goes straight to the company using the product; a grey 「通常納品」 (Normal delivery) means it goes to the customer.
- **状態 (Status)** … Grey is 「下書き」 (Draft), blue is 「発行済」 (Issued), green is 「納品済」 (Delivered).
- In the search box at the top you can type a delivery number, a shipping order number, or the name of the receiver or the end user to narrow the list.
- The list shows **delivery notes sent from the site you belong to** and **delivery notes you made yourself**.
- Click a row to open the detail screen for that delivery note.

## Making a delivery note

1. Press 「**新規作成**」 (New) at the top right of the list screen.
2. Click the 「**出荷書**」 (Shipping order) box and pick the shipping order.
3. The 「**納品先**」 (Delivery destination) and the lines (product, quantity, unit price) are **filled in for you**. In addition, when the delivery method registered on the order acceptance settles to one, the 「**納品方法**」 (Delivery method) — and the starting value of "show prices" — is filled in too; when the destination company settles to one, the 「**最終需要家**」 (End user) is filled in as well (whatever cannot be settled stays empty).
4. Check the 「**納品方法**」 (Delivery method). If needed, switch it to 「**通常納品**」 (Normal delivery) or 「**ユーザー直送**」 (Direct to end user).
5. If you do not want to show the amounts, turn off the 「**価格記載（納品書に単価・金額を記載する）**」 (Show prices — print unit prices and amounts on the delivery note) switch.
6. If a quantity is different from what you really sent, change the 「**数量**」 (Quantity) on that line.
7. Press 「**保存**」 (Save).

![New delivery note form](../../../assets/screenshots/delivery-note-new-01.png)

After you save, it is registered as a 「**下書き**」 (Draft) and the detail screen opens.

> 💡 If you start from 「**納品書を作成**」 (Create delivery note) on the shipping order screen, the shipping order is already chosen. That way is faster.

## Showing or hiding the amounts

Whether unit prices and amounts appear on the delivery note is decided by the 「**価格記載**」 (Show prices) switch.

- If you choose **通常納品** (Normal delivery), it starts as "show".
- If you choose **ユーザー直送** (Direct to end user), it switches to "hide". This is so the company using the product does not see the amounts.
- When the delivery method was filled in automatically on choosing the shipping order, the starting value of "show prices" is decided by the same rule.
- These starting settings are only a guide — you can change the switch if you need to.

When the switch is off, you cannot type in the unit price boxes. If you save it that way, **no amounts appear on the screen or in the PDF**.

![Delivery note without amounts](../../../assets/screenshots/delivery-note-detail-noprice-01.png)

## Delivering direct to the end user

When you deliver straight to the company that uses the product, do this.

1. In 「**納品方法**」 (Delivery method), press 「**ユーザー直送**」 (Direct to end user).
2. The 「**最終需要家**」 (End user) box appears — pick the receiving company.
3. Everything else is the same as normal delivery.

![Form with Direct to end user chosen](../../../assets/screenshots/delivery-note-direct-01.png)

If you try to save without choosing 「最終需要家」, you get 「**最終需要家を選択してください**」 (Please choose an end user).

## Issuing and delivering

A delivery note moves through three stages: 「下書き」 (Draft) → 「発行済」 (Issued) → 「納品済」 (Delivered). You do this from the 「**…**」 button (the three dots) at the top right of the screen.

### 1. Issue it

1. On the delivery note screen, press 「**…**」 at the top right.
2. Choose 「**発行**」 (Issue).
3. 「発行の確認」 (Issue check) appears. Press 「**発行**」 (Issue).

![Issue check window](../../../assets/screenshots/delivery-note-issue-01.png)

Once issued, the status becomes 「**発行済**」 (Issued) and **you can no longer edit it**.

### 2. When it has arrived

1. Press 「**…**」 at the top right.
2. Choose 「**納品済みにする**」 (Mark as delivered).
3. 「納品の確認」 (Delivery check) appears. Press 「**納品済みにする**」 (Mark as delivered).

Today's date is recorded as the **納品日 (delivery date)** and the status becomes 「**納品済**」 (Delivered).

By the way, this delivery note's number appears later as the "source" on the lines of the [invoice](/manual/en/operations/billing/invoice/user). From the invoice you will be able to open this delivery note right away.

## Printing (PDF)

You can see the PDF **only after issuing**. While it is a draft the PDF has not been made yet, and the 「**PDF**」 tab shows 「発行後に PDF を閲覧できます。」 (the PDF can be viewed after issuing).

- After issuing, the 「**PDF**」 tab shows the PDF right on the screen. To make it again, press 「**再生成**」 (Regenerate).
- Choose 「**PDFをダウンロード**」 (Download PDF) from the 「**…**」 button (the three dots) at the top right of the screen to save it as a file. Print from there.

![Delivery note detail screen](../../../assets/screenshots/delivery-note-detail-01.png)

> ⚠️ There is no delete action for delivery notes. Once made, a delivery note cannot be removed, so please check the contents carefully **while it is still a draft**.

## Input fields

Every field on the delivery note screen. The **?** next to a field in the app links straight to its description here.

| Field | Required | What to enter |
|-------|----------|---------------|
| [Shipping order](#field-delivery-order) | Required | The shipping order it is based on |
| [Delivery method](#field-delivery-method) | Required | To the customer, or direct to the end user |
| [Deliver to](#field-recipient) | Required | Who the note is addressed to |
| [End user](#field-end-user) | Optional | The destination for a direct delivery |
| [Sales rep](#field-sales-rep) | Optional | The sales rep for this delivery note |
| [Show prices](#field-include-price) | — | Whether prices and amounts appear |
| [Notes](#field-notes) | Optional | Notes on the delivery note |
| [Product](#field-product) | Required | The product being delivered |
| [Quantity](#field-quantity) | Required | How many pieces |
| [Unit price](#field-unit-price) | Optional | The price shown on the note |

### Shipping order [#field-delivery-order]

The shipping order this note is based on. Choosing it carries over that shipment's products and quantities. In addition, the delivery method, the end user and the sales rep are filled in automatically when the shipping order side settles each of them to one (when the lines differ and nothing can be settled, they are left empty).

### Delivery method [#field-delivery-method]

- **Normal** — delivered to the customer who ordered, with the note enclosed with the goods
- **Direct to end user** — sent straight to the end user. **The note is sent separately**, and prices are normally hidden

When you choose a shipping order, if the delivery method registered on its order acceptance settles to one, it is filled in here automatically.

### Deliver to [#field-recipient]

Who the note is addressed to: usually the ordering customer, or the destination for a direct delivery.

### End user [#field-end-user]

The actual destination for a direct delivery. Only major customers are registered as end users. When you choose a shipping order and the destination company settles to one, it is filled in automatically (the one named on the order line if any, otherwise the company registered on the order acceptance).

### Sales rep [#field-sales-rep]

The sales rep for this delivery note. When the shipping order's sales rep settles to one person, that person is filled in from the start; otherwise the delivery destination's primary rep is. You can change it if needed.

### Show prices [#field-include-price]

Whether unit prices and amounts appear on the note. **For direct-to-end-user delivery this is normally turned off**, so the end user does not see the trade price.

### Notes [#field-notes]

Notes to appear on the delivery note. **It appears on the delivery note PDF**, so do not write anything the customer should not see.

### Product [#field-product]

The product being delivered, carried over from the shipping order.

### Quantity [#field-quantity]

How many pieces are delivered. The shipping order's quantity is filled in for you. When delivering in parts, change it to what is actually delivered.

### Unit price [#field-unit-price]

The price shown on the note. It is not printed when "show prices" is off.

## Questions and problems

**Q. The shipping order I want does not appear in the box.**
A. You can only pick shipping orders that are 「確定」 (Confirmed) or 「出荷済」 (Shipped). If it is still a 「下書き」 (Draft), first confirm it on the [shipping order](/manual/en/operations/shipping/delivery-order/user) side.

**Q. I want to change the delivery destination to another company, but I cannot choose it.**
A. The delivery destination is decided by the customer on the order line behind the shipping order, so it cannot be changed on this screen. If the receiver is different, make the delivery note again from the correct shipping order.

**Q. I get 「…は出荷書に含まれていません」 (… is not included in the shipping order) and cannot save.**
A. You have put a product on a line that is not on the shipping order. Delete that row, or change it to a product that is on the shipping order.

**Q. I get 「…の数量 60 が出荷数量 50 を超えています」 (Quantity 60 for … is more than the shipped quantity 50) and cannot save.**
A. You have written more pieces than you really sent. Change the quantity so it is not more than the shipping order.

**Q. I saved with the amounts hidden, but now I want to show them.**
A. While it is a 「下書き」 (Draft) you can turn the switch back on with 「編集」 (Edit). The unit prices were not saved, though, so please enter them again. After it is issued you cannot fix it, so make a new one.

**Q. I noticed a mistake after issuing it.**
A. There is no way to undo an issue. Make a new delivery note with the correct contents, and do not hand the wrong one to the customer.

<!-- permissions:start -->
## Permissions required

Using this screen requires the **Delivery note** (`delivery_note`) permission.

| What you want to do | Permission needed |
| --- | --- |
| Open the screen, view lists and details | Delivery note — View |
| Add, change or delete | Delivery note — Create / Edit / Delete |

Viewing only needs *View*. Where a screen offers adding, changing or deleting, each of those needs its matching permission.

Permissions come through roles. If something is missing, ask an administrator.

For the whole picture see [Permissions and roles](../../../permissions).
<!-- permissions:end -->
