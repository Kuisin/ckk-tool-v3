---
title: "Standard Flow — From Order to Invoice"
description: "A page that follows the standard flow of a single order from the price estimate all the way to the invoice, split into what the staff does by hand and what the system does automatically."
screenshots:
  [
    flow-trial-estimate-save-01,
    flow-trial-estimate-01,
    flow-price-list-01,
    flow-quote-01,
    flow-quote-issue-01,
    flow-design-request-01,
    flow-order-acceptance-01,
    flow-order-deploy-01,
    flow-work-order-new-01,
    flow-approval-01,
    flow-steps-01,
    flow-step-complete-01,
    kiosk-step-detail-01,
    flow-delivery-order-01,
    flow-delivery-order-ship-01,
    flow-delivery-note-01,
    flow-billing-closing-01,
    flow-invoice-generate-01,
    flow-invoice-send-01,
  ]
---

A page that follows the **standard flow** of a single order, from working out the unit price to invoicing it, from start to finish. Each stage is explained in two parts: "What happens (who does what)" and "What the system does automatically". The **red boxes** in the images show the button to press or the field to check at that stage.

Branches and exceptions (price mismatches, sending back, split receiving, and so on) and the list of each document's states belong to the flow page for each domain ([Sales](/manual/en/process/sales) / [Purchasing](/manual/en/process/purchasing) / [Production](/manual/en/process/production) / [Shipping](/manual/en/process/shipping) / [Billing](/manual/en/process/billing)). See each app's own user manual for the detailed steps on that screen.

## Overall flow

![Diagram of the whole standard flow (swimlanes from price estimate to invoice)](../assets/diagrams/process-overview.svg)

## Who's involved in this flow

| Role | Stages handled |
|------|-----------------|
| Sales | Price estimate, price list, quote |
| Sales support | Order acceptance, order lines, work order, delivery order, delivery note |
| Approver (plant manager / department head) | Approving the order acceptance, approving the work order |
| Production | Running the steps (recording quantities and defects) |
| Accounting | Billing closing, invoice |

## 1. Price estimate — building the basis for the unit price [#stage-1]

### What happens (who does what)

1. In [Price estimate](/manual/en/operations/sales/trial-estimate/user) (`SA01`), enter the product's material, dimensions and machining conditions, then save.

![New price estimate screen with the material composition entered. The save button is highlighted with a red box](../assets/screenshots/flow-trial-estimate-save-01.png)

2. Once the content is settled, choose「**確定**」(Confirm) from the actions menu.

![Actions menu of a draft price estimate. Confirm is highlighted with a red box](../assets/screenshots/flow-trial-estimate-01.png)

### What the system does automatically

