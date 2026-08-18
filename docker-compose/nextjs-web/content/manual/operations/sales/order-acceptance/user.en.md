---
title: "Order Acceptance — User Manual"
description: "An app that reads the order form sent by the customer, lets you check it, and takes you through to making the sales orders."
screenshots: [order-acceptance-list-01, order-acceptance-new-01, order-acceptance-detail-01, order-acceptance-detail-03, order-acceptance-detail-02, order-acceptance-deploy-01]
---
The computer reads the order form sent by the customer (a PDF or a scanned image) by itself. You then check the contents, and go on to make the **注文請書 (sales orders)**. The operation code is `SA04`.

> ⚠️ This app is still in trial release. The screens and the steps may change later.

## What you can do with this app

- Load the order form file, and it is registered with **the customer name, the items and the number of pieces already filled in**.
- You can check what was read with your own eyes and correct it before moving on.
- If a unit price differs from the [price list](/manual/en/operations/sales/price-list/user), **the screen tells you**.
- After you get your manager's approval, you can make the **注文請書 (sales orders)** all at once — one per line item.
- If there is no order form file, you can register it by typing it in.

Use this when an order form arrives from a customer by fax or email.

## Words used on this page

- **受注請書 (order acceptance)** … the record of one order received from a customer. This is what this app handles.
- **注文請書 (sales order)** … the internal slip made for each line item of an order acceptance. It is the basis for manufacturing and shipping.
- **明細 (line item)** … one row inside the order. It says which product and how many pieces.
- **伝票展開 (deploy)** … the action of making the sales orders from an order acceptance all at once.
- **価格差異 (price difference)** … when the unit price written on the order form differs from the price on the price list.
- **取込中 (importing) / 下書き (draft) / 承認依頼中 (waiting for approval) / 承認済 (approved) / 展開済 (deployed) / アーカイブ (archived)** … where the order acceptance stands now.

## Before you start

- The customer must be registered in the [business partner master](/manual/en/operations/masters/business-partner/user). Without it, the customer stays 「未特定」(not identified) even after reading the form.
- The ordered [product](/manual/en/operations/masters/product/user) must be registered in the product master.
- Having a [price list](/manual/en/operations/sales/price-list/user) makes checking the unit price easier, but you can go on without one.
- Only people in the approval group can approve or send back.

## Reading the screen

When you open the app, you see the list of the order forms that have been imported.

![Order acceptance list screen](../../../assets/screenshots/order-acceptance-list-01.png)

- **番号 (number)** … a number starting with `ORD-`. It is added automatically when the form is imported.
- **取込元 (source)** … how it was registered. It is one of 「監視フォルダ」(watched folder), 「優先取込」(priority import) or 「手入力」(typed in).
- **顧客 (customer)** … rows with an orange 「未特定」(not identified) badge have no customer decided yet.
- **状態 (status)** … a colored badge shows where it stands now.
- **エラー (error)** … a red 「抽出失敗」(reading failed) badge means the reading did not work.
- The 「監視フォルダ取込」(watched folder import) badge at the top of the screen tells you whether automatic importing is available.
- While a row is still being read, the screen refreshes itself every 30 seconds.

## Importing an order form (three ways)

**1. Put the file in the set folder**

Put the file in the import folder on the server and it is imported automatically. You can use this when the list shows「**監視フォルダ取込: 有効**」(watched folder import: enabled).

**2. Choose a file there and then**

1. Press「**優先取込**」(priority import) at the top right of the list screen.
2. Choose the order form file (PDF, PNG, JPG or WebP; you can choose several at once).
3. The progress is shown at the top right of the screen. It takes about **30 to 60 seconds** per file.

**3. Type it in by hand**

1. Press「**手入力で新規**」(new, typed in) at the top right of the list screen.
2. Choose the「**顧客**」(customer). This one is required.
3. Fill in「**顧客注文書番号**」(customer order form number),「**注文日**」(order date) and so on, as far as you know them.
4. On the line item row, enter「**製品**」(product),「**種別**」(type) and「**数量**」(quantity). You can enter the unit price later.
5. To add another row, press「**明細を追加**」(add line item).
6. Press「**下書きを作成**」(create draft).

![Order acceptance manual entry screen](../../../assets/screenshots/order-acceptance-new-01.png)

## Checking what was read

When the reading finishes, the status becomes「**下書き**」(draft). This is the only time you can change the contents.

1. Click the row you want in the list.
2. In「**基本情報**」(basic information), check the customer, the customer order form number and the order date.
3. If no customer is set, search for one in the「**顧客**」(customer) field and choose it.
4. If the order follows on from a quote, enter the quote number in「**見積書番号（任意）**」(quote number, optional).
5. In「**明細**」(line items), check the product, type, quantity, unit price and delivery date.
6. On a row with an orange「**製品未特定**」(product not identified) badge, choose the correct product in the「**製品**」(product) field.
7. Press「**保存**」(save) at the very bottom of the screen.

![Draft check screen with a price difference warning](../../../assets/screenshots/order-acceptance-detail-01.png)

Press the file name link to open the original order form in another tab and compare it side by side.

> 💡 A row whose unit price differs from the price list shows an orange「**価格差異**」(price difference) badge together with the correct price. A gray「**価格表なし**」(no price list) badge only means there is no price list yet for that customer and product — it is not a mistake.

## Asking for approval

1. After saving the contents, press「**承認依頼**」(request approval) in the「**承認・展開状況**」(approval and deployment status) area.
2. If there is a price difference, a screen called「価格差異の確認」(check the price difference) appears. Check the contents and press「**差異を確認して依頼**」(confirm the difference and request).

The status changes to「**承認依頼中**」(waiting for approval).

