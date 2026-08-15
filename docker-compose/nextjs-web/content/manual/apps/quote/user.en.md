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

To make a quote, **the [price list](/manual/en/apps/price-list/user) for that customer and that product must already be registered**. Without a price list the amount cannot be calculated, so the quote cannot be saved.

If there is no price list yet, first work out the unit price in [Trial Estimate](/manual/en/apps/trial-estimate/user), then register it in the [price list](/manual/en/apps/price-list/user).

## Reading the screen

When you open the app, you see a list of the quotes made so far.

![Quote list screen](../../assets/screenshots/quote-list-01.png)

- **見積番号 (quote number)** … a number starting with `QOT-`. The system adds it for you.
- **状態 (status)** … a colored badge shows where the quote stands. Gray is 「下書き」(draft), blue is 「発行済」(issued), green is 「受諾済」(accepted).
- Type a quote number or a customer name in the search box at the top to narrow down the list.
- Click a row to open the detail screen for that quote.

## Making a quote

1. Press「**新規作成**」(New) at the top right of the list screen.
2. Click the「**顧客**」(customer) field and choose the customer.
3. If the customer has branches, also choose「**支店**」(branch). If there are none, just leave it.
4. Enter the date this quote is valid until in「**有効期限**」(valid until). You can leave it empty and still save.
5. On the line item row, choose「**製品**」(product),「**注文種別**」(order type) and「**数量**」(quantity).
6. As you enter them, **the unit price, discount and amount appear automatically**. You do not need to correct the amount by hand.
7. If a delivery date is fixed for the product, also enter「**納期**」(delivery date).
8. To add another row, press「**明細を追加**」(add line item).
9. Finally press「**保存**」(save).

![New quote form](../../assets/screenshots/quote-new-01.png)

Once saved, the quote is registered as 「下書き」(draft) and the detail screen opens.

> 💡 Amounts come automatically from the price list for that customer. To change a price, do not change it here — change the [price list](/manual/en/apps/price-list/user) instead.

> ⚠️ If a row shows「**価格表なし**」(no price list) in red, there is no price list yet for that customer and that product. The quote cannot be saved as it is, so register the price list first.

## Checking the contents

The screen of a saved quote has four tabs.

![Quote detail screen](../../assets/screenshots/quote-detail-01.png)

- **明細 (line items)** … the list of products, pieces and amounts. The subtotal, consumption tax and total are shown below.
- **PDF** … after issuing, you can view or download the PDF here.
- **関連 (related)** … you can check which price list and which trial estimate the amounts came from.
- **履歴 (history)** … the record of who changed what, and when.

## Issuing (making it ready for the customer)

1. Press「**…**」(the three-dot button) at the top right of the quote screen.
2. Choose「**発行**」(issue).
3. A small window called「見積書の発行」(issue quote) appears. Check the **有効期限 (valid until)** date.
4. If you want to send it to the customer by email, tick「**発行後に顧客へメール送付する**」(send to the customer by email after issuing).
5. Press「**発行**」(issue).

![Quote issue screen](../../assets/screenshots/quote-issue-01.png)

After issuing, the status changes to「**発行済**」(issued) and **the PDF is made for you automatically**.

![PDF tab](../../assets/screenshots/quote-pdf-01.png)

Open the PDF tab to view the finished quote, or download it and print it.

## Recording what happens after issuing

When the customer replies, change the status of the quote to keep a record.

1. Press「**編集**」(edit) at the top right.
2. Choose a new value in the「**状態**」(status) field.
   - You received the order → 「**受諾済**」(accepted)
   - The customer declined → 「**却下**」(rejected)
   - The date has passed → 「**期限切れ**」(expired)
3. Press「**保存**」(save).

> 💡 If you enter this quote number while working on an [order acceptance](/manual/en/apps/order-acceptance/user), the quote becomes 「受諾済」(accepted) automatically. You do not need to change it by hand.

## Making a similar quote

When a new quote is almost the same as an old one, you can copy it instead of typing it again.

1. Open the quote you want to copy.
2. From「**…**」at the top right, press「**複製**」(duplicate).
3. A draft with the same contents is created. Change only what you need and save.

A new quote number is added automatically.

## Questions and problems

**Q. I cannot type a number into the amount field.**
A. Amounts cannot be typed in by hand on a quote. They come automatically from the [price list](/manual/en/apps/price-list/user) for that customer. To change a price, change the price list.

**Q. It says「該当する価格表がありません」(no matching price list) and I cannot save.**
A. The price list for that customer and that product is not registered yet. First work out the unit price in [Trial Estimate](/manual/en/apps/trial-estimate/user), register it in the [price list](/manual/en/apps/price-list/user), and try again.

**Q. I changed the customer and the amount changed.**
A. That is normal. Prices are decided per customer, so when you change the customer, the amounts are calculated again with that customer's price list.

**Q. The valid-until date has passed but the status is still「発行済」(issued).**
A. The status does not change by itself when the date passes. Use「編集」(edit) to change it to「期限切れ」(expired).

**Q. I increased the quantity and the unit price went down.**
A. That is normal. If the price list is set so that a larger order makes each piece cheaper, the unit price changes with the quantity.

**Q. I issued a quote by mistake.**
A. There is no way to undo an issue. If the contents are wrong, make a new quote with the correct contents (duplicating is handy) and set the wrong one to「却下」(rejected) so it is easy to tell apart.
