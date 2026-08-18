---
title: "Monthly Billing Close — User Manual"
description: "Once a month, gather everything sent to each customer and prepare the basis for their invoice."
screenshots: [billing-closing-list-01, billing-closing-run-01, billing-closing-detail-01, billing-closing-generate-01, billing-closing-processed-01]
---
Once a month, this app gathers "everything sent that month" for each customer and prepares the basis for their [invoice](/manual/en/operations/billing/invoice/user). The operation code is `BL02`.

> ⚠️ This app is still being prepared. Screens and steps may change before it is fully released.

## What you can do with this app

- Add up what was sent in a month, **grouped by customer**.
- Check the result (which shipping order was worth how much) before making the invoice.
- Make a draft [invoice](/manual/en/operations/billing/invoice/user) with one button.

Every month, the billing work starts in this app.

## Words used on this page

- **締日 (cut-off date)** … The monthly cut-off date for billing you agreed on: "everything sent up to this day of the month is billed together". For example, "month-end" means everything up to the last day of that month.
- **締日処理 (monthly billing close)** … The work of adding up what was sent, using the cut-off date as the dividing line.
- **未請求 (not yet billed)** … A shipment that is not yet on any invoice.
- **対象出荷 (shipments included)** … The list of shipping orders gathered into that close.
- **合計金額（税抜） (total before tax)** … The total before consumption tax. The tax is added when the invoice is made.

## Before you start

- Only [shipping orders](/manual/en/operations/shipping/shipping-order/user) that are **「出荷済」 (Shipped) and of type 「発送」 (Dispatch)** are added up. Shipping orders still at 「下書き」 (Draft) or 「確定」 (Confirmed) are not included. Please record the shipment first.
- Each customer's cut-off date comes from the registered details of the [customer](/manual/en/operations/masters/business-partner/user). Customers with nothing set are gathered as **month-end**.
- You need monthly billing close permission to run it. If you cannot use it, please ask your administrator.

> ⚠️ Shipping orders of type 「**在庫保管**」 (Keep in stock) are pieces kept in-house, not sent to the customer, so they are not added up. They are not billed either.

## How to read the screen

When you open the app, you see a list of the closes done so far. One row is "one customer's close for one month".

![Monthly billing close list screen](../../../assets/screenshots/billing-closing-list-01.png)

- **顧客 (Customer)** … Which customer the close is for.
- **締日 (Cut-off date)** … The dividing date for that close.
- **合計金額 (Total)** … The amount gathered into that close.
- **状態 (Status)** … Grey is 「未処理」 (Not processed — no invoice made yet), blue is 「処理済」 (Processed — invoice made), green is 「エクスポート済」 (Exported).
- In the search box at the top you can type a customer name to narrow the list.
- Click a row to open the detail screen for that close.

## Running the monthly billing close

1. Press 「**締日処理を実行**」 (Run monthly billing close) at the top right of the list screen.
2. A small window called 「締日処理の実行」 (Run monthly billing close) appears.
3. Choose the month you want to add up in 「**年**」 (Year) and 「**月**」 (Month).
4. Press 「**実行**」 (Run).

![Run monthly billing close window](../../../assets/screenshots/billing-closing-run-01.png)

When it finishes, a count such as "作成 2 件 / 更新 1 件" (2 created / 1 updated) appears at the top right, and the close rows are listed. Rows with no invoice made yet are 「**未処理**」 (Not processed).

> 💡 You can run it as many times as you like for the same month. Rows that already have an invoice stay as they are, and only the remaining rows are updated to the latest amounts. Nobody gets billed twice.

Depending on your company's settings, that month may already be added up by itself every morning. Even then, it is fine to run the steps above again.

## Checking what was gathered

Click a close row in the list to open the detail screen.

![Monthly billing close detail screen](../../../assets/screenshots/billing-closing-detail-01.png)

- At the top you see the customer, cut-off date, total before tax, and status.
- The 「**対象出荷**」 (Shipments included) table lists the gathered shipping orders one per row (shipping order number, shipping date, quantity, amount).
- Click the blue shipping order number to open that [shipping order](/manual/en/operations/shipping/shipping-order/user) and check its contents.
- At the bottom of the table you see the totals for quantity and amount.

If an amount is not what you expected, please check it here before making the invoice.

Below the table there are two tabs. 「**概要**」 (Overview) shows the notes, and 「**履歴**」 (History) shows who moved this close along and when.

## Making the invoice

1. Open the detail screen of the close.
2. Press 「**請求書を生成**」 (Generate invoice) at the top right.
3. 「請求書生成の確認」 (Generate invoice check) appears. Check how many shipments are included.
4. Press 「**請求書を生成**」 (Generate invoice).

![Generate invoice check window](../../../assets/screenshots/billing-closing-generate-01.png)

A draft invoice is made, and you go straight to the [invoice](/manual/en/operations/billing/invoice/user) screen. The consumption tax and the payment due date are filled in for you from the customer's registered details.

The close row becomes 「**処理済**」 (Processed), and from the 「**生成請求書**」 (Generated invoice) box you can open that invoice at any time.

![A processed monthly billing close](../../../assets/screenshots/billing-closing-processed-01.png)

After this, recording the issue, the sending, and the payment — and making the file for the accounting software — is done in the [invoice](/manual/en/operations/billing/invoice/user) app.

## Input fields

This screen has no input boxes. What to close and for which dates follows **the closing day set per customer.**

| Action | What happens |
|--------|--------------|
| [Close](#field-process) | Gathers the period's deliveries and creates invoices |
| [Export to Yayoi](#field-export) | Writes the journal entries out as CSV |

### Close [#field-process]

Gathers what was delivered in the period and creates **one invoice per customer.**

Before closing, check that every delivery in the period has been recorded. **A delivery added afterwards does not join a closed invoice** — it moves to the next period.

### Export to Yayoi [#field-export]

Writes the closed contents out as a CSV the accounting software can import. The export date is kept, which helps avoid importing twice.

## Questions and problems

**Q. I get 「対象月に未請求の出荷がありません」 (There are no unbilled shipments in the target month).**
A. There is not a single shipment in that month that has not been billed yet. Check that the shipping orders are all 「出荷済」 (Shipped) and that the type is 「発送」 (Dispatch).

**Q. I shipped this month, but it is not in the close.**
A. Anything sent **after** the cut-off date goes into the next month's close, not this one. Also, a shipping order that is not 「出荷済」 (Shipped) is not added up.

**Q. I get 「請求対象の出荷がありません」 (There are no shipments to bill) and cannot make the invoice.**
A. The shipments included in that close are empty. Please run 「締日処理を実行」 (Run monthly billing close) again and then try once more.

**Q. I get 「未処理の締日のみ請求書を生成できます」 (Invoices can only be generated for closes that are not processed).**
A. An invoice has already been made from that close. Open the invoice from the 「生成請求書」 (Generated invoice) box and check it.

**Q. I made an invoice by mistake.**
A. There is no way to put a close row back to 「未処理」 (Not processed). Please talk to the accounting person in charge about what to do with the invoice that was made.

**Q. The cut-off date looks wrong for one customer only.**
A. Each customer's cut-off date comes from the registered details of the [customer](/manual/en/operations/masters/business-partner/user). Customers with nothing set become month-end. Fix the registered details and then run the monthly billing close again.
