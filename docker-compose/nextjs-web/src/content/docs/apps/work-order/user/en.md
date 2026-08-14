# Work Order (指示書) — User Manual

Operation code **PD02**. Create work orders (指示書) — manufacturing instructions for the plant floor — and manage them from approval through step execution and completion.

> This app is currently available **in the development (dev) environment only**. Screens and steps may change before the production release.

## What you can do with this app

A work order (指示書) states "for this sales order (注文請書), make this many pieces using this sequence of process steps". Work order numbers are a global serial and double as the **lot number**.

- Pick a sales order and build the **process workflow** from the process step catalog.
- After creation, submit an **approval request**; production can start after first and second approval.
- Each step is started, quantity-recorded, and completed on the **step execution screen**.
- When all steps are complete, the good pieces are stocked as a lot in [Product Inventory](/docs/apps/product-inventory/user).

The underlying **sales orders (注文請書)** are managed at `/production/sales-orders` (reachable from the [order acceptance (受注請書)](/docs/apps/order-acceptance/user) intake screen). On the sales order detail you can confirm it, run a stock check (reserving available product stock), or cancel it — and go straight to creating a work order for any shortage.

## Creating a work order

1. Open "新規作成" (New) from the list (you can also open it from a sales order detail with that sales order preselected).
2. Search and select the **sales order**, then enter the **type** (在庫分 from stock / 製造分 manufacture) and the **planned quantity**.
3. For manufacture type, select the **material**. Stock sufficiency or shortage is shown inline (a shortage does not block saving — it is a purchasing signal).
4. Select **inspection sheet templates** as needed.
5. Choose the **process steps** from the category-grouped catalog checklist. If a prerequisite step is missing, a red warning appears and you cannot save. "必須工程を自動追加" (auto-add required steps) adds all missing prerequisites at once.
6. For steps that can run in-house or outsourced, set the **execution location** (in-house → plant / outsourced → supplier).
7. Saving creates a **draft** work order with steps in the catalog's default order.

## Statuses and the approval flow

A work order moves through **下書き (draft) → 承認待ち (pending approval) → 承認済 (approved) → 進行中 (in progress) → 完了 (completed)**, or キャンセル (cancelled).

- **承認依頼 (request approval)** … Run from the draft's detail screen. The work order becomes pending and the sales order is locked against editing.
- **第一承認 (first approval)** (plant manager / department manager class) → **第二承認 (second approval)** (department manager class) … Only members of each approval group (or a delegate within their valid period) can approve or reject. Progress is shown on the stepper in the detail screen.
- After second approval the work order becomes **approved** and steps can start. For manufacture type, the material is automatically **reserved**.
- **差し戻し (reject)** … A reason is required. The work order returns to draft; after fixing it you can "再承認依頼" (re-request approval).

Approvals can also be performed by opening the target from the [Approvals](/docs/apps/approval/user) app (PD03).

## Executing steps

Open each step's execution screen from the "工程ワークフロー" panel on the detail page (large touch-friendly controls designed for tablets).

1. **工程開始 (start step)** … Available once the preceding steps are complete. If the step cannot start, the reasons (e.g. unfinished dependencies) are shown. Starting takes a **session lock** so other users cannot operate the step.
2. **Quantity and defect entry** … Enter the **input quantity** (defaults to the previous step's good count), the **good count**, and the defect breakdown (**semi-finished** / **scrap** / **rework**). If "good + defects ≠ input", a warning appears and you cannot complete.
3. On **inspection steps**, record measured values and pass/fail per inspection sheet item. All items passing gives **合格 (pass)**; any failure gives **不合格 (fail)**. On inspection-approval steps, passing records can be approved.
4. **Defect records** … Optionally record a defect type and description (chosen from [Defect Types](/docs/masters/defect-type/user)).
5. **工程完了 (complete step)** … Finalizes the quantities and hands off to the next step.

For outsourced steps you can record the **request date, expected arrival date, arrival date, and outsourcing cost**. Entering the arrival date notifies the work order's creator.

- **中断（巻き戻し） (abort)** … Returns an in-progress step to not-started with a reason. Quantities being entered are not saved.
- **巻き戻し (rollback)** … Returns a completed step to not-started with a reason. Not possible if downstream steps have started, or if the work order is already completed (inventory already posted).

## Branches (rework / re-insertion)

From a completed step's menu you can **add a branch**: choose the series of steps to add, the quantity routed through it, and optionally a merge target (a not-yet-started step). Work orders with branches show a branch diagram (DAG) above the workflow panel.

## Completion and inventory

When every step is complete the work order automatically becomes **completed**: the final steps' good pieces are stocked into product inventory under the lot number, semi-finished amounts are stocked as semi-finished inventory, and reserved material is consumed (issued).

## List, search, and other actions

- The list can be searched by work order number, sales order number, or product, and filtered by type and status.
- **Edit** … drafts only. **Cancel** … drafts and pending-approval only (also unlocks the sales order).
- **Copy** … Creates a draft for a chosen sales order, inheriting the steps, execution locations, and inspection sheets. The source is recorded, and a warning appears if newer copies already exist.

Using this app requires the work order (work_order) permission.
