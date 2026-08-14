---
title: "Delivery Note — User Manual"
description: "Operation code SH02. Create delivery notes (納品書, DRN-YYYYMM-NNNNN) from shipping orders, manage issuing and delivery,…"
screenshots: []
---
Operation code **SH02**. Create delivery notes (納品書, DRN-YYYYMM-NNNNN) from shipping orders, manage issuing and delivery, and output PDFs.

> This app is currently available **in the development (dev) environment only**. Screens and steps may change before the production release.

## What you can do with this app

Create the **delivery note (納品書)** that accompanies shipped products. When you pick a [shipping order](/manual/en/apps/shipping-order/user) (confirmed or shipped), the recipient and line items are filled in automatically.

- The recipient is determined automatically from the shipping order → sales order's [customer](/manual/en/masters/customer/user) (plus branch) and cannot be changed.
- You can choose the delivery method (normal delivery / direct to end user) and whether prices are printed.
- A delivery note PDF can be generated for enclosure or sending.
- Using this app requires the delivery-note permission (delivery_note).

## Delivery methods and price printing

- **Normal delivery (通常納品)**: the usual pattern — the delivery note is enclosed for the ordering customer. Price printing defaults to "on".
- **Direct to end user (ユーザー直送)**: the shipment goes straight to the [end user](/manual/en/masters/end-user/user). Selecting the **destination (end user)** is required, and price printing defaults to "off".
- When price printing is "off", unit prices and amounts are not saved and do not appear on screen or in the PDF.

## Creating a delivery note

1. Press **新規作成** (Create) on the list page (you can also start from **納品書を作成** on a shipping order's detail page — the shipping order is then preselected).
2. Select the **shipping order**. Line items (product, quantity, unit price = the sales order's unit price) are filled in automatically.
3. Set the **delivery method** and **price printing**. For direct-to-user delivery, choose the **destination (end user)**.
4. Line items can be edited, but you cannot register products that are not on the shipping order or quantities exceeding the shipped quantity.
5. Saving creates a **draft**. The shipping order and recipient cannot be changed after creation.

## Statuses and actions

Actions are in the menu at the top right of the detail page.

- **Draft (下書き / DRAFT)**: editable. When ready, press **発行** (Issue) — after issuing it can no longer be edited.
- **Issued (発行済 / ISSUED)**: once it reaches the customer, press **納品済みにする** (Mark delivered). The delivery date is recorded as today.
- **Delivered (納品済 / DELIVERED)**: final state.

- The **PDF** button outputs the delivery note PDF at any time.

## Relation to billing

- The delivery note number appears as a linked "source" on [invoice](/manual/en/apps/invoice/user) line items (the invoice itself is generated from shipping orders by the [billing closing](/manual/en/apps/billing-closing/user)).

## List and search

- Search by delivery number, shipping order number, or recipient; filter by delivery method and status.
- Click a row to open the detail page.
