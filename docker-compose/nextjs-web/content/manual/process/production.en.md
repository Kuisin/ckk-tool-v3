---
title: "The production flow"
description: "How work moves from a confirmed order through stock checks, approval and process execution until the product is ready to ship, and which app is used at each stage."
screenshots: []
---

This page describes how work moves from a confirmed order, through checking stock, getting approval and running the process steps, until the product is ready to ship.

## The flow at a glance

```
Order line ─→ Check stock ─→ Work order ─→ Approval ─→ Run the steps ─→ Complete
 (confirmed)  (enough?)   (from stock / make) (1st, 2nd) (shop floor records) (into stock)
                   │
                   └─ if material is short, go to purchasing
```

## Who does what, and with which app

| Stage | What happens | Who | App |
|-------|--------------|-----|-----|
| 1. Check product stock | Split what can come from stock and what must be made | Production control | [Inventory](/manual/en/operations/production/product-inventory/user) (`PD04`) |
| 2. Check material | See whether there is enough material to make it | Production control | [Inventory](/manual/en/operations/production/material-inventory/user) (`PD04`) |
| 3. Create the work order | Split stock/manufacture and lay out the process steps | Sales support | [Work Order](/manual/en/operations/production/work-order/user) (`PD02`) |
| 4. Get approval | First and second approval before production may start | Approvers | [Approvals](/manual/en/operations/production/approval/user) (`PD03`) |
| 5. Run the steps | The shop floor records start, finish and quantities | Manufacturing | [Work Order](/manual/en/operations/production/work-order/user) / shop-floor tablet |
| 6. Complete | When every step is done the product enters stock | Manufacturing / production control | [Inventory](/manual/en/operations/production/product-inventory/user) |

## What happens at each stage

### 1–2. Checking stock

Look at product stock first and split the order into **what can ship from stock** and **what must be made**. For what must be made, check the material is available; if it is short, go to [the purchasing flow](/manual/en/process/purchasing). Semi-finished goods bought from outside need no work order — they are received as material.

### 3. Creating the work order

Create work orders for the stock portion and the manufacturing portion, and lay out the process steps in order. If there is an earlier work order for the same customer and product you can copy it (a warning appears if the content has changed). Each step is either internal or outsourced; outsourced steps appear in the [Outsource Order](/manual/en/operations/purchasing/outsource-order/user) list.

### 4. Approval

Production cannot start until the work order is approved: **first approval (production decision) then second approval (departmental)**. If it is sent back, correct it and request approval again.

### 5. Running the steps

The shop floor records the start and finish of each step, with the quantity received and the split of good pieces and defects (semi-finished, scrap, rework branch). **Steps can be paused and resumed**, and working time accumulates across sessions. The same actions are available on the shop-floor tablet.

Defects can be routed into a separate branch of steps for rework.

### 6. Completion

Once every step is finished, the product enters stock and [the shipping flow](/manual/en/process/shipping) can begin.

## Document states

| Document | States |
|----------|--------|
| Order line | Draft → Confirmed → In production → Partially shipped → Shipped (can be cancelled) |
| Work order | Draft → Pending approval → Approved → In progress → Completed (can be cancelled) |
| Work order approval | 1st pending → 1st approved → 2nd pending → Approved (can be sent back) |
| Process step | Not started → In progress → Completed (can be cancelled; paused stays in progress) |

## Where people get stuck

**A step cannot be started**
Either the previous step is not finished, or the work order is not approved yet.

**The work order is not approved**
First and second approval are done by different people. Check in Approvals which stage it is waiting at.

**Looking at a finished work order's steps**
Steps stay open after completion or cancellation — the button becomes "detail" so actuals and inspection records can still be reviewed.

**The quantities do not add up**
The received quantity must equal good pieces plus defects. Split defects into semi-finished, scrap or rework branch.

## Related pages

- Operating each app, and what the fields mean — see **Operations › Production** in the sidebar
- Previous flow — [The sales flow](/manual/en/process/sales)
- Next flow — [The shipping flow](/manual/en/process/shipping)