- On save, a price estimate number (EST-) is assigned automatically.
- When you pick the material composition (material type, diameter, black skin/ground finish), a reference unit price is filled in automatically from purchase history (if there is no history, the material type's default price is used instead).
- Only a confirmed price estimate can be chosen as the basis for a unit price in the price list that follows.

## 2. Price list — setting the unit price per customer [#stage-2]

### What happens (who does what)

1. In [Price list](/manual/en/operations/sales/price-list/user) (`SA02`), choose the customer and the product, and pick a confirmed price estimate as the basis for the unit price (you can also type it in by hand).
2. Decide the price and the quantity tiers for each order type (production, test, sample, other), then save.

![New price list screen. The save button is highlighted with a red box](../assets/screenshots/flow-price-list-01.png)

### What the system does automatically

- The price and the valid period are saved, and from then on this price list is referenced by later quotes and orders.
- A price estimate used as the basis for a unit price becomes「**価格表登録済**」(Registered) and can no longer be edited as it is (this is so that a past amount never changes afterward).

## 3. Quote — presenting the amount to the customer [#stage-3]

### What happens (who does what)

1. In [Quote](/manual/en/operations/sales/quote/user) (`SA03`), enter the customer, the product and the quantity.

![New quote screen. The unit price automatically calculated from the price list is highlighted with a red box](../assets/screenshots/flow-quote-01.png)

2. Check the content, then choose「**発行**」(Issue) from the actions menu.

![Quote issue modal. The issue button is highlighted with a red box](../assets/screenshots/flow-quote-issue-01.png)

### What the system does automatically

- When you choose the customer and the product, the unit price is filled in automatically from the price list (quantity tiers and discounts are also applied automatically).
- On save, a quote number (QOT-) is assigned automatically.
- Issuing saves a PDF and puts the quote in a state ready to hand to the customer.

> 💡 A product not in the price list gets no unit price and shows a warning. You must register a price estimate, then a price list, before making the quote.

## (In parallel) Design request — when there is no drawing [#design-request]

For a product that has no drawing yet, a design request is raised **in parallel** with this flow. It is an optional stage that does not belong to the standard flow — it can be raised at the quote stage, after the order is confirmed, or standalone with no link to either document. The branches and the document's states belong to [Sales flow](/manual/en/process/sales).

### What happens (who does what)

1. Sales (or sales support) raises a [Design request](/manual/en/operations/sales/design-request/user) (`SA06`). Opening it from the「…」menu on a quote, an order line, or the product master starts it with the source already filled in. **The product and the assignee are required.**
2. Once the content is settled, press「**承認依頼**」(Request approval). Once approved it becomes 「**未着手**」(Not started — approved and waiting to be picked up).
3. The named production assignee presses「**着手**」(Start).
4. Once the drawing is ready, register it as a version in [Drawing](/manual/en/operations/production/design-file/user) (`PD06`) from「**設計図に登録**」(Register to drawing) on the request screen, then go back to the request and press「**完了**」(Complete). **It cannot be completed while there are zero deliverables.**

![A design request that has not been started. The start button is highlighted with a red box](../assets/screenshots/flow-design-request-01.png)

### What the system does automatically

- On save, a request number (DSG-) is assigned automatically.
- Choosing the product automatically decides whether it is **new** or a **revision** (a revision if that product already has a drawing). A revision requires a reason for the change.
- Once approval passes, a "please start" notification reaches the named assignee. Starting notifies the requester; completing notifies the requester and the quote's sales rep.
- Registering to the drawing bundles the files uploaded at that time into a single version (v1, v2, …), and it replaces the [product master](/manual/en/operations/masters/product/user)'s latest drawing. A work order can also specify which version to use.
- Versions are counted per "product × ordering customer". The request's ordering customer becomes the series directly; if it is empty, the version becomes **generic** (used by work orders for customers with no drawing of their own).

> 💡 If [Approval settings](/manual/en/operations/masters/approval-setting/user) has no step at all for "Design request", an approval request cannot be raised. The steps can be varied by trigger, request kind (new / revision) and priority.

## 4. Order acceptance — receiving the order [#stage-4]

### What happens (who does what)

1. Bring the order document (fax, PDF) received from the customer into [Order acceptance](/manual/en/operations/sales/order-acceptance/user) (`SA04`), then check and correct the results of the read. The delivery method (standard delivery / direct to end user) and the end user are also decided here. **If it is direct to end user and the end user is left unspecified, neither an approval request nor confirmation is possible.** If the customer will bring their own delivery note (e.g. with a barcode printed), attach 「顧客提供の納品書」(customer-supplied delivery note) here (a marker for whoever prepares the shipment — it can only be changed while still a draft).
2. Once the content is confirmed, request approval. The approver checks the content and presses「**承認**」(Approve).

![Order acceptance pending approval. The approve action is highlighted with a red box](../assets/screenshots/flow-order-acceptance-01.png)

### What the system does automatically

- Reading the imported order document happens automatically, and the customer, product, quantity and price are filled into the draft.
- The total amount is calculated automatically.
- Each line's unit price is filled in automatically from the customer's price list (customer × product × order type × quantity). To accept a different price, enter "override the unit price" on that line. A line that does not match the price list without being overridden is shown on screen as a price mismatch — how to fix it is covered in [Sales flow](/manual/en/process/sales).

## 5. Confirming order lines — the order becomes final [#stage-5]

### What happens (who does what)

1. Open the approved order acceptance and choose「**確定**」(Confirm). Pressing「**展開する**」(Expand) on the confirmation screen finalizes it.

![Confirmation modal. The expand button is highlighted with a red box](../assets/screenshots/flow-order-deploy-01.png)

### What the system does automatically

- An **order line** is created for each line, and a branch-numbered number (ORD-…-NN) is assigned automatically.
- The amount is fixed at the content as of this moment.

## 6. Work order — setting up the manufacturing plan [#stage-6]

### What happens (who does what)

1. Make a [Work order](/manual/en/operations/production/work-order/user) (`PD02`) from an order line. Split out the portion coming from stock and the portion to be manufactured, and line up the steps in order for the manufactured portion (you can also copy a previous work order).
2. Save it and request approval.

![New work order screen made from an order line. The save button is highlighted with a red box](../assets/screenshots/flow-work-order-new-01.png)

### What the system does automatically

- A work order number (a running number) is assigned automatically. This number becomes the lot number as-is, and a QR code that the shop floor scans is printed on the work order document.
- The portion taken from stock has that stock allocated, so it can no longer be used by another order. See [Production flow](/manual/en/process/production) for how to read stock.

## 7. Approval — confirming that manufacturing may begin [#stage-7]

### What happens (who does what)

1. The approver checks the content in [Approval management](/manual/en/operations/production/approval/user) (`PD03`) or on the work order screen, then presses「**承認**」(Approve). If there is a problem, they choose「**差し戻し**」(Send back).

![Work order pending approval. The approve button is highlighted with a red box](../assets/screenshots/flow-approval-01.png)

### What the system does automatically

- Requesting approval locks the work order from editing, and a notification reaches the approver.
- Each step's approval is recorded, and the next step's approver is notified.
- Once every step is approved, manufacturing can begin.

## 8. Manufacturing — the shop floor runs the steps [#stage-8]

### What happens (who does what)

1. A shop-floor worker opens their own step from the work order's step list and presses「**開始**」(Start). Some steps require a lot/slip code to be entered, and cannot be started without it. Also, when linked to another work order (the "related work orders" on the work order detail screen), the first step cannot be started until the preceding work order is complete.

![Work order step list. The step in progress is highlighted with a red box](../assets/screenshots/flow-steps-01.png)

2. Once the work is done, enter the received quantity, the good quantity, and the breakdown of defects, then press「**完了**」(Complete).

![Quantity/defect input screen. The complete button is highlighted with a red box](../assets/screenshots/flow-step-complete-01.png)

### What the system does automatically

- Once started, that step can no longer be operated by another person at the same time (preventing double execution).
- The work time from start to completion, and the quantities/defects entered, are recorded as an actual.
- Once the last step is completed, the finished quantity is added to the product stock, and the allocation to the order is confirmed.

> 💡 The same operations can be done from a shared tablet on the shop floor. Scanning a work order's QR opens the step list for that work order.

![Step execution screen on a tablet](../assets/screenshots/kiosk-step-detail-01.png)

## 9. Delivery order — sending it out [#stage-9]

### What happens (who does what)

1. Choosing an order acceptance in [Delivery order](/manual/en/operations/shipping/delivery-order/user) (`SH01`) fills in the order lines that can be shipped. Decide the quantity to ship from the finished lot and save. Multiple order acceptances can be put on one delivery order only when they share **the same customer, the same ship-to, and the same delivery method**.

![New delivery order screen. The order acceptance selection field is highlighted with a red box](../assets/screenshots/flow-delivery-order-01.png)

2. Check the content and press「**確定**」(Confirm), then set it to「**出荷**」(Shipped) once it has actually gone out.

![Actions menu of a confirmed delivery order. Shipped is highlighted with a red box](../assets/screenshots/flow-delivery-order-ship-01.png)

### What the system does automatically

- On save, a delivery order number (DOR-) is assigned automatically.
- Setting it to shipped reduces stock, and the order line's state changes to「**一部出荷**」(Partially shipped) or「**出荷済**」(Shipped).

## 10. Delivery note — delivering it [#stage-10]

### What happens (who does what)

1. You **do not make** a [Delivery note](/manual/en/operations/shipping/delivery-note/user) (`SH02`) — it is already made automatically the moment the delivery order was「**確定**」(confirmed) in the previous stage. Open it from the delivery order's「納品書」(delivery note) tab, or from the delivery note app's list, and check the destination and whether prices are shown. **It is already issued the moment it is created**, so there is nothing to correct on the delivery note side — if there is a mistake, start over from the correct order acceptance and delivery order.

![Delivery note tab of a confirmed delivery order. The two automatically-created copies are listed](../assets/screenshots/flow-delivery-note-01.png)

2. Once it reaches the customer, set it to「**納品済**」(Delivered).

### What the system does automatically

- A delivery note is created at the same time the delivery order is confirmed, and a delivery note number (DRN-) is assigned automatically. **A delivery order for stock storage does not create one.**
- Standard delivery makes one copy, addressed to the customer, with prices shown. **Direct to end user makes two copies** — one without prices to the end user, and one with prices to the customer. The delivery method and the end user are carried over from the order acceptance.
- Opening or downloading a direct-to-end-user delivery note that shows prices requires a confirmation step (to prevent it from accidentally reaching the end user).
- A delivery note is issued from the start, and the PDF can be viewed right away. A delivery note without prices shown uses a layout that does not print prices.

## 11. Invoice — closing and billing [#stage-11]

### What happens (who does what)

1. In [Billing closing](/manual/en/operations/billing/billing-closing/user) (`BL02`), choose a customer's closing day and run「**締日処理を実行**」(Run billing closing).

![Billing closing list screen. The run button is highlighted with a red box](../assets/screenshots/flow-billing-closing-01.png)

2. Check the closed content, then press「**請求書を生成**」(Generate invoice).

![Billing closing detail screen. The generate invoice button is highlighted with a red box](../assets/screenshots/flow-invoice-generate-01.png)

3. Issue the [Invoice](/manual/en/operations/billing/invoice/user) (`BL01`) and send it to the customer, then set it to「**送付済**」(Sent). Once payment is confirmed, set it to「**支払済**」(Paid).

![Invoice actions menu. Mark as sent is highlighted with a red box](../assets/screenshots/flow-invoice-send-01.png)

### What the system does automatically

- Running billing closing automatically totals up everything delivered in that period.
- Generating the invoice assigns an invoice number (INV-) automatically, and issuing it saves a PDF.
- A closed period can be exported as a CSV file for 弥生会計 (Yayoi Accounting).

## Related pages

- Branches, exceptions and **the list of document states** … [Sales flow](/manual/en/process/sales) / [Purchasing flow](/manual/en/process/purchasing) / [Production flow](/manual/en/process/production) / [Shipping flow](/manual/en/process/shipping) / [Billing flow](/manual/en/process/billing)
- How to operate each app and what each field means … **How-to** on the left
- New to the system … [Getting started](/manual/en/start)
