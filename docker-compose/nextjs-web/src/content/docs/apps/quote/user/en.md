# Quote — User Manual

Operation code **SA02**. Creates and issues quotes for customers. Unit prices resolve automatically from the price list.

## What you can do here

Create the **quote** you send to a customer and issue it as a PDF. When you add a product and quantity to a line item, the unit price fills in automatically from the **Price List (SA01)**.

- If a price list is already registered, just pick the product and quantity and the amount is calculated.
- Discounts and delivery dates can be set per line item.
- After creating it, export a PDF to send to the customer, and track progress via status (Draft → Issued → Accepted, etc.).

## Creating a quote

1. Click **New** in the list.
2. Choose the **customer** (and a **branch** if needed).
3. Add **line items**. For each row enter:
   - **Product**, **order type**, and **quantity**.
   - The **unit price** is auto-filled from the price-list tier for customer × product × order type × quantity (can be overridden).
   - Optionally a **discount amount**. Amount = unit price × quantity − discount.
   - The **delivery date**.
4. The total amount is shown at the bottom.

## Issuing

- **Save** stores a draft (DRAFT).
- The **PDF** button generates the quote PDF.
- After presenting it to the customer, set the status to **ISSUED**. You can then record **ACCEPTED** / **REJECTED** / **EXPIRED**.

## Validity

- A quote can have a validity date. A quote past its date can be treated as EXPIRED.

## List & search

- Filter by quote number (QOT-YYYYMM-NNNNN), customer, validity, and status.
