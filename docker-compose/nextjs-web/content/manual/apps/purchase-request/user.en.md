---
title: "Purchase Request — User Manual"
description: "Operation code PU04. Manages internal \"please buy this material\" requests — the stage before the material purchase or…"
screenshots: []
---
Operation code **PU04**. Manages internal "please buy this material" requests — the stage before the material purchase order — through request → approval → conversion to a purchase order. Request numbers are **PRQ-YYYYMM-NNNNN**.

> This app is currently available **in the development (dev) environment only**. Screens and steps may change before the production release.

## What you can do here

An app for requesting a material purchase (購買依頼) with approval. At the request stage you do **not** decide the supplier or the unit price — you only write what, for which plant, how many, and by when, and send it for approval.

- An approved request becomes a draft [material purchase order (素材発注書, PU03)](/manual/en/apps/purchase-order/user) via **Convert to purchase order**. The supplier is chosen at conversion time; unit prices are entered on the purchase-order side.
- Approval requests also appear in [approval management (承認管理, PD03)](/manual/en/apps/approval/user), where approval-group members (or their delegates) can act on them.
- Creating and editing requires the purchase-order permission.

## Statuses and flow

- **下書き** (draft) — right after creation. Editable and cancellable. The **Request approval** button starts the approval flow.
- **承認依頼中** (approval requested) — only members of the first approval group (or delegates) can **Approve** or **Send back**.
- **承認済** (approved) — can be **converted to a purchase order**. Before conversion it can also be cancelled (reason required).
- **差し戻し** (sent back) — sent back with a reason. The reason is shown on the detail screen; you can edit the request and request approval again.
- **発注済** (ordered) — already converted. The detail screen shows a link to the resulting material purchase order.
- **キャンセル** (cancelled) — a pre-conversion request withdrawn with a reason.

## How to create

1. Open **New** in the list and enter the **request reason** (optional) and **notes**.
2. Add line items. One line = [material](/manual/en/masters/material/user) × receiving plant × quantity/unit × desired delivery date (optional). There is no unit-price field.
3. Saving creates a draft. Review the content and press **Request approval** to start the approval flow.

Editing is possible only while the request is a draft or sent back.

## Converting to a purchase order

1. On the detail screen of an approved request, press **Convert to purchase order**.
2. Choose the **supplier** and press **Convert** — a draft material purchase order carrying over the line items is created and opened.
3. Unit prices are copied as 0 yen, so enter the prices on the purchase order's edit screen before requesting its approval.

## List & search / detail screen

- List columns: request number / requester / material (first line + N more) / item count / status / desired date / updated. Filter with the search box (request number, requester, material) and status.
- The detail screen shows a request → approval → conversion stepper, the approval trail (delegate approvals marked with the original approver), the transition history, and tabs (items / overview / history).

## FAQ

**I don't see the approve button** — Only members of the first approval group (or delegates within their validity period) can approve or send back. Groups are managed in the approval-group master.

**What happens to a sent-back request?** — Its status becomes 差し戻し (sent back); you can edit it and press Request approval again. There is no need to recreate it.
