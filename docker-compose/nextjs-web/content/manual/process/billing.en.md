---
title: "The billing flow"
description: "How delivered work is closed into an invoice, issued, sent and recorded as paid, with the app used at each stage."
screenshots: []
---

This page describes how delivered work is closed into an invoice, issued, sent, and recorded as paid.

## The flow at a glance

```
Closing ─→ Invoice created ─→ Issue ─→ Send ─→ Payment ─→ Accounting
 (per customer)  (delivered work)  (PDF)  (to customer) (recorded) (Yayoi CSV)
```

## Who does what, and with which app

| Stage | What happens | Who | App |
|-------|--------------|-----|-----|
| 1. Close the period | Gather the period's deliveries per customer's closing day | Accounting | [Billing Closing](/manual/en/operations/billing/billing-closing/user) (`BL02`) |
| 2. Check the contents | Review the lines and amounts | Accounting | [Invoice](/manual/en/operations/billing/invoice/user) (`BL01`) |
| 3. Issue | Issue the PDF | Accounting | [Invoice](/manual/en/operations/billing/invoice/user) (`BL01`) |
| 4. Send | Send it to the customer and mark it sent | Accounting | [Invoice](/manual/en/operations/billing/invoice/user) (`BL01`) |
| 5. Record payment | Mark it paid once the money arrives | Accounting | [Invoice](/manual/en/operations/billing/invoice/user) (`BL01`) |
| 6. Hand to accounting | Export the CSV for Yayoi | Accounting | [Billing Closing](/manual/en/operations/billing/billing-closing/user) (`BL02`) |

## What happens at each stage

### 1. Closing

Deliveries are gathered per customer using that customer's **closing day**. The closing day and payment terms come from the [customer master](/manual/en/operations/masters/business-partner/user). Closing produces the invoices for that period.

### 2–5. Invoice

Check the lines and the amounts (subtotal, tax, total) and issue the invoice; issuing saves the PDF. Mark it sent once it has gone to the customer, and paid once the money has arrived. **These states are the money record**, so change them only against what actually happened.

### 6. Hand to accounting

Closed periods can be exported as CSV for Yayoi accounting. Once exported, the closing becomes exported.

## Document states

| Document | States |
|----------|--------|
| Billing closing | Not processed → Processed → Exported |
| Invoice | Draft → Issued → Sent → Paid |

## Where people get stuck

**A delivery is missing from the invoice**
Check the delivery note is marked delivered. Shipping orders of type "stock storage" are never billed.

**The closing period looks wrong**
Check the closing day, payment terms and payment day on the customer master — billing follows those settings.

**The amount is not what was expected**
The lines come from the delivery notes. Check the unit price and quantity there, and whether prices were shown.

## Related pages

- Operating each app, and what the fields mean — see **Operations › Billing** in the sidebar
- Previous flow — [The shipping flow](/manual/en/process/shipping)
- Per-customer closing settings — [Customers](/manual/en/operations/masters/business-partner/user)
