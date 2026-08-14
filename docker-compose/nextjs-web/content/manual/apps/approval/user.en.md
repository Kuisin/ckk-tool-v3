---
title: "Approvals — User Manual"
description: "Operation code PD03. See all pending approval requests across document types in one place, so you can review everythi…"
screenshots: []
---
Operation code **PD03**. See all pending approval requests across document types in one place, so you can review everything waiting for your approval.

> This app is currently available **in the development (dev) environment only**. Screens and steps may change before the production release.

## What you can do with this app

This is an "approval inbox" that lists only the **approval requests that have not yet been processed**. The document types covered are:

- **Work orders (指示書)** … first and second approval ([Work Order](/manual/en/apps/work-order/user) PD02).
- **Material purchase orders (素材発注書)** … pre-order approval ([Purchase Order](/manual/en/apps/purchase-order/user) PU03).
- **Purchase requests (購買依頼)** … [Purchase Request](/manual/en/apps/purchase-request/user) PU04.
- **Order acceptances (受注請書)** … shown in the list (a dedicated approval screen is not yet implemented, so clicking these rows does not navigate).

The actual approve/reject operations are performed on the **detail screen of each document**, opened from this list. Processed requests disappear from the list automatically.

## Reading the list

- Columns: **type** (badge for work order / material purchase order / purchase request / order acceptance), **target number**, **stage** (first / second), **requester**, **requested at**, and **notes**.
- Rows are sorted oldest-first by request time (earlier requests at the top).
- The search box matches **target number, requester, and notes**; you can also filter by **type** and **stage**.
- "旧データ" (legacy) badge … requests submitted before the approval-request recording format was normalized. They can be processed just the same.

## How to approve or reject

1. Click a row to open the target document's detail screen (work order → work order detail, material purchase order → purchase order detail).
2. In the **approval status** panel, press "第一承認" (first approval), "第二承認" (second approval), or "差し戻し" (reject). Rejecting requires a reason.
3. Work orders use a two-stage flow: first approval → second approval. After second approval, production can start.

Only **members of the approval group** for that stage (or a **delegate** within their valid period) can approve or reject. If you are not a member, the buttons are not shown and a message explains why. Records made by a delegate are marked "（代理: original approver）". Groups and delegates are configured in the [Approval Group](/manual/en/masters/approval-group/user) master.

## Approval detail screen

Work order approvals can also be done on a dedicated approval detail screen (`/production/approvals/<work order number>`). It shows the same content as the work order detail, with the approval status panel at the top (used e.g. when opened from a notification link).

## FAQ

**Q. The list is empty.** — There are no pending requests. Processed and rejected requests are not shown.

**Q. I don't see the approve buttons.** — You are not a member of the approval group for the current stage, or you lack the approval permission. Ask your administrator.

Using this app requires the approval (approve) permission.
