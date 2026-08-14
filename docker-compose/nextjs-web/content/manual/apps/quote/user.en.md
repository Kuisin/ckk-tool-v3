---
title: "Quote — User Manual"
description: "Operation code SA02. Creates and issues quotes for customers. Unit prices and discounts resolve automatically from the price list."
screenshots: [quote-list-01, quote-detail-01]
---
Operation code **SA02**. Creates and issues quotes for [customers](/manual/en/masters/customer/user). Unit prices and discounts resolve automatically from the price list.

## What you can do here

Create the **quote** you send to a customer and issue it as a PDF. When you add a [product](/manual/en/masters/product/user), order type, and quantity to a line item, the unit price and discount fill in automatically from the **Price List (SA01)**.

- The unit price resolves from the price-list quantity tier for customer × product × order type × quantity (base price × multiplier, or the tier's manual override). **There is no manual price entry on the quote** — change prices on the price list instead.
- The price list's **discount rules** (period/quantity conditions) also apply automatically (when several match, the one with the largest discount wins).
- The delivery date can be set per line. Subtotal, tax (10%), and total (incl. tax) are shown at the bottom.

![Quote list](../../assets/screenshots/quote-list-01.png)

## Creating a quote

1. Click **New** in the list.
2. Choose the **customer** (required; a **branch** too if the customer has any) and optionally a **validity date**.
3. Add **line items**. Enter the **product, order type, and quantity** per row and the unit price (from the price list), automatic discount, and amount are displayed. Optionally set the **delivery date**.
4. A row without a price list for that customer × product shows "**no price list**" and cannot be saved — register a [price list](/manual/en/apps/price-list/user) first.
5. **Save** stores a draft (DRAFT) and opens the detail page.

Changing the customer re-resolves every line against the new customer's price list. Prices are also re-resolved and finalized server-side at save time.

## Issuing

- Run **Issue** from the detail page menu. Confirm the validity date in the dialog and the status becomes **ISSUED**, and the **quote PDF is generated and stored** (view, download, or regenerate it on the PDF tab).
- To record **ACCEPTED** / **REJECTED** / **EXPIRED** after issuing, open **Edit** and change the status field. If the quote number was referenced in an [order acceptance (SA03)](/manual/en/apps/order-acceptance/user) deployment, the quote becomes accepted automatically.
- **Duplicate** creates a draft copy (a new number is assigned on save).

![Quote detail (line items tab)](../../assets/screenshots/quote-detail-01.png)

## Validity

- A quote can have a validity date (set at creation, on edit, or in the issue dialog). The status does not change automatically after the date passes — set it to **EXPIRED** via Edit if needed.

## List & search

- The list shows quote number (QOT-YYYYMM-NNNNN) / customer / validity / total / status / updated date. Search by number or customer; filter by customer and status.
- The detail **Related** tab links to the applied price lists and source estimates; the **History** tab keeps the audit trail.
