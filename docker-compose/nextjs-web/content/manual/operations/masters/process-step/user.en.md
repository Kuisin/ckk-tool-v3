---
title: "Process Step Master — User Manual"
description: "An app for registering the kinds of work done in the factory, such as 「切断」 (cutting), 「円筒加工」 (cylinder machining) and 「製作検査」 (production inspection). Work orders are built by lining up the steps registered here."
screenshots: [master-process-step-list-01, master-process-step-new-01, master-process-step-deps-01, master-process-step-detail-01, master-process-step-dependencies-01, master-process-step-locations-01]
---
This app is for registering the **kinds of work** done in the factory, such as 「切断」 (cutting), 「円筒加工」 (cylinder machining) and 「製作検査」 (production inspection). The operation code is `MS08`.

The steps on a [指示書 (work order)](/manual/en/operations/production/work-order/user) are chosen from the ones registered here and lined up in order. Work that is not registered here cannot be chosen on a work order.

> ⚠️ This app is in trial release. Depending on your environment, it may not be shown yet.

## What you can do with this app

- You can register the steps done in the factory.
- For each step, you can set what kind of work it is (material preparation, machining, coating, inspection, and so on).
- You can set whether the step is **done in house or can be asked of an outside company**.
- You can set **which numbers the operator must enter** when the step is done (quantity received, good quantity, and so on).
- You can register **order rules** such as "before this step, that step must be finished".

## Words used on this page

- **Step** … one single piece of work, such as 「切断」 (cutting), 「センタレス」 (centerless) or 「製作検査」 (production inspection).
- **Category** … the broad group a step belongs to. There are six: material preparation, machining, coating, inspection, inspection approval, and shipping.
- **Place of work** … whether the step is done only in house, or can also be asked of an outside company.
- **Can run in parallel** … a step that may be done at the same time as another step and recorded together.
- **Quantity tracking** … the setting for which numbers the operator is asked to enter when the step is done.
- **Use dependency / execution dependency** … rules between steps. For details, see "[Set the order rules for steps](#set-the-order-rules-for-steps)".

## Before you start

- You need the **master permission** to use this app. If a button cannot be pressed, please ask someone who has the permission.
- The steps used most often are already registered. First look at the list and check that the same step does not already exist.

## How to read the screen

When you open the app, a list of the registered steps is shown.

![List screen of the process step master](../../../assets/screenshots/master-process-step-list-01.png)

- The list columns are **コード** (code) / **名称** (name) / **カテゴリ** (category) / **実施場所** (place of work) / **同期可** (can run in parallel) / **検査** (inspection) / **承認** (approval) / **数量管理** (quantity tracking) / **表示順** (display order) / **状態** (status).
- Normally the rows are shown from the smallest 「**表示順**」 (display order) number first.
- Type in the 「**コード・名称で検索**」 (search by code or name) box at the top to show only the step you are looking for.
- You can also narrow the list by 「**カテゴリ**」 (category) and 「**状態**」 (status). There are two statuses: 「有効」 (active, can be used) and 「無効」 (inactive, no longer used).
- Click a row to open the detail screen of that step.

## Register a step

1. Press 「**新規作成**」 (New) at the top right of the list screen.
2. Enter text that stands for this step in 「**工程コード**」 (step code), for example `CYLINDER_MACHINING`. Only capital letters, numbers and underscores can be used.
3. Enter the name used on the floor in the Japanese box of 「**名称**」 (name), for example 円筒加工. You can save with the English box left empty.
4. Choose 「**カテゴリ**」 (category).
5. Choose 「**実施場所**」 (place of work). For a step that may be asked of an outside company, choose 「**社内・外注**」 (in house or outsourced).
6. Choose 「**数量管理**」 (quantity tracking). See the explanation below.
7. Choose 「**ロット入力（既定）**」 (lot input — default). This decides whether the operator is asked to enter the material lot or slip code when starting the step (required / optional / none).
8. If you need it, enter the time this step usually takes in 「**既定作業時間**」 (default work time). The unit is hours.
9. Enter a number in 「**表示順**」 (display order). A smaller number comes higher in the list.
10. Press 「**保存**」 (Save).

![New entry form of the process step master](../../../assets/screenshots/master-process-step-new-01.png)

> 💡 「**工程コード**」 (step code) cannot be changed after you save. The name and the display order can be corrected later.

### How to choose the quantity tracking

This decides which numbers the operator enters when the step is done.

- **なし（記録しない）** (none, not recorded) … no number is entered. The quantity coming from the previous step is passed on to the next step as it is.
- **数量管理（受入・良品・不良）** (quantity tracking: received, good, defective) … the quantity received, the good quantity and the defective quantity are entered. Choose this for ordinary machining steps.
- **検査（検査数・合格・不合格）** (inspection: inspected, passed, failed) … the inspected quantity, the passed quantity and the failed quantity are entered. Choose this for inspection steps.

