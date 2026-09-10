---
title: "Document Creation, Splitting, Merging and Relations"
description: "A reference table showing how each document is created, whether it can be split or merged, and which other documents it connects to."
---

A page that puts, into a single table, **how** each document handled by this system (price estimate through invoice) **is created**, whether it **can be split or merged**, and **which documents it connects to**. Individual branches and states belong to the flow page for each domain ([Sales](/manual/en/process/sales) / [Purchasing](/manual/en/process/purchasing) / [Production](/manual/en/process/production) / [Shipping](/manual/en/process/shipping) / [Billing](/manual/en/process/billing)). This page looks only at the **structure** between documents, across the whole system.

## How to read the table

| Column | Meaning |
|--------|---------|
| How it is created | Whether it is made fresh, made from another document, or created automatically by something such as an approval or a billing close |
| Split | Whether the content of one document (such as its quantity) can be divided out to several other documents |
| Merge | Whether several documents (usually several of the same kind) can be gathered into one document |
| Main related documents | The documents it links to on screen, as a source or as a destination |

Both "Split" and "Merge" refer to **relationships between one document and another**. A branch that stays entirely inside one document — such as branching a step within a work order (the "defect branch" in [Production flow](/manual/en/process/production)) — is not included here.

## Document creation, splitting, merging and relations table

| Document (number) | How it is created | Split | Merge | Main related documents |
|---|---|---|---|---|
| [Price estimate](/manual/en/operations/sales/trial-estimate/user) (`EST`) | Created fresh (can optionally be linked to a product) | — | — | Product / price list |
| [Price list](/manual/en/operations/sales/price-list/user) (`PRC`) | Created fresh (one entry per customer × product; variants added per order type) | — | — | Price estimate (basis for the unit price) / quote and order acceptance (source of the price) |
| [Quote](/manual/en/operations/sales/quote/user) (`QOT`) | Created fresh | — | — | Price list (referenced) / order acceptance (can be raised on from it) / design request (can be raised in parallel) |
| [Order acceptance](/manual/en/operations/sales/order-acceptance/user) (`ORD`) | Imported from an order document (email / watched folder / upload), or created fresh. Can reference a quote as its source | — | — | Quote / order lines (generated on confirm) / design request (can be raised in parallel) |
| Order line (`ORD-…-NN`) | Generated automatically when the order acceptance is confirmed (one per line; has no new/edit screen of its own) | **Yes** — split across several work orders (split fulfillment) / split across several delivery orders (split shipment) | — | Order acceptance (parent) / design request (can be raised when the order is taken) / work order / delivery order |
| [Design request](/manual/en/operations/sales/design-request/user) (`DSG`) | Created fresh (raised with a source from a quote, an order line or the product master, or raised standalone with no link to any of them) | — | — | Quote / order line / product / drawing (registered as a version on completion) |
| [Purchase request](/manual/en/operations/purchasing/purchase-request/user) (`PRQ`) | Created fresh | — | — | Material purchase order (generated 1:1 by "convert to purchase order" once approved) |
| [Material purchase order](/manual/en/operations/purchasing/purchase-order/user) (`PO`) | Converted from an approved purchase request (1:1), or created fresh without going through a purchase request | **Yes (partial receipt)** — the ordered quantity can be recorded as received over several separate deliveries | — | Purchase request (source of conversion, optional) / material receipt |
| [Material receipt](/manual/en/operations/purchasing/material-receipt/user) | A record against a purchase order line, or a record of a direct receipt with no supplier | — | — | Material purchase order (order line, optional) |
| [Outsource order](/manual/en/operations/purchasing/outsource-order/user) (`PU04`) | **Has no creation action of its own** — it appears in the list once a work order step's execution location is set to "outsourced" and a supplier is chosen (a list for watching status) | — | — | Work order (as the location a step is executed at) |
| [Work order](/manual/en/operations/production/work-order/user) (`WOR`) | Created from an order line (stock portion / manufactured portion). Can also be copied from a previous work order, or created for independent stock with no order line attached | **Yes** — a finished lot can be shipped across several delivery orders (staged shipment) | **Yes (combined lot)** — several order lines for the same product can be gathered into one work order | Order lines (several, m:n) / drawing (can specify which version to use) / outsource order / delivery order |
| [Drawing](/manual/en/operations/production/design-file/user) (`PD06`) | Registered as a version on completion of a design request, or registered directly with no design request (such as importing an existing drawing) | — | — | Design request (source of registration, optional) / product / work order (can specify which version to use) |
| [Delivery order](/manual/en/operations/shipping/delivery-order/user) (`DOR`) | Created fresh. Choosing an order acceptance fills in the order lines that can be shipped | — (the downstream delivery note is created automatically on confirm; direct to end user makes two copies) | **Yes** — several order lines (which may span several order acceptances) can be gathered into one, but only for the combination of the same customer, the same ship-to, and the same delivery method (also the same end user for direct shipment) | Order acceptance / order lines (m:n) / delivery note (1:N) |
| [Delivery note](/manual/en/operations/shipping/delivery-note/user) (`DRN`) | **Has no creation action of its own** — generated automatically when a delivery order (a dispatch) is confirmed. One copy for standard delivery, two for direct to end user (without prices shown = to the end user / with prices shown = to the customer) | — | — | Delivery order (parent, 1:N) / invoice (source of its line items) |
| [Invoice](/manual/en/operations/billing/invoice/user) (`INV`) | Generated from billing closing (one per billing closing) | — | — (its line items come from several documents totaled up by the billing closing; see below) | Billing closing (source, 1:1) / delivery order, delivery note, order line (source of line items) |
| [Billing closing](/manual/en/operations/billing/billing-closing/user) | Run fresh for a customer × closing day (at most one per combination of the same customer and the same closing day) | — | **Yes** — totals up everything delivered in that period into one record | Invoice (destination, 1:1) |

