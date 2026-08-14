---
title: "Design Request — User Manual"
description: "Operation code SA05. Request design work from the design department at quotation or order time, manage the finished d…"
screenshots: [design-request-list-01, design-request-new-01, design-request-files-01]
---
Operation code **SA05**. Request design work from the design department at quotation or order time, manage the finished design files with version control, and register them to the product master.

> This app is currently available **in the development (dev) environment only**. Screens and steps may change before the production release.

## What you can do with this app

- Choose the **trigger** for the request — **見積時** (at quotation) or **受注時** (at order) — and register a design request (設計依頼書) linked to a [quote](/manual/en/apps/quote/user) or a sales order (注文請書).
- The request number **DSG-YYYYMM-NNNNN** is numbered automatically on save.
- Track progress with the statuses **未着手 (Pending) → 進行中 (In progress) → 完了 (Completed)**.
- On completion, the attached design file is registered as a **version (v1, v2, …)**, and if a product is specified it becomes the latest design in the [product master](/manual/en/masters/product/user).
- Requires the design request permission (design_request).

![Design request list](../../assets/screenshots/design-request-list-01.png)

## How to create

1. Open **新規作成** (new) from the list.
2. Choose the **trigger**: **見積時** (design in parallel with quotation) or **受注時** (design after the order).
3. Depending on the trigger, choose the source document (both optional): for quotation time, a **quote** (picked from recent quotes); for order time, a **sales order (注文請書)** (searched and selected).
4. Enter the **product** (optional) and the **request description**, then **save**. The request number is assigned and you are taken to the detail page.

**Note**: the trigger and the source document (quote / sales order) **cannot be changed after creation**. If you picked the wrong one, create a new request.

![New design request form](../../assets/screenshots/design-request-new-01.png)

## Working through the statuses

- **未着手** (Pending, PENDING) — right after creation. Press **着手** (start) on the detail screen to move to in progress.
- **進行中** (In progress, IN_PROGRESS) — design work underway. Upload design files on the **ファイル** (files) tab.
- **完了** (Complete, IN_PROGRESS → COMPLETED) — confirm via **完了** in the action menu. **At least one attached design file is required**; the newest attachment is registered as a new version. The completion time is also recorded.
- **差し戻し** (Reopen, COMPLETED → in progress) — if changes are needed after completion, use **差し戻し** in the action menu to return to in progress (the completion time is cleared).

## Editing

- **Editing** is possible only while **pending or in progress**, and only the **product** and the **request description** can be changed.
- Completed requests cannot be edited and no files can be added. Reopen (差し戻し) the request first to make changes.

## Files (version control)

- Upload and delete design files on the **ファイル** (files) tab of the detail screen (only before completion).
- Each time the request is **completed**, the latest attachment at that moment is registered as v1, v2, … with the newest version carrying a **最新** (latest) badge.
- For requests with a product specified, completing also switches that product's latest design to the new version.

![Files tab (version list with latest badge)](../../assets/screenshots/design-request-files-01.png)

## List and search

- Columns: request number / trigger / product / status / updated date.
- Search by number, product, or description, and filter by trigger and status. Click a row to open the detail screen.

## FAQ

- **The complete button shows an error** — if the message says a design file must be attached first, upload the design file on the **ファイル** tab and then complete.
- **Is specifying a quote or sales order required?** — Both are optional. A request can be created without any link.
- **How does this relate to order acceptance?** — Order intake and deployment are handled in the [order acceptance](/manual/en/apps/order-acceptance/user) app (SA04); the sales orders generated there can be set as the source of a request with the "受注時" (at order) trigger.
