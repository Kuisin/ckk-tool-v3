# Billing Closing — User Manual

Operation code **BL02**. A monthly process that aggregates uninvoiced shipments by each customer's closing day (締日) and generates invoices.

> This app is currently available **in the development (dev) environment only**. Screens and steps may change before the production release.

## What you can do with this app

This app performs the once-a-month "closing". It aggregates the target month's uninvoiced shipments (**shipped × dispatch** [shipping orders](/docs/apps/shipping-order/user)) per customer into closing rows, then generates draft [invoices](/docs/apps/invoice/user) from them.

- Shipments of type "stock storage" are outside the billing flow and are not included.
- Shipments already on an invoice's line items are no longer "uninvoiced", so double billing cannot happen.
- Using this app requires the billing-closing permission (billing_closing).

## How the closing day is determined

- Each customer's closing day comes from the **締日** (closing day) setting in the [customer](/docs/masters/customer/user) master (month-end when not set).
- Shipments after the closing day are excluded from that month's closing and treated as next month's.

## Running the closing

1. Press **締日処理を実行** (Run closing) at the top right of the list page.
2. Choose the target **year and month** and press **実行** (Run).
3. The month's uninvoiced shipments are aggregated per customer, and **pending (未処理 / PENDING)** rows are created or updated (the counts of created / updated / skipped-as-processed rows are shown).
4. Running it repeatedly is safe: processed rows are skipped, and pending rows have their amounts refreshed.
5. Depending on server configuration, the current month's run may also happen automatically every morning.

## Generating invoices

1. Open a closing row from the list to review the target shipments (shipping order number, ship date, quantity, amount).
2. Press **請求書を生成** (Generate invoice): a draft invoice is created from the target shipments' line items and the row becomes **processed (処理済 / PROCESSED)**. You are taken straight to the generated invoice's detail page.
3. Consumption tax and the payment due date are calculated automatically from the customer master's tax type and payment terms.
4. Subsequent issuing, sending, payment recording, and Yayoi accounting CSV export are done in the [invoice](/docs/apps/invoice/user) app.

## Statuses

- **Pending (未処理 / PENDING)**: a closing row has been created; an invoice can be generated.
- **Processed (処理済 / PROCESSED)**: an invoice has been generated; jump to it via "生成請求書" on the detail page.
- The Yayoi CSV export status is recorded on the invoice side (Yayoi export timestamp).

## List and search

- Search by customer name and filter by status. Click a row to open the detail page.
