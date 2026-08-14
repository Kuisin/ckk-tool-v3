---
title: "Work Order — User Manual"
description: "Operation code PD02. Create work orders (指示書) — manufacturing instructions for the plant floor — and manage them from…"
screenshots: [work-order-list-01, work-order-detail-01, work-order-new-01]
---
Operation code **PD02**. Create work orders (指示書) — manufacturing instructions for the plant floor — and manage them from approval through step execution and completion.

> This app is currently available **in the development (dev) environment only**. Screens and steps may change before the production release.

## What you can do with this app

A work order (指示書) states "for this sales order (注文請書), make this many pieces using this sequence of process steps". Work order numbers are a global serial and double as the **lot number**.

- Pick a sales order and build the step sequence from the product's **process list** (process route).
- After creation, submit an **approval request**; production can start after first and second approval.
- Each step is started, quantity-recorded, and completed on the **step execution screen**. Per step you can also record **work plans and actuals** (assignee, date, time, quantity, work location).
- When all steps are complete, the good pieces are stocked under the lot number. Stock is checked in [Inventory](/manual/en/apps/product-inventory/user) (PD04); quantities still in production appear on that app's **WIP (仕掛品)** tab.

The underlying **sales orders (注文請書)** are managed at `/production/sales-orders` (reachable from the [order acceptance (受注請書)](/manual/en/apps/order-acceptance/user) intake screen). On the sales order detail you can confirm it, run a stock check (reserving available product stock), or cancel it — and go straight to creating a work order for any shortage.

![Work order list with type, approval-status, and status badges](../../assets/screenshots/work-order-list-01.png)

## Creating a work order

1. Open "新規作成" (New) from the list (you can also open it from a sales order detail with that sales order preselected).
2. Search and select the **sales order** (search by sales order number, product, or customer). The customer, product, and ordered quantity are shown once selected.
3. Enter the **type** (在庫分 from stock / 製造分 manufacture) and the **planned quantity**. The quantity field shows a minimum line (the stock floor) as "最低 n（不良予備分は上乗せ可）" (minimum n; defect spares may be added on top), with an inline sufficiency indicator.
4. For manufacture type, select the **material**. Material availability (ATP) is shown inline — a shortage shows the next scheduled receipt, and if none is scheduled, "素材発注を検討してください" (consider ordering material). These are warnings only and never block saving.
5. Select **inspection sheets** as needed (adding a step auto-selects its related inspection sheets).
6. Choose the **process list** (see below).
7. For steps that can run in-house or outsourced, set the **execution location** (in-house → plant / outsourced → supplier) and the work time.
8. Saving creates a **draft** work order and opens the detail page. Editing is possible only while it is a draft.

![New work order form — basic info and process list](../../assets/screenshots/work-order-new-01.png)

### Process list (the product's process route)

Step sequences are registered and versioned per product as **process lists**.

- Once a sales order is selected, the process list section appears. If the product has a process list, **the first list's latest version is auto-selected and its steps are prefilled**. You can switch the list and the **version** (`vN (date)`, defaulting to the latest).
- For a product without a process list, "この製品の工程リストは未登録です（下で新規作成）" (no process list registered — create one below) is shown: enter a **new process list name** (e.g. 標準工程) and it is registered as v1 on save.
- If you change the step composition away from the selected version, a notice explains it will be saved as a new version v{n+1}. The work order detail shows the route used ("list name vN"), linking to the product master's process lists.

Steps are chosen from the category-grouped catalog checklist. Combinations missing a prerequisite step show a red blocker warning and cannot be saved ("工程構成にエラーがあります"). Required companion steps are added automatically.

## Statuses and the approval flow

A work order moves through **下書き (draft) → 承認待ち (pending approval) → 承認済 (approved) → 進行中 (in progress) → 完了 (completed)**, or キャンセル (cancelled).

