---
title: "Quote — User Manual"
description: "An app for making the quote you send to a customer and issuing it as a PDF. Amounts are calculated for you."
screenshots: [quote-list-01, quote-new-01, quote-detail-01, quote-issue-01, quote-pdf-01]
---
This app makes the **見積書 (quote)** you send to a customer, and issues it as a PDF. The operation code is `SA03`.

## What you can do with this app

- You can make the quote you send to a customer.
- Just pick the product and the number of pieces, and **the amount is calculated for you** (no calculator needed).
- You can turn the finished quote into a **PDF**, then print it or send it by email.
- You can record where the quote stands now — for example "still being considered" or "we got the order".
- If a new quote is almost the same as an old one, you can **copy** it instead of typing it again.

## Words used on this page

- **Line item**「明細」… one row inside the quote. It says which product and how many pieces.
- **Order type**「注文種別」… the class of the order, such as 本番 (production), テスト (test), or サンプル (sample). The same product can have a different price for each class.
- **Price list**「価格表」… a register where the price of each product is stored per customer. The amounts on a quote come from here automatically.
- **下書き (draft) / 発行済 (issued)** … 下書き means the quote is still inside your company only. 発行済 means it is ready to give to the customer.

## Before you start

To make a quote, **the [price list](/manual/en/operations/sales/price-list/user) for that customer and that product must already be registered**. Without a price list the amount cannot be calculated, so the quote cannot be saved.

If there is no price list yet, first work out the unit price in [Trial Estimate](/manual/en/operations/sales/trial-estimate/user), then register it in the [price list](/manual/en/operations/sales/price-list/user).

## Reading the screen

When you open the app, you see a list of the quotes made so far.

![Quote list screen](../../../assets/screenshots/quote-list-01.png)

- **見積番号 (quote number)** … a number starting with `QOT-`. The system adds it for you.
- **状態 (status)** … a colored badge shows where the quote stands. Gray is 「下書き」(draft), blue is 「発行済」(issued), green is 「受諾済」(accepted).
- Type a quote number or a customer name in the search box at the top to narrow down the list.
- Click a row to open the detail screen for that quote.

## Making a quote

1. Press「**新規作成**」(New) at the top right of the list screen.
2. Click the「**顧客**」(customer) field and choose the customer.
3. If the customer has branches, also choose「**支店**」(branch). If there are none, just leave it.
4. Check「**営業担当**」(sales rep). Choosing the customer fills in their primary rep automatically — change it if needed.
5. Enter the date this quote is valid until in「**有効期限**」(valid until). You can leave it empty and still save.
6. On the line item row, choose「**製品**」(product),「**注文種別**」(order type) and「**数量**」(quantity).
7. As you enter them, **the unit price, discount and amount appear automatically**. You do not need to correct the amount by hand.
8. If a delivery date is fixed for the product, also enter「**納期**」(delivery date).
9. To add another row, press「**明細を追加**」(add line item).
10. Finally press「**保存**」(save).

![New quote form](../../../assets/screenshots/quote-new-01.png)

Once saved, the quote is registered as 「下書き」(draft) and the detail screen opens.

> 💡 Amounts come automatically from the price list for that customer. To change a price, do not change it here — change the [price list](/manual/en/operations/sales/price-list/user) instead.

> ⚠️ If a row shows「**価格表なし**」(no price list) in red, there is no price list yet for that customer and that product. The quote cannot be saved as it is, so register the price list first.

## Checking the contents

The screen of a saved quote has five tabs.

![Quote detail screen](../../../assets/screenshots/quote-detail-01.png)

- **明細 (line items)** … the list of products, pieces and amounts. The subtotal, consumption tax and total are shown below.
- **PDF** … after issuing, you can view or download the PDF here.
- **関連 (related)** … you can check which price list and which trial estimate the amounts came from.
- **メモ (memo)** … you can leave internal notes about this quote.
- **履歴 (history)** … the record of who changed what, and when.

## Issuing (making it ready for the customer)

1. Press「**…**」(the three-dot button) at the top right of the quote screen.
2. Choose「**発行**」(issue).
3. A small window called「見積書の発行」(issue quote) appears. Check the **有効期限 (valid until)** date.
4. If you want to send it to the customer by email, tick「**発行後に顧客へメール送付する**」(send to the customer by email after issuing).
5. Press「**発行**」(issue).

![Quote issue screen](../../../assets/screenshots/quote-issue-01.png)

After issuing, the status changes to「**発行済**」(issued) and **the PDF is made for you automatically**.

![PDF tab](../../../assets/screenshots/quote-pdf-01.png)

Open the PDF tab to view the finished quote, or download it and print it. After issuing, you can also save it from「**PDFをダウンロード**」(download PDF) in the「**…**」menu at the top right.

## Recording what happens after issuing

When the customer replies, change the status of the quote to keep a record.

