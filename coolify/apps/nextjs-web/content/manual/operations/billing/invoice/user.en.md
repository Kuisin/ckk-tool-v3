---
title: "Invoice — User Manual"
description: "Check the invoice you send to a customer for payment, and record issuing, sending, and payment received."
screenshots: [invoice-list-01, invoice-detail-01, invoice-items-01, invoice-menu-01, invoice-sent-01]
---
This app is where you check the **invoice** (請求書) you send to a customer to ask for payment, and record everything from issuing it to receiving the money. The operation code is `BL01`.

> ⚠️ This app is still being prepared. Screens and steps may change before it is fully released.

## What you can do with this app

- Check what is on an invoice (what, how many, and for how much).
- Turn the invoice into a **PDF** to print it or send it by email.
- Record, one step at a time, "issued", "sent", and "money received".
- Download a file that can be read into the accounting software.

There is no "New" button in this app. Invoices are made for you by [monthly billing close](/manual/en/operations/billing/billing-closing/user).

## Words used on this page

- **請求期間 (billing period)** … The period you are billing for — "everything sent between this date and that date".
- **小計 (subtotal)** … The amount before consumption tax is added.
- **消費税 (consumption tax)** … The tax on the subtotal. It is worked out for you using the rule set for each customer.
- **合計金額（税込） (total with tax)** … The subtotal plus the tax — the amount the customer actually pays.
- **支払期限 (payment due date)** … The date by which the customer should pay.
- **由来 (source)** … Shows which [shipping order](/manual/en/operations/shipping/delivery-order/user) or [delivery note](/manual/en/operations/shipping/delivery-note/user) a line came from.

## Before you start

- You cannot make an invoice in this app. First use [monthly billing close](/manual/en/operations/billing/billing-closing/user) and press "請求書を生成" (Generate invoice).
- You need invoice permission to issue an invoice or move it to the next step.
- To download the file for the accounting software, you also need the export permission from monthly billing close. If you cannot use it, please ask your administrator.

## How to read the screen

When you open the app, you see a list of the invoices made so far.

![Invoice list screen](../../../assets/screenshots/invoice-list-01.png)

- **請求番号 (Invoice number)** … A number that starts with `INV-`. The system adds it for you.
- **状態 (Status)** … Grey is 「下書き」 (Draft), blue is 「発行済」 (Issued), purple is 「送付済」 (Sent), green is 「支払済」 (Paid).
- In the search box at the top you can type an invoice number or a customer name to narrow the list.
- Click a row to open the detail screen for that invoice.
- When there are none yet, you see 「**請求書がありません（締日処理から生成します）**」 (No invoices — generate them from monthly billing close).

## Checking the contents

![Invoice detail screen](../../../assets/screenshots/invoice-detail-01.png)

At the top you see the invoice number, customer, billing period, subtotal, consumption tax, total with tax, payment due date, and issue date.

- **支払期限 (Payment due date)** … Filled in for you: the cut-off date plus the number of days agreed with that customer (30 days if nothing was agreed).
- **弥生エクスポート (Yayoi export)** … The date and time the file for the accounting software was made. If it has not been made yet, it shows 「**未エクスポート**」 (Not exported).

The 「明細」 (Lines) area below lists each line you are billing.

![Invoice lines](../../../assets/screenshots/invoice-items-01.png)

- **摘要 (Description)** … The product name and lot number.
- **由来 (Source)** … Click the blue text to open the [shipping order](/manual/en/operations/shipping/delivery-order/user) or [delivery note](/manual/en/operations/shipping/delivery-note/user) it came from.
- At the bottom you see the subtotal, the consumption tax, and the total with tax.

Below the lines there are four tabs. 「**概要**」 (Overview) shows the date and time it was sent to the customer plus the notes, 「**PDF**」 shows the invoice PDF after issuing, 「**メモ**」 (Memo) holds a shared internal memo, and 「**履歴**」 (History) shows who moved this invoice along and when.

> 💡 If you want to make sure the amount is right, open the original shipping order from the "由来" (Source) link — you can check there and then how many pieces were sent and when.

> 💡 The tax box shows the rate that applies to that customer — 「**消費税（10%）**」 (Consumption tax (10%)), 「**消費税（8%）**」 (8%), or 「**消費税（非課税）**」 (tax exempt). The rate comes from the customer's registered details.

## Recording from issue to payment

An invoice moves through four stages: 「下書き」 (Draft) → 「発行済」 (Issued) → 「送付済」 (Sent) → 「支払済」 (Paid). There is no editing on this screen; you work from the 「**…**」 button (the three dots) at the top right.

