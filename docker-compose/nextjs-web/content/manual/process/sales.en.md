---
title: "The sales flow"
description: "How work moves from setting a unit price to accepting an order and handing it to production, and which app is used at each stage."
screenshots: []
---

This page describes how work moves from setting a unit price to accepting an order and handing it over to production. Open it when you need to see which stage you are at and who does what next. Each app has its own guide, linked from the table below.

## The flow at a glance

```
Trial estimate ─→ Price list ─→ Quote ─→ Order acceptance ─→ Sales order ─→ Work order
 (work out a price) (price per customer) (send to customer) (take the order) (confirm it) (instruct production)
                                                 ↑          │
                                                 └─ if the price differs, go back and adjust
```

When a product has no drawing yet, a **design request** is raised alongside this flow.

## Who does what, and with which app

| Stage | What happens | Who | App |
|-------|--------------|-----|-----|
| 1. Work out a unit price | Calculate the quoted unit price from material and machining costs | Sales | [Trial Estimate](/manual/en/operations/sales/trial-estimate/user) (`SA01`) |
| 2. Set the price for a customer | Create a price list for a customer + product, including quantity breaks | Sales | [Price List](/manual/en/operations/sales/price-list/user) (`SA02`) |
| 3. Issue a quote | Build the quote from price-list prices and send the PDF to the customer | Sales | [Quote](/manual/en/operations/sales/quote/user) (`SA03`) |
| 4. Take the order | Import the customer's order, check it and accept it | Sales support | [Order Acceptance](/manual/en/operations/sales/order-acceptance/user) (`SA04`) |
| 5. Confirm the order | Sales orders are created from the accepted content (one per product) | Sales support | Sales Order (`PD01`) |
| 6. Instruct production | Split into stock and manufacture, and lay out the process steps | Sales support | [Work Order](/manual/en/operations/production/work-order/user) (`PD02`) |
| (parallel) No drawing yet | Raise a design request; production produces the drawing | Sales / Sales support → Manufacturing | [Design Request](/manual/en/operations/sales/design-request/user) (`SA05`) |

## What happens at each stage

### 1. Work out a unit price (Trial Estimate)

Enter the material, dimensions and machining conditions, and the quoted unit price is calculated. A trial estimate is saved as a draft; once the content is settled you confirm it. **Only confirmed trial estimates can be used as the basis of a price list.** Once used, it becomes registered and can no longer be edited — duplicate it if you need to redo the calculation.

### 2. Set the price for a customer (Price List)

One price list covers one customer and one product. Prices are held separately per order type (production, test, sample, other), and the unit price can change by quantity range. You can select a confirmed trial estimate as the basis, or enter the price by hand.

### 3. Issue a quote (Quote)

Choosing the customer and product fills in the unit price from the price list. **If the product is not in the price list, no price is filled in and a warning appears** — create the trial estimate and price list first. When the content is right, issue the quote: the PDF is saved and it is ready to send to the customer.

### 4. Take the order (Order Acceptance)

Import the order the customer sent (fax or PDF). It is read automatically, and you check and correct the result on screen. If the ordered price differs from the quoted price, that is shown, so you can go back to the quote and adjust it. Once the content is settled, request approval; after approval the flow continues.

### 5–6. Confirm the order and instruct production (Sales Order, Work Order)

Confirming the order acceptance creates a **sales order** per line. You then create a **work order** against it, splitting what comes from stock and what is manufactured, and laying out the process steps in order. From here the production flow takes over.

## Document states

| Document | States |
|----------|--------|
| Trial estimate | Draft → Confirmed → Registered to price list |
| Quote | Draft → Issued → Accepted / Rejected / Expired |
| Order acceptance | Importing → Draft → Approval requested → Approved → Expanded → Archived |
| Sales order | Draft → Confirmed → In production → Partially shipped → Shipped |
| Work order | Draft → Pending approval → Approved → In progress → Completed |
| Design request | Not started → In progress → Completed |

## Where people get stuck

**No unit price appears on the quote**
There is no price-list row for that customer and product. Create the trial estimate and the price list first, then rebuild the quote.

**A trial estimate cannot be edited**
Once used by a price list it becomes registered and is locked. Duplicate it and redo the calculation. This is what keeps the amounts on past quotes from changing later.

**The ordered price differs from the quote**
The difference is shown on the order acceptance screen. Adjust the price on the quote, then correct the order acceptance.

**The order acceptance will not move on**
Check that approval has been requested and granted. Once approved, it can be expanded into sales orders and work orders.

## Related pages

- Operating each app, and what the input fields mean — see **Operations › Sales** in the sidebar
- New to the system — [Getting started](/manual/en/start)
