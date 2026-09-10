---
title: "Shipping Flow"
description: "A reference covering the flow from sending out finished products with a delivery order, through issuing the delivery note, until it is delivered, focused on branches and each document's states."
screenshots:
  [
    flow-delivery-order-01,
    flow-delivery-order-confirm-01,
    flow-delivery-order-ship-01,
    flow-delivery-note-01,
    flow-delivery-note-delivered-01,
  ]
---

A page covering the flow from sending out finished products, through issuing the delivery note, until it is delivered. It is where you check "what stage things are at now, and who does what next", the dispatch / stock storage **branch**, and each **document's states**. The basic steps to operate belong to [Standard flow](/manual/en/process/default-flow).

## Overall flow

![Diagram of the whole shipping flow (swimlanes including the dispatch / stock storage branch)](../assets/diagrams/process-shipping.svg)

## Stage-by-stage roles and apps

| Stage | What happens | Role | App used |
|-------|--------------|------|----------|
| 1. Make the delivery order | Choose the order acceptance, and decide the lines and lots to send | Shipping | [Delivery order](/manual/en/operations/shipping/delivery-order/user) (`SH01`) |
| 2. Confirm | Confirm the content. **The delivery note is made automatically here** | Shipping | [Delivery order](/manual/en/operations/shipping/delivery-order/user) (`SH01`) |
| 3. Ship | Actually send it out. Stock decreases | Shipping | [Delivery order](/manual/en/operations/shipping/delivery-order/user) (`SH01`) |
| 4. Check the delivery note | Check the content of the automatically-made delivery note (destination, whether prices are shown). It is issued the moment it is created, and there is no action to correct it | Shipping | [Delivery note](/manual/en/operations/shipping/delivery-note/user) (`SH02`) |
| 5. Deliver | Print the PDF and enclose it, and set it to delivered once it arrives | Shipping | [Delivery note](/manual/en/operations/shipping/delivery-note/user) (`SH02`) |

## What happens at each stage

### 1–3. Delivery order

Choosing an **order acceptance** fills in the order lines that can be shipped, grouped per line, with the quantity filled in automatically from the work order's finished quantity. The **lot** to send can be chosen per group. A lot is the same as the work order number, and this is what records which manufactured portion was sent. Also choose the from site (**that site's stock decreases**). You cannot ship more than what remains on the order, and when it is less than the remainder a "partial shipment" confirmation appears. Lines from several order acceptances can be put on one delivery order only when they share **the same customer, the same ship-to and the same delivery method** — choosing a combination that does not meet the conditions shows the reason on the spot (steps … [Standard flow §9](/manual/en/process/default-flow#stage-9)).

![New delivery order screen. The order acceptance selection field is highlighted with a red box](../assets/screenshots/flow-delivery-order-01.png)

**The type branch** — there are two types.

- **Dispatch** … sent to the customer. Goes on to the delivery note and billing
- **Stock storage** … the spare portion that was made, kept in-house. Does not go on to billing

Shipping after confirming reduces stock, and the order line's state changes to「一部出荷」(partially shipped) or「出荷済」(shipped).

![Delivery order confirm modal. The confirm button is highlighted with a red box](../assets/screenshots/flow-delivery-order-confirm-01.png)

![Actions menu of a confirmed delivery order. Shipped is highlighted with a red box](../assets/screenshots/flow-delivery-order-ship-01.png)

### 4–5. Delivery note

**You do not make a delivery note — it is already made automatically the moment the delivery order is confirmed.** How many copies are made is decided by the order acceptance's delivery method.

- **Standard delivery** … **one copy**, addressed to the customer, with prices shown
- **Direct to end user** … **a set of two**. The one **without** prices shown goes to the end user (the party who receives it enclosed with the goods), and the one **with** prices shown goes to the customer (the party in the billing relationship)

Splitting into two for direct delivery is so that no path exists at all by which a priced document reaches the end user. Opening or downloading a direct-delivery delivery note with prices shown puts a confirmation in between, and a warning also appears at the top of the screen. **A delivery order for stock storage does not make a delivery note** (since it is outside the billing flow).

The destination (end user) is decided from the order acceptance's end user field (choosing direct to end user on the order acceptance makes the end user required). Only order lines with **the same end user** can be bundled into one delivery order, and this is also a condition that lets the automatic creation settle on a single destination.

The delivery note that is made is **issued at that moment**, and there is no action on the delivery note side to correct its content (the delivery method, end user, whether prices are shown, quantity and unit price are all carried over from the order acceptance and the delivery order). If there is a mistake, start over from the correct order acceptance and delivery order. The PDF can be viewed right away. Once it arrives, set it to「納品済」(delivered). A shipment that has got this far becomes the subject of [Billing flow](/manual/en/process/billing) (steps … [Standard flow §10](/manual/en/process/default-flow#stage-10)).

![Delivery note tab of a confirmed delivery order. The two automatically-created copies are listed](../assets/screenshots/flow-delivery-note-01.png)

![Actions menu of an issued delivery note. Mark as delivered is highlighted with a red box](../assets/screenshots/flow-delivery-note-delivered-01.png)

## Document states

| Document | How the state moves |
|----------|----------------------|
| Delivery order | Draft → Confirmed → Shipped |
| Delivery note | Issued → Delivered (issued the moment it is created) |

## Where things tend to get stuck

**Cannot put a line from a different order acceptance on the same delivery order**
Only order lines with the same customer, the same ship-to and the same delivery method can be bundled into one delivery order. Make a separate delivery order for the ones that do not meet the conditions.

**Cannot choose the lot you want to send**
That product's stock may not be at the chosen from site. Check the site, or look up which site has stock in [Inventory](/manual/en/operations/production/product-inventory/user).

**Stock does not decrease**
Check whether the delivery order has stopped at「確定」(confirmed). Stock decreases when the shipment is recorded.

**Don't want amounts on the delivery note**
Whether prices are shown is decided by the order acceptance's delivery method and cannot be changed on the delivery note side. For direct to end user, one copy without amounts is made automatically for the end user, so hand over that one. Standard delivery gets just one copy, with prices shown.

**No delivery note has been made**
Check whether the delivery order has been confirmed (the delivery note is made at the same time as confirmation). A delivery order of type「在庫保管」(stock storage) does not make a delivery note.

**It does not show up in billing**
Delivery may not be complete yet, or the delivery order's type may be「在庫保管」(stock storage).

## Related pages

- Following a single order from start to finish … [Standard flow](/manual/en/process/default-flow)
- How to operate each app and what each field means … **How-to › Shipping** on the left
- Previous flow … [Production flow](/manual/en/process/production)
- Next flow … [Billing flow](/manual/en/process/billing)