![Order acceptance waiting for approval](../../../assets/screenshots/order-acceptance-detail-03.png)

The person who approves presses「**承認**」(approve) or「**差し戻し**」(send back) on this screen. To send it back, they enter a reason and then press「**差し戻す**」(send back). An order acceptance that is sent back returns to 「下書き」(draft), so you correct it and ask for approval again.

> ⚠️ Changes you have not saved are not included in the approval request. Press「**保存**」(save) first.

## Making the sales orders (伝票展開 / deploy)

Once approved, a「**伝票展開**」(deploy) button appears on the screen.

![Approved order acceptance](../../../assets/screenshots/order-acceptance-detail-02.png)

1. Press「**伝票展開**」(deploy).
2. On the confirmation screen, check how many will be made and press「**展開する**」(deploy).

![Deploy confirmation screen](../../../assets/screenshots/order-acceptance-deploy-01.png)

One 注文請書 (sales order) is made per line item. The numbers follow the order acceptance number with `-01`, `-02` and so on. You can open the sales orders that were made from the「**生成された注文請書**」(generated sales orders) links on the screen, or from「**注文請書一覧**」(sales order list) at the top right of the list screen.

If you entered a quote number, that [quote](/manual/en/operations/sales/quote/user) becomes 「受諾済」(accepted) automatically.

When the work is finished, press「**アーカイブ**」(archive) to put it away. Archived records cannot be edited after that.

## Input fields

Every field on the order acceptance screen. What the AI read from the order lands in these fields too, so this is also **where you correct the reading**. The **?** next to a field in the app links straight to its description here.

| Field | Required | What to enter |
|-------|----------|---------------|
| [Customer](#field-customer) | Required | The customer who ordered |
| [Customer order no.](#field-customer-order-ref) | Optional | The number on the customer's own order |
| [Quote number](#field-quote-number) | Optional | The quote it came from |
| [Order date](#field-order-date) | Optional | The date the customer ordered |
| [Notes](#field-notes) | Optional | Notes for the whole acceptance |
| [Product](#field-product) | Required | The product ordered |
| [Item name (as read)](#field-extracted-name) | — | The item name printed on the order |
| [Order type](#field-order-type) | Required | Production, test and so on |
| [Quantity](#field-quantity) | Required | The quantity ordered |
| [Unit price](#field-unit-price) | Required | Price per piece |
| [Delivery date](#field-delivery-date) | Optional | Delivery date for that line |
| [Line notes](#field-item-notes) | Optional | Notes for that line only |

### Customer [#field-customer]

The customer who placed the order. This is detected from the imported order, but **detection can fail** — choose it here when it does. Prices cannot be checked until the customer is known.

### Customer order no. [#field-customer-order-ref]

The number printed on the customer's own order document. It is what you search by when they ask about it later.

### Quote number [#field-quote-number]

The quote this order came from. If it is set, that quote is marked accepted automatically when the order is accepted.

### Order date [#field-order-date]

The date the customer placed the order, as printed on their document.

### Notes [#field-notes]

Notes about the acceptance as a whole. Notes about one line go in that line's own notes.

### Product [#field-product]

The product ordered. **It is matched automatically from the item name, but matching can miss** — choose it by hand when it does. Lines whose product is unresolved cannot move on.

### Item name (as read) [#field-extracted-name]

The item name exactly as printed on the order. It is kept **as a record of what was read**, and is the clue for identifying the product.

### Order type [#field-order-type]

Production, test, sample or other. Prices differ by type.

### Quantity [#field-quantity]

The quantity ordered. Correct it if the reading was wrong.

### Unit price [#field-unit-price]

The price per piece. **If it differs from the price list, the difference is shown on the spot.** When it does, adjust the price on the quote first, then correct it here.

### Delivery date [#field-delivery-date]

The delivery date for that line. If a line has none, the header's requested date is used.

### Line notes [#field-item-notes]

Notes for that line only, such as a revision or custom content.

## Questions and problems

**Q. A red message「自動抽出に失敗しました」(automatic reading failed) appeared.**
A. Reading the order form did not work. Press「**再抽出**」(read again) inside that message to try once more. If it keeps failing, enter it from「**手入力で新規**」(new, typed in) in the list.

**Q. The customer stays 「未特定」(not identified).**
A. The company name on the order form could not be matched to the business partner master. On the draft screen, search for the customer, choose it, and press「保存」(save). For customers whose name is often written in different ways, register the other spellings in the [business partner master](/manual/en/operations/masters/business-partner/user) and they will be matched automatically next time.

**Q. It says「顧客が未特定です。顧客を選択して保存してください」(the customer is not identified; please choose a customer and save) and I cannot request approval.**
A. No customer is set. Choose the「顧客」(customer), press「保存」(save), then press「承認依頼」(request approval) again.

**Q. It says「明細 2 行目: 製品未特定または単価未入力のため展開できません」(line item row 2 cannot be deployed because the product is not identified or the unit price is empty).**
A. The product or the unit price on the row shown is empty. It has to go back to a draft before approval, so ask the person who approved it to do「**差し戻し**」(send back), correct that row, and go on from there.

**Q. The approve button does not appear.**
A. Only people in the approval group can approve or send back. The screen shows 「第一承認グループのメンバーのみ承認・差し戻しできます」(only members of the first approval group can approve or send back). Please ask the person in charge.

**Q. I cannot change the contents of a draft.**
A. You can only change the contents while the status is 「下書き」(draft). You cannot change them while it is waiting for approval, approved or deployed. If you see 「下書きの受注請書のみ編集できます」(only draft order acceptances can be edited), ask for it to be sent back.

**Q. The import does not finish.**
A. Reading takes about 30 to 60 seconds per file. When you choose several files, they are handled one after another, so it takes that much longer.