1. Press「**編集**」(edit) at the top right.
2. Choose a new value in the「**状態**」(status) field.
   - You received the order → 「**受諾済**」(accepted)
   - The customer declined → 「**却下**」(rejected)
   - The date has passed → 「**期限切れ**」(expired)
3. Press「**保存**」(save).

> 💡 If you enter this quote number while working on an [order acceptance](/manual/en/operations/sales/order-acceptance/user), the quote becomes 「受諾済」(accepted) automatically. You do not need to change it by hand.

## Making a similar quote

When a new quote is almost the same as an old one, you can copy it instead of typing it again.

1. Open the quote you want to copy.
2. From「**…**」at the top right, press「**複製**」(duplicate).
3. A draft with the same contents is created. Change only what you need and save.

A new quote number is added automatically.

## Input fields

Every field on the quote screen. The **?** next to a field in the app links straight to its description here.

| Field | Required | What to enter |
|-------|----------|---------------|
| [Customer](#field-customer) | Required | The customer the quote is for |
| [Branch](#field-customer-branch) | Optional | The branch it is addressed to, if any |
| [Sales rep](#field-sales-rep) | Optional | Your company's sales rep for this quote |
| [Valid until](#field-valid-until) | Optional | Last day the quote is valid |
| [Status](#field-status) | — | Where the quote stands now |
| [Product](#field-product) | Required | The product being quoted |
| [Order type](#field-order-type) | Required | Production, test, sample or other |
| [Quantity](#field-quantity) | Required | Number of pieces |
| [Unit price (price list)](#field-unit-price) | Automatic | Filled in from the price list |
| [Discount (automatic)](#field-discount) | Automatic | Result of the price list's discount rules |
| [Delivery date](#field-delivery-date) | Optional | Planned delivery date for that line |
| [Notes](#field-notes) | Optional | Internal notes |

### Customer [#field-customer]

The customer the quote is for. **The unit price comes from this customer's price list**, so choose it first. Changing the customer means the prices on lines you have already entered are resolved again.

### Branch [#field-customer-branch]

The branch the quote is addressed to. If no branch is registered for that customer you cannot choose one — leaving it empty is fine.

### Sales rep [#field-sales-rep]

Your company's sales person in charge of this quote. Choosing the customer fills in that customer's primary rep automatically. If needed, you can pick someone else from the people registered as that customer's reps.

### Valid until [#field-valid-until]

The last day this quote is valid. Past that date the quote can be treated as expired in the list. It may be left empty.

### Status [#field-status]

Where the quote stands now. A new quote starts as a draft. To make it ready for the customer, use **Issue** on the screen rather than changing this field.

### Product [#field-product]

The product being quoted. Choosing it fills in the unit price that matches the customer, order type and quantity. **If the product is not in the price list, no price is filled in and a warning appears.**

### Order type [#field-order-type]

Production, test, sample or other. **The price differs by type even for the same product**, so choose the one that matches the real order. (For samples, the practice is to set the unit price to zero in the price list.)

### Quantity [#field-quantity]

The number of pieces. Where the price list sets prices by quantity range, the unit price changes with the quantity you enter.

### Unit price (price list) [#field-unit-price]

Filled in automatically from the price list. **It cannot be typed in.** To change the amount, adjust the base price or the quantity settings on the price list instead.

### Discount (automatic) [#field-discount]

The amount deducted automatically when a discount rule on the price list applies. This cannot be typed in either.

### Delivery date [#field-delivery-date]

The planned delivery date for that line. It can be set per line, and left empty if not yet decided.

### Notes [#field-notes]

Internal notes. They do not appear on the quote PDF.

## Questions and problems

**Q. I cannot type a number into the amount field.**
A. Amounts cannot be typed in by hand on a quote. They come automatically from the [price list](/manual/en/operations/sales/price-list/user) for that customer. To change a price, change the price list.

**Q. It says「該当する価格表がありません」(no matching price list) and I cannot save.**
A. The price list for that customer and that product is not registered yet. First work out the unit price in [Trial Estimate](/manual/en/operations/sales/trial-estimate/user), register it in the [price list](/manual/en/operations/sales/price-list/user), and try again.

**Q. I changed the customer and the amount changed.**
A. That is normal. Prices are decided per customer, so when you change the customer, the amounts are calculated again with that customer's price list.

**Q. The valid-until date has passed but the status is still「発行済」(issued).**
A. The status does not change by itself when the date passes. Use「編集」(edit) to change it to「期限切れ」(expired).

**Q. I increased the quantity and the unit price went down.**
A. That is normal. If the price list is set so that a larger order makes each piece cheaper, the unit price changes with the quantity.

**Q. I issued a quote by mistake.**
A. There is no way to undo an issue. If the contents are wrong, make a new quote with the correct contents (duplicating is handy) and set the wrong one to「却下」(rejected) so it is easy to tell apart.