![The "…" menu on the detail screen](../../../assets/screenshots/invoice-menu-01.png)

### 1. Issue it

1. Press 「**…**」.
2. Choose 「**発行**」 (Issue).
3. 「発行の確認」 (Issue check) appears. Press 「**発行**」 (Issue).

Today's date is recorded as the **発行日 (issue date)**.

### 2. When you have sent it to the customer

1. Press 「**…**」.
2. Choose 「**送付済みにする**」 (Mark as sent).
3. A check window appears. Press 「**送付済みにする**」 (Mark as sent).

![Sent check window](../../../assets/screenshots/invoice-sent-01.png)

### 3. When you have confirmed the payment

1. Press 「**…**」.
2. Choose 「**入金済みにする**」 (Mark as paid).
3. A check window appears. Press 「**入金済みにする**」 (Mark as paid).

The status becomes 「**支払済**」 (Paid) and that invoice is finished.

## Printing (PDF)

You can see the PDF **only after issuing**. While it is a draft the PDF has not been made yet, and the 「**PDF**」 tab shows 「発行後に PDF を閲覧できます。」 (the PDF can be viewed after issuing).

After issuing, press 「**PDF**」 at the top right of the screen and the invoice PDF opens in another tab; from there you can print it or save it. The 「**PDF**」 tab also shows it right on the screen.

## Making the file for the accounting software

You can download a file for the accounting team to read into the accounting software (弥生会計 Next / Yayoi Kaikei Next).

1. On the invoice screen, press 「**…**」 at the top right.
2. Choose 「**弥生会計CSV**」 (Yayoi accounting CSV).
3. The file is downloaded — read it into the accounting software.

After you make it, the date and time appear in the 「**弥生エクスポート**」 (Yayoi export) box on the detail screen.

## Input fields

This screen has no input boxes. Invoices are **created together by the closing run**, so amounts and lines are never typed by hand.

| Action | What happens |
|--------|--------------|
| [Issue](#field-issue) | The contents of the invoice are fixed |
| [Mark as sent](#field-sent) | Records that it went to the customer |
| [Mark as paid](#field-paid) | Records that payment arrived |

### Issue [#field-issue]

Fixes the invoice after you have checked it. The invoice number is already there — it was given when the closing run generated the invoice. **Issuing fixes the contents; they can no longer be changed.** If you spot a mistake, go back to the shipment or the closing run to correct it.

### Mark as sent [#field-sent]

Records that it went to the customer. How it is sent (email, fax, post) is set per customer.

### Mark as paid [#field-paid]

Records that payment arrived, so unpaid invoices can be found.

The amounts are **collected automatically from shipping orders (dispatches that have been shipped)**. Delivery notes are attached as each line's "source" link. If an amount does not add up, check the shipping side rather than this screen.

## Questions and problems

**Q. I cannot find a 「新規作成」 (New) button.**
A. Invoices are not made on this screen. Open [monthly billing close](/manual/en/operations/billing/billing-closing/user) and press "請求書を生成" (Generate invoice) on the row you want.

**Q. I want to fix an amount, but there is no edit screen.**
A. Invoices cannot be fixed directly. Something is probably wrong on the original [shipping order](/manual/en/operations/shipping/delivery-order/user), so please talk to the accounting or sales person in charge.

**Q. I get 「下書きの請求書のみ発行できます」 (Only draft invoices can be issued).**
A. That invoice has already been issued. Close the screen and open it again to see where it stands now.

**Q. I get 「発行済みの請求書のみ送付済みにできます」 (Only issued invoices can be marked as sent).**
A. A step has been skipped. Please go in order: issue → mark as sent → mark as paid.

**Q. The consumption tax does not look like it was worked out at 10%.**
A. The tax is worked out with the rule set for each customer. Customers on the reduced rate are 8%, and tax-free customers are 0%. To change the rule, fix the registered details of the [customer](/manual/en/operations/masters/business-partner/user).

**Q. I press 「弥生会計CSV」 but no file comes out.**
A. You may not have the export permission. Please ask your administrator.

<!-- permissions:start -->
## Permissions required

Using this screen requires the **Invoice** (`invoice`) permission.

| What you want to do | Permission needed |
| --- | --- |
| Open the screen, view lists and details | Invoice — View |
| Add, change or delete | Invoice — Create / Edit / Delete |

Viewing only needs *View*. Where a screen offers adding, changing or deleting, each of those needs its matching permission.

Permissions come through roles. If something is missing, ask an administrator.

For the whole picture see [Permissions and roles](../../../permissions).
<!-- permissions:end -->
