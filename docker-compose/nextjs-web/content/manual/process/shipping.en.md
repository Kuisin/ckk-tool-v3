---
title: "The shipping flow"
description: "How finished product is sent out on a shipping order, and the delivery note is issued and delivered, with the app used at each stage."
screenshots: []
---

This page describes how finished product is sent out, and how the delivery note is issued and delivered.

## The flow at a glance

```
Shipping order ─→ Confirm ─→ Ship ─→ Delivery note ─→ Issue ─→ Delivered
 (choose the lot)          (stock falls) (destination, prices?)   (on to billing)
```

Product kept in-house is recorded with the "stock storage" shipping type, and does not go on to billing.

## Who does what, and with which app

| Stage | What happens | Who | App |
|-------|--------------|-----|-----|
| 1. Create the shipping order | Pick the sales order, the product and the lot | Shipping | [Shipping Order](/manual/en/operations/shipping/shipping-order/user) (`SH01`) |
| 2. Confirm | Fix the contents, ready to ship | Shipping | [Shipping Order](/manual/en/operations/shipping/shipping-order/user) (`SH01`) |
| 3. Ship | Send it out; stock falls | Shipping | [Shipping Order](/manual/en/operations/shipping/shipping-order/user) (`SH01`) |
| 4. Create the delivery note | Decide the destination and whether prices appear | Shipping | [Delivery Note](/manual/en/operations/shipping/delivery-note/user) (`SH02`) |
| 5. Issue and deliver | Issue the PDF, then mark it delivered | Shipping | [Delivery Note](/manual/en/operations/shipping/delivery-note/user) (`SH02`) |

## What happens at each stage

### 1–3. Shipping order

Choose the sales order, then the product and the **lot**. The lot is the same number as the work order, so which production run went out stays on record. Choose the shipping plant too — **stock falls at that plant**.

There are two types:

- **Dispatch** — going to the customer; continues to the delivery note and billing
- **Stock storage** — spare production kept in-house; does not continue to billing

After confirming and shipping, stock falls and the sales order becomes partially shipped or shipped.

### 4–5. Delivery note

Create the delivery note from the shipping order. Two things matter here:

- **Delivery method** — to the customer who ordered (normal), or direct to the end user
- **Show prices** — whether unit prices and amounts appear on the note. **For direct-to-end-user delivery these are normally hidden**

Issuing saves the PDF. Mark it delivered on arrival. Deliveries that reach this point are what [the billing flow](/manual/en/process/billing) works from.

## Document states

| Document | States |
|----------|--------|
| Shipping order | Draft → Confirmed → Shipped |
| Delivery note | Draft → Issued → Delivered |

## Where people get stuck

**The lot cannot be selected**
That product may have no stock at the chosen shipping plant. Check the plant, or look up where the stock is in [Inventory](/manual/en/operations/production/product-inventory/user).

**Stock does not fall**
The shipping order may have stopped at "confirmed" — stock falls when the shipment is recorded.

**Prices should not appear on the note**
Turn off "show prices" on the delivery note; this is normal for direct-to-end-user delivery.

**It does not appear in billing**
Either it has not been delivered yet, or the shipping type is "stock storage".

## Related pages

- Operating each app, and what the fields mean — see **Operations › Shipping** in the sidebar
- Previous flow — [The production flow](/manual/en/process/production)
- Next flow — [The billing flow](/manual/en/process/billing)