When you turn on the 「**検査工程**」 (inspection step) switch, 「数量管理」 (quantity tracking) changes to 「検査」 (inspection) by itself. If that does not suit you, you can choose again.

### What the switches mean

- **同期可** (can run in parallel) … turn it on for a step that can be done at the same time as another step.
- **検査工程** (inspection step) … turn it on for a step that carries out an inspection.
- **検査承認工程** (inspection approval step) … turn it on for a step where a supervisor checks the inspection result. When you turn it on, the 「**承認必要役職**」 (required approver rank) box appears, so enter something like 係長以上 (section chief or above).
- **有効** (active) … turn it off and the step can no longer be chosen on work orders and elsewhere.

## Set the order rules for steps

You can register two kinds of rules for a step. You set them in 「**使用依存**」 (use dependency) and 「**実行依存**」 (execution dependency) near the bottom of the form.

- **使用依存** (use dependency) … the rule for **when this step may be put on a work order**. For example, if you put 「円筒加工」 (cylinder machining) on the order, then 「円筒加工検査」 (cylinder machining inspection) must be on it too.
- **実行依存** (execution dependency) … the rule for **when this step may be started**. For example, 「円筒加工検査」 (cylinder machining inspection) can start only after 「円筒加工」 (cylinder machining) is finished.

You register both in the same way.

1. Press 「**依存を追加**」 (Add dependency).
2. Type a step name in the 「**依存先の工程を検索**」 (search for the step to depend on) box and choose the other step.
3. To the right of it, choose how the rules are joined.
   - 「**AND（すべて）**」 (AND, all) … all the chosen steps must be there.
   - 「**OR（いずれか）**」 (OR, any) … any one of them is enough.
4. If you want to leave a note, enter it in the 「**備考**」 (remarks) box on the right.
5. Press 「**保存**」 (Save).

![Screen for entering step dependencies](../../../assets/screenshots/master-process-step-deps-01.png)

Only the 「使用依存」 (use dependency) rows have a 「**排他**」 (exclusive) switch. Turning it on reverses the meaning: the rule becomes "this step can be used only when that step is **not** on the order". Use it for steps that are never put together, such as 「溝」 (groove) and 「刃裏」 (blade back).

To remove a row, press the red button at the right end of the row.

> ⚠️ You cannot choose the step itself as the other side. You cannot enter the same partner in two rows either. When you save, the rows shown on that screen become the registered content exactly as they are (rows you removed are gone).

## Check a registered step

Click a row in the list to open the detail screen of that step.

![Detail screen of the process step master](../../../assets/screenshots/master-process-step-detail-01.png)

The step code, name, category, place of work, quantity tracking, default work time, display order and so on are shown together at the top. Below there are three tabs.

- **概要** (overview) … shows the allowed work locations (「制限なし」 — no restriction — when there is none, or the list of types and locations when there is) and what you wrote in the remarks.
- **依存関係** (dependencies) … shows the use dependencies and the execution dependencies, each in its own table. Click a row to move to the screen of the other step.
- **履歴** (history) … the record of who changed what and when.

![Dependencies tab of the process step master](../../../assets/screenshots/master-process-step-dependencies-01.png)

When there is no rule at all, 「**使用依存はありません（単独でワークフローに含められます）**」 (there is no use dependency; it can be included in a workflow on its own) and 「**実行依存はありません（先行工程なしで開始できます）**」 (there is no execution dependency; it can start with no preceding step) are shown. Both mean "no restriction".

## Stop a step you no longer use

For a step you no longer use, it is better to **stop** it (make it inactive) than to delete it. Even after you stop it, the past records stay as they are.

1. Press 「**…**」 (the three-dot button) at the top right of the detail screen.
2. Choose 「**無効化**」 (Deactivate).
3. A small confirmation window appears, so press 「**無効化する**」 (Deactivate).

You can also tick several rows in the list and stop them together with 「**一括無効化**」 (Deactivate selected).

## Input fields

Every field on the process step screen. Steps registered here are the building blocks laid out in a work order's workflow.

