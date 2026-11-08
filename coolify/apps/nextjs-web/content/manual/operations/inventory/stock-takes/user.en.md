---
title: "Stock Take — User Manual"
description: "Recount the physical stock by site and storage location, and, where it disagrees with the book quantity, create a slip that corrects it."
---
**Recount the physical stock** by site and storage location, and correct any discrepancy with the book quantity. The operation code is `ST05`.

> ⚠️ This app is currently available **only in the test environment**. The screens and the steps may change before it becomes available for real work.

> This app belongs to … [Production flow](/manual/en/process/production)

## What you can do in this app

- Choose a site (and, if needed, a storage location), and every stock bucket there is automatically added as something to count.
- Enter the counted results and see the discrepancy against the book quantity right away.
- If a flow exists in Approval Settings (MS0B), go through approval; if not, confirm directly.
- On confirming, only the items with a real discrepancy are automatically reflected as an "adjustment" [Stock Movement](/manual/en/operations/inventory/inventory-movements/user) (ST04) slip. Nothing happens for items with no discrepancy.

## Terms used on this page

- **棚卸 (Stock take)** … the work of counting physical stock and checking it against the book quantity.
- **帳簿数 (Book quantity)** … the quantity that was recorded in the system when the stock take was started.
- **記入数 (Counted quantity)** … the quantity actually counted.
- **差異 (Difference)** … counted quantity minus book quantity. This is only a guide at the time of entry — what actually gets applied is the difference at the moment of confirmation (see "What happens on confirming" below).
- **下書き / 記入中 / 確定 / キャンセル (Draft / Counting / Confirmed / Cancelled)** … the status of the stock take itself.
- **承認依頼中 / 承認済 / 差し戻し (Pending approval / Approved / Sent back)** … the status when approval is required.

## Starting a stock take

1. Press 「**新規作成**」(create new) in the list.
2. Choose a 「**拠点**」(site) — required.
3. To limit counting to one storage location, also choose 「**保管場所**」(storage location) — optional; leaving it empty targets the whole site.
4. Add 「**備考**」(notes) if needed.
5. Press 「**作成**」(Create).

Creating it automatically adds **every stock bucket** at that site (and location) as a line to count, at that moment. **This includes locations with zero stock, and stock with no assigned location** — so that you can find both "supposed to be here, but nothing was there" and "not supposed to be here, but something was". If there is nothing to target (no stock at all at that site), it cannot be created.

## Entering the count

Enter the actual counted quantities on the detail screen's entry grid.

- **種別 (Type)** … a badge for product or material.
- **品目名 (Item name)** … the item being counted.
- **保管場所 (Storage location)** … where that stock is placed.
- **ロット (Lot)** … the lot number, for a product.
- **帳簿数 (Book quantity)** … the recorded quantity when the stock take was started (cannot be edited).
- **記入数 (Counted quantity)** … enter the actual count here.
- **差異 (Difference)** … counted minus book. Blue when higher, orange when lower; a line not yet counted shows 「**未カウント**」(not counted).
- **備考 (Notes)** … notes on that line.

A summary at the top shows things like "◯ / ◯ counted" and "◯ discrepancies".

Pressing 「**保存**」(Save) keeps what has been entered so far. **The first save flips the stock take's status from "下書き" (Draft) to "記入中" (Counting).** You can save as many times as you like, so you don't have to finish counting in one sitting.

## Submitting

Once at least one line is counted, you can press 「**提出**」(Submit).

- If the "棚卸" (Stock Take) flow in Approval Settings (MS0B) has **1 or more steps**, this becomes an approval request. The stock take's status stays "記入中" (Counting), and the approval status becomes 「**承認依頼中**」(pending approval).
- If it has **no steps**, submitting confirms it right away.

Once submitted, you cannot resume entering counts while it is awaiting approval (the entry grid becomes uneditable while pending).

## Approving

Someone with approval permission can press 「**承認**」(Approve) or 「**差し戻し**」(Send back) from the card at the top of the detail screen. Sending it back returns it to the pre-submit state, so it can be re-entered and resubmitted. Once every step is approved, it proceeds to confirmation.

## What happens on confirming

At the moment of confirming, **the physical quantity at each location is read again, at its most current value** (because stock can move — shipments, receipts — between starting the count and confirming). The difference is decided by comparing "what was counted" against "that most current value".

- A line with no difference … nothing happens.
- A line with a difference … a [Stock Movement](/manual/en/operations/inventory/inventory-movements/user) (ST04, cause "棚卸調整"/Adjustment) slip is created for that item at that location, and the stock quantity is corrected by that difference.
- If not a single line has a difference … no slip is created at all (meaning there was nothing to correct).
- A line that was never counted, or a location whose stock disappeared entirely after the stock take started, is excluded from confirmation.

Once confirmed, a link to the slip that was actually created appears at the top of the detail screen (it does not appear if no slip was created).

## Cancelling

While it is "下書き" (Draft) or "記入中" (Counting), you can press 「**キャンセル**」(Cancel) on the detail screen. Cancelling while pending approval also withdraws that approval request, removing it from [Pending Tasks](/manual/en/operations/general/my-tasks/user) (CM01).

**A confirmed stock take can never be cancelled.** Confirming is an operation that actually corrects stock quantities, so undoing it would require a reverse stock take (counting again to move it back).

## The list

- **棚卸番号 (Stock take number)** … click to open the detail screen.
- **拠点 / 保管場所 (Site / Storage location)** … the target location.
- **明細数 (Line count)** … how many lines are to be counted.
- **状態 (Status)** … Draft / Counting / Confirmed / Cancelled.
- **承認状態 (Approval status)** … "—" (a dash) for a stock take that needs no approval.
- **更新日 (Updated)** … the date something last changed.

Filter using the search box and 「**状態**」(status).

Using this app requires the inventory permission.

## Frequently asked questions / troubleshooting

**Q. I counted something, but that item isn't in the target list.**
A. Locations with no stock at the moment the stock take was created are not included. You cannot add to the target list afterward — create a new stock take instead.

**Q. I submitted it, but the entry grid can no longer be edited.**
A. You cannot enter counts while it is pending approval. If it gets sent back, or if it was auto-confirmed because Approval Settings has no flow, entry is already finished by that point.

**Q. I confirmed it, but no slip was created.**
A. That means there was no discrepancy — the counted quantity matched the actual quantity at the moment of confirmation. This is the correct outcome, and nothing further is needed.

**Q. The discrepancy I entered differs from what actually got corrected after confirming.**
A. Confirming compares against the actual quantity **at the moment of confirmation**, not at the moment of entry. If a shipment or receipt happened partway through the stock take, the discrepancy at entry time and at confirmation time can differ.

**Q. I want to undo a confirmed stock take.**
A. You can't. Create a new stock take that counts in the opposite direction.

**Q. What happens to the approval request if I cancel?**
A. Cancelling while pending approval also withdraws that request. It also disappears from the approver's [Pending Tasks](/manual/en/operations/general/my-tasks/user) (CM01).

<!-- permissions:start -->
## Permissions required

Using this screen requires the **Inventory** (`inventory`) permission.

| What you want to do | Permission needed |
| --- | --- |
| Open the screen, view lists and details | Inventory — View |
| Add, change or delete | Inventory — Create / Edit / Delete |

Viewing only needs *View*. Where a screen offers adding, changing or deleting, each of those needs its matching permission.

Permissions come through roles. If something is missing, ask an administrator.

For the whole picture see [Permissions and roles](../../../permissions).
<!-- permissions:end -->