## Documents that are especially the starting point for splitting or merging

### Order line — the starting point for splitting

An order line is the document with the most branching in this table — one ordered quantity can be handed off across **several work orders** (split fulfillment) or **several delivery orders** (split shipment). Allocation to work orders is always kept so that "the total allocation per line ≤ the ordered quantity" and "the planned quantity per work order ≥ the total allocation", so over-allocation and duplicate allocation never happen. **The one exception is a work order that takes from stock (the stock portion)**, which must always have exactly one allocation per order line, with the quantity equal to the planned quantity (it cannot be split).

### Work order and delivery order — the starting point for merging

Conversely, the work order and the delivery order are the documents that can gather several order lines into one.

- **Work order (combined lot)** … as long as it is the same product, several order lines can be gathered into one work order and made into a single lot.
- **Delivery order** … as long as it is the same customer, the same ship-to, and the same delivery method, several order lines (which may span several order acceptances) can be gathered into one delivery order. If even one condition differs they cannot be bundled and must be split into separate delivery orders (see [Shipping flow](/manual/en/process/shipping) for details). Direct to end user also requires **the same end user** — this is so that the destination of the delivery note automatically created on confirm can be settled to a single one.

### Billing closing and invoice — totaling up actuals

Billing closing gathers up, for each customer's closing day, everything **delivered** in that period into a single total. The invoice is generated 1:1 from that billing closing, but its line items (`invoice_items`) line up as rows sourced from each of the several delivery orders, delivery notes and order lines that were totaled — the invoice itself is one document, but its content is a bundle of the actuals from several documents.

### Material purchase order — split receiving

The ordered quantity does not have to match the quantity and the number of deliveries actually received. Against one purchase order (its lines), only what has arrived can be recorded as a "material receipt" each time, and once everything has arrived the purchase order automatically becomes「**入荷完了**」(Received).

## Related pages

- Following a single order from start to finish … [Standard flow](/manual/en/process/default-flow)
- Branches and document states by domain … [Sales](/manual/en/process/sales) / [Purchasing](/manual/en/process/purchasing) / [Production](/manual/en/process/production) / [Shipping](/manual/en/process/shipping) / [Billing](/manual/en/process/billing)
- How to operate each app and what each field means … **How-to** on the left
- New to the system … [Getting started](/manual/en/start)