- **承認依頼 (request approval)** … Run from the draft's detail screen. The work order becomes pending and the sales order is locked against editing.
- **第一承認 (first approval)** (plant manager / department manager class) → **第二承認 (second approval)** (department manager class) … Only members of each approval group (or a delegate within their valid period) can approve or reject. Non-members see a message explaining why. Progress is shown on the stepper in the detail screen.
- After second approval the work order becomes **approved** and steps can start. For manufacture type, the material is automatically **reserved**.
- **差し戻し (reject)** … A reason is required. The rejection reason is shown as a red alert; the work order returns to draft and, after fixing, you can "再承認依頼" (re-request approval).
- The approval panel keeps the **approval records** (stage, approve/reject, approver, timestamp, comment). Records made by a delegate are marked "（代理: original approver）".

Approvals can also be performed by opening the target from the [Approvals](/manual/en/apps/approval/user) app (PD03).

![Work order detail — approval status and process workflow](../../assets/screenshots/work-order-detail-01.png)

## Executing steps

The detail page's "工程ワークフロー" panel lists the steps. While the work order is approved or in progress, "工程実行ビューを開く" opens the execution view (a split view: step navigation on the left, execution screen on the right). Before approval, the panel notes that step execution becomes available after approval.

1. **工程開始 (start step)** … Available once the preceding steps are complete. If the step cannot start, the reasons (e.g. unfinished dependencies, work order not yet approved) are shown. Starting takes a **session lock** — other users see a warning that the step cannot be operated until it is completed or aborted.
2. **Quantity entry** … The fields depend on the step's **quantity-tracking mode**.
   - **Regular steps** … Enter the **input quantity** (defaults to the previous step's good count), the **good count**, and the defect breakdown (**semi-finished** / **scrap** / **rework**).
   - **Inspection steps** … Enter the **inspected count**, **passed count**, and failure breakdown (semi-finished / scrap / rework).
   - **No-quantity steps** … There is no quantity entry — the screen shows "this step completes without quantity recording (pass-through n)" and you complete it directly.
   - In all cases, "good (passed) + defects = input (inspected)" must balance or the step cannot be saved.
3. On **inspection steps**, record measured values per inspection sheet item. Pass/fail is judged automatically by item type, and sampling rules determine the sample count for sampling inspections. On inspection-approval steps, passing records can be approved.
4. **Defect records** … Optionally record a defect type and description (chosen from [Defect Types](/manual/en/masters/defect-type/user)).
5. **Work plans and actuals** … Per step, register planned assignee, date, time, quantity, and work location, and record the actuals.
6. **工程完了 (complete step)** … Finalizes the quantities and hands off to the next step.

For outsourced steps you can record the **request date, expected arrival date, arrival date, and outsourcing cost**.

- **中断（巻き戻し） (abort)** … Returns an in-progress step to not-started with a required reason.
- **巻き戻し (rollback)** … Returns a completed step to not-started. Not possible if downstream steps have started or the stock has already been posted.

## Branches (rework / re-insertion)

From a completed step you can **add a branch**: choose the series of steps to add, the quantity routed through it, and a merge target (a not-yet-started step). Work orders with branches show a branch diagram (DAG) above the workflow panel.

## Completion and inventory

When every step is complete the work order automatically becomes **completed**: the final steps' good pieces are stocked into product inventory under the lot number, semi-finished amounts are stocked as semi-finished inventory, and reserved material is consumed (issued).

## List, search, and other actions

- The list shows work order number / sales order number / product / type (manufacture / from-stock badge) / planned quantity / approval status / status / updated date. Search by work order number, sales order number, or product; filter by type and status.
- **Edit** … drafts only. **Cancel** … drafts and pending-approval only.
- **Copy** … Pick a target sales order and create a draft inheriting the steps, execution locations, and inspection sheets. The source is recorded, and if a newer copy exists a warning suggests copying the latest version instead.
- Detail tabs: **概要 (overview)** (process workflow + notes) / **関連 (related)** (sales order and copy relations) / **履歴 (history)** (audit trail).

Using this app requires the work order (work_order) permission.
