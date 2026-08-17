---
title: "The purchasing flow"
description: "How work moves from noticing a material is short to ordering it, receiving it and having it available as stock, and which app is used at each stage."
screenshots: []
---

This page describes how work moves from noticing that a material is short, through ordering and receiving it, to having it available as stock. Open it when you need to see which stage you are at and who does what next.

## The flow at a glance

```
Purchase request ─→ Approval ─→ Purchase order ─→ Approval ─→ Ordered ─→ Receipt ─→ Stock increases
 (we need this)     (do we?)    (from whom, at what price) (amount ok?)  (sent)   (it arrived)
```

For urgent or low-value items you can start **directly from the purchase order** without a request. Semi-finished goods bought from outside need no work order — they are simply received as material.

## Who does what, and with which app

| Stage | What happens | Who | App |
|-------|--------------|-----|-----|
| 1. List what is needed | Enter the material, quantity, requested date and why it is needed | Production control / shop floor | [Purchase Request](/manual/en/operations/purchasing/purchase-request/user) (`PU01`) |
| 2. Approve the request | Decide whether it is really needed; approve or send back | Approver | [Purchase Request](/manual/en/operations/purchasing/purchase-request/user) (`PU01`) |
| 3. Create the order | Decide the supplier, unit price and expected arrival | Purchasing | [Material Purchase Order](/manual/en/operations/purchasing/purchase-order/user) (`PU02`) |
| 4. Approve the order | Check the amount and terms | Approver | [Material Purchase Order](/manual/en/operations/purchasing/purchase-order/user) (`PU02`) |
| 5. Place the order | Send it to the supplier once approved | Purchasing | [Material Purchase Order](/manual/en/operations/purchasing/purchase-order/user) (`PU02`) |
| 6. Record the arrival | Record what arrived and when | Goods-in | [Material Receipt](/manual/en/operations/purchasing/material-receipt/user) (`PU03`) |
| (parallel) Send work out | Send part of the machining to an outside company | Production control | [Outsource Order](/manual/en/operations/purchasing/outsource-order/user) (`PU04`) |

## What happens at each stage

### 1–2. Request and approval (Purchase Request)

Enter the material, quantity, receiving plant and requested date, say **why it is needed**, and request approval. The approver decides on that reason, so naming the product and process step it is for moves things along. If it is sent back, correct it and request again.

### 3–5. Ordering (Material Purchase Order)

Create the order from an approved request, or directly. Here you set the **supplier, unit price and expected arrival**. The unit price is later used as the reference material cost in trial estimates, so enter the real transaction price. Once approved, place the order and the state becomes ordered.

### 6. Receiving (Material Receipt)

Record what arrived. **Stock increases at the chosen plant, as of the received date you enter.** The quantity does not have to match the order — if the delivery is split, record what arrived and enter the rest later. When everything has arrived the order becomes complete.

### About outsourcing

Outsourcing does not start from a request or an order. It comes from a **work order process step**: set the step's location to outsourced and choose the supplier, and it appears in the [Outsource Order](/manual/en/operations/purchasing/outsource-order/user) list. That screen is for watching progress — you cannot create outsourcing from it.

## Document states

| Document | States |
|----------|--------|
| Purchase request | Draft → Approval requested → Approved → Ordered (can be sent back or cancelled) |
| Material purchase order | Draft → Approval requested → Approved → Ordered → Fully received (can be cancelled) |

## Where people get stuck

**The request is not approved**
Check that the reason says more than "we need it". Which product, which process step, and by when, is what makes it decidable.

**Stock does not increase**
The arrival has probably not been recorded. Record the quantity, received date and receiving plant in Material Receipt.

**Stock landed at the wrong plant**
The receiving plant was set incorrectly — choose the plant where the goods physically arrived.

**The order never becomes fully received**
Part of the ordered quantity has not been recorded yet. Record a receipt each time a partial delivery arrives.

## Related pages

- Operating each app, and what the fields mean — see **Operations › Purchasing** in the sidebar
- Registering materials — [Materials](/manual/en/operations/masters/material/user)
- Checking stock — [Material Inventory](/manual/en/operations/production/material-inventory/user)