| Field | Required | What to enter |
|-------|----------|---------------|
| [Step code / name](#field-code) | Required | Reference code and name |
| [Category](#field-category) | Required | Material prep, machining, inspection and so on |
| [Location](#field-execution) | Required | Internal only, or outsourcing allowed |
| [Allowed work locations](#field-allowed-locations) | Optional | Restricts which work locations this step can use |
| [Quantity tracking](#field-quantity-tracking) | Required | How the step handles piece counts |
| [Lot input (default)](#field-lot-input-mode) | Required | Whether a lot / slip code must be entered at start |
| [Default work time](#field-default-time) | Optional | Typical time per run |
| [Can run in parallel](#field-sync) | — | Whether it can run alongside others |
| [Inspection / inspection approval](#field-inspection) | — | Whether it is an inspection step |
| [Approval rank required](#field-approval-rank) | Optional | Rank needed to approve |
| [Sort order](#field-sort-order) | Optional | Order in lists |
| [Active / notes](#field-active) | — | Whether it is offered, plus notes |

### Step code / name [#field-code]

The step's reference code and name; the name is what appears in the work order.

### Category [#field-category]

Material preparation, machining, coating, inspection, inspection approval or shipping.

### Allowed work locations [#field-allowed-locations]

![The allowed work locations section on the edit form](../../../assets/screenshots/master-process-step-locations-01.png)

Restricts which work locations can be used in **plans and actuals** of this step. Specify by type (machine / area, etc.), by individual locations, or both (the union is allowed). **Leave both empty for no restriction** (all work locations usable).

- When adding plans/actuals on a work-order step, the select is filtered to allowed locations only
- The same restriction applies on shop-floor tablets (kiosk): scanning a disallowed work-location QR is rejected, and a device default outside the list is not recorded on actuals
- Kiosk devices with the "restrict work location" toggle ON can only start steps whose allowed list includes the device's default location

### Location [#field-execution]

**Internal only**, or **internal or outsourced**. Allowing outsourcing lets a work order pick a subcontractor for the step.

### Quantity tracking [#field-quantity-tracking]

How the step handles piece counts: **pass through, count as inspection, or do not count.** It changes which inputs appear on the execution screen.

### Lot input (default) [#field-lot-input-mode]

Whether the operator is asked to enter the material **lot or slip code** when starting the step. With 「**必須**」 (required), the step cannot start until the code is entered. 「**任意**」 (optional) lets the step start with or without it, and 「**なし**」 (none) shows no input box. This is only the default — it **can be changed per step** on the product's process list or on the work order.

### Default work time [#field-default-time]

Typical time per run, used as the initial value when a work order is created.

### Can run in parallel [#field-sync]

Whether the step can proceed alongside other steps.

### Inspection / inspection approval [#field-inspection]

Whether the step performs inspection, or approves inspection results. **Inspection steps allow an inspection sheet to be recorded during execution.**

### Approval rank required [#field-approval-rank]

The rank required to approve this step.

### Sort order [#field-sort-order]

Order in lists and pick lists. Smaller comes first. **This number also decides the initial order of the steps when you pick them into a process list or a work order** (issue / handoff steps always come first and pre-ship inspection always comes last, regardless of the number). The order of process lists and work orders already created does not change when you change the number later.

### Active / notes [#field-active]

Turning it off removes it from step pick lists. Notes are free text.

## Questions and problems

**Q. I see 「他の工程がこの工程に依存しているため削除できません。無効化を検討してください。」 (this step cannot be deleted because other steps depend on it; please consider deactivating it).**
A. Another step uses this step as the partner in an order rule. Do not delete it; deactivate it instead. If you really must delete it, first remove the rule row from the other step.

**Q. I see 「この工程に関連する検査表テンプレートが存在するため削除できません。無効化を検討してください。」 (this step cannot be deleted because an inspection sheet template is linked to it; please consider deactivating it).**
A. An [inspection sheet template (検査表テンプレート)](/manual/en/operations/masters/inspection-template/user) has this step set as its related step. Do not delete it; deactivate it instead.

**Q. I see 「同じ工程コードの工程が既に存在します」 (a step with the same step code already exists) and cannot save.**
A. That code is already in use. Search for the code in the list and check whether the same step exists. If it is a different step, give it another code.

**Q. I see 「工程コードは英大文字はじまりの英大文字・数字・アンダースコアで入力してください」 (enter the step code using capital letters, numbers and underscores, starting with a capital letter).**
A. Only capital letters, numbers and the underscore ( `_` ) can be used in a code. The first character must be a capital letter. Japanese text and small letters cannot be used.

**Q. I entered the wrong step code. Can I correct it?**
A. It cannot be corrected after you save. Register a new step with the correct code and deactivate the wrong one.

**Q. I want to change the order of the list.**
A. Change the 「**表示順**」 (display order) number of each step. A smaller number comes higher. If you leave gaps, such as 10, 20 and 30, it is easier to add a step in between later.

**Q. Which decides the order of the work — the display order or the execution dependency?**
A. The order is decided by the 「**表示順**」 (display order). When you pick steps into a process list or a work order, they line up from the smallest number first (the order of work orders already created does not change when you change the number later). The 「**実行依存**」 (execution dependency) is not an order itself — it sets the **condition for starting**, such as "this step cannot start until that step is finished".
