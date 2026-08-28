---
title: "Work Order — User Manual"
description: "An app for making the document that decides which product to make, how many, and in what order at the factory, and for recording everything from approval to the end of the work."
screenshots: [work-order-list-01, work-order-new-01, work-order-detail-01, work-order-approval-01, work-order-steps-01, work-order-step-quantity-01, work-order-step-records-01]
---
This app is for making the document (**指示書**, work order) that decides which product to make, how many, and in what order at the factory, and for recording everything from approval to the end of the work. The operation code is `PD02`.

> ⚠️ For now this app works **only in the test environment**. The screens and the steps may change before it can be used for real work.

## What you can do with this app

- You can make instructions for the factory, based on a customer's order (the order line).
- You can send the work order you made to your manager and get **承認** (approval).
- For each piece of work (each step), you can record that it **started, finished, and how many pieces were made**.
- When defects come up, you can record how many and why.
- When all the work is done, the finished products **go into stock automatically**.

## Words used on this page

- **注文明細** (order line) … an internal document that splits a customer's order by product and by quantity. You choose one of these to make a work order.
- **割当** (allocation) … the link that says which order lines this work order makes pieces for, and how many. You may split one order line across several work orders (splitting), or combine several order lines of the same product into one work order (a combined lot).
- **工程** (step) … one stage of the work, such as cutting, step machining, or inspection.
- **工程リスト** (step list) … the order of the steps for making a product, registered in advance.
- **ロット番号** (lot number) … a serial number such as `#9001` given to a batch of products you made. It is assigned automatically when a work order is created, and is used to trace the lot through stock and shipping.
- **受入数 / 良品数** (received quantity / good quantity) … the received quantity is how many pieces came into that step; the good quantity is how many pieces are fine to pass on.
- **承認グループ** (approval group) … the list of people who are allowed to approve. Only people on this list can approve.

## Before you start

- You need a **order line** first. Order lines are made from the import screen of [order acceptance](/manual/en/operations/sales/order-acceptance/user), and you can check them on the order line screen (operation code `SA05`).
- When you run 「**在庫照合**」 (Check stock) on the order line screen, the stock you already have is set aside for that order. You make the missing amount with this app.
- People who approve must be registered in an [approval group](/manual/en/operations/masters/approval-setting/user) in advance.

## How to read the screen

When you open the app, you see a list of the work orders made so far.

![Work order list](../../../assets/screenshots/work-order-list-01.png)

- **指示書番号** (work order number) … a number such as `WOR-202608-00001`, in the same format as other documents (quotes, order acceptances, …), restarting from 1 each month. The lot number (a serial number such as `#9001`) is assigned separately and shown on the detail screen.
- **種別** (type) … either 「**在庫分**」 (from stock — using stock you already have) or 「**製造分**」 (to make — making new pieces).
- **予定数量** (planned quantity) … how many pieces you plan to make.
- **承認状態** (approval status) … a coloured badge shows 「承認待ち」 (waiting for approval), 「承認済」 (approved) or 「差し戻し」 (sent back). Which step it is currently on is shown on the card on the detail screen.
- **状態** (status) … one of 「下書き」 (draft), 「承認待ち」 (waiting for approval), 「承認済」 (approved), 「進行中」 (in progress), 「完了」 (finished), or 「キャンセル」 (cancelled).
- Type a work order number, a order line number, or a product name into the search box at the top to find one. You can also narrow it down with 「**種別**」 (type) and 「**状態**」 (status).
- Click a row to open the detail screen for that work order.

## Creating a work order

1. Press 「**新規作成**」 (New) at the top right of the list screen. You can also open it from the order line screen, in which case the order line is already chosen.
2. In 「**注文明細の割当**」 (order line allocations), choose the order line to base it on. You can search by order line number, product, or customer. Once you choose it, the customer name, the product, the ordered quantity, and the **remaining allocatable quantity** (the ordered quantity minus what other work orders already cover) appear below.
3. In 「**割当数量**」 (allocation quantity), enter how many pieces this work order makes for that order line. The remaining quantity is filled in automatically, so change it only when you make just a part (splitting).
4. To make other order lines of the same product at the same time (a combined lot), press 「**明細を追加（統合ロット）**」 (add order line — combined lot) and add rows. Order lines for different products cannot go on the same work order.
5. In 「**種別**」 (type), choose 「在庫分」 (from stock) or 「製造分」 (to make). A from-stock work order can have only one order line. **A from-stock work order has a fixed step set — 「製品出し（在庫）」 (product issue from stock) plus, if needed, 「出荷前検査」 (pre-ship inspection) — and does not use a step list**, so steps 10–12 below apply to made-to-order work orders only.
6. Enter how many pieces to make in 「**予定数量**」 (planned quantity). The total of the allocations is filled in automatically and you cannot enter less than that. Adding extra as spares for defects is up to you.
7. If you chose 「製造分」 (to make), choose the 「**使用素材**」 (material to use).
8. If you already know where the finished products will be kept, choose the 「**保管場所**」 (storage location). It can stay empty.
9. 「**検査表**」 (inspection sheets) are assigned **per inspection step**. When you pick a step, the sheets that name it as their related step are chosen automatically; add more in each step's selector if any are missing.
10. Choose the 「**工程リスト**」 (step list). See the next section (made-to-order only).
11. For steps that can be done either in-house or outside, choose 「**社内**」 (in-house) or 「**外注**」 (outsourced) — then choose the site for in-house, or the partner company for outsourced. For each step you can also change 「**ロット入力**」 (lot input — default / lot required / lot optional / no lot) and 「**作業時間**」 (work hours — a rough estimate of the time it takes). A step set to "lot required" cannot be started on the floor without entering a lot or slip code.
12. In 「**作業計画（担当者）**」 (work plans — assignees), you can assign a person in charge to each step (optional). Steps with an assignee get a work plan with a planned date. To set times or quantities as well, add them in each step's plan table after creating the work order.
13. Press 「**保存**」 (Save).

![New work order form](../../../assets/screenshots/work-order-new-01.png)

When you save, a 「**下書き**」 (draft) work order is created and its detail screen opens.

> 💡 You can also make only part of an order line first (splitting). The remaining pieces stay listed under 「未手配」 (not yet arranged) on the 未処理指示書 (pending work orders) screen (operation code `PD05`), so you can make them later with another work order.

If there is not enough material, you see a note such as 「**素材在庫が 30 不足しています**」 (material stock is short by 30). This is only a warning, so you can still save. If nothing is due to arrive, you see 「**入荷予定がありません。素材発注を検討してください**」 (nothing is due to arrive — please consider ordering material).

### About the step list

The order of the steps is registered per product as a 「工程リスト」 (step list). **Made-to-order work orders only** — from-stock work orders have a fixed step set and do not use one.

- Besides 「**汎用**」 (generic) lists usable for any customer, you can also make lists **dedicated to a specific customer**. When you choose a order line, the list is chosen automatically in this order: the list dedicated to that customer → the generic list → the first one in the list. A list dedicated to a different customer is never chosen automatically (you can still pick one by hand).
- When dedicated lists are mixed in, the choices are labelled so you can tell them apart, such as 「リスト名（お客様名）」 (list name — customer name) and 「リスト名（汎用）」 (list name — generic).
- If you choose a different 「**バージョン**」 (version), you can use an earlier order of steps.
- If the product has no step list yet, you see 「**この製品の工程リストは未登録です（下で新規作成）**」 (this product has no step list yet — create one below). Enter a 「**新しい工程リスト名**」 (new step list name), such as "standard steps", and saving registers it as a new list. When creating one, you can choose in 「**対象顧客**」 (target customer) between "dedicated to ◯◯" and 「**汎用（全顧客）**」 (generic — all customers). A dedicated list is chosen first on work orders for the same customer × product.
- If you add or remove steps, you see a note saying the list will be saved as a new version. The contents of work orders you used before do not change.

You pick steps from a checklist. The layout and rules are:

- Pick **exactly one** step from the top section 「**出し・受渡し（開始）**」 (issue / handoff — start): 素材出し, 半製品出し, 素材受渡し or 製品受渡し (picking another one replaces it). **Every step sequence starts there.**
- A step whose prerequisite has not been picked yet is disabled (grayed out) with a hint such as 「**要: 全長合わせ**」 (requires: length adjust). The other way around, inspections and approvals a step needs are added automatically when you pick it.
- The bottom section 「**出荷前検査（任意）**」 (pre-ship inspection — optional) can be added or left out; when added it always runs last. **Shipping itself is not a step — it is managed by the [delivery order](/manual/en/operations/shipping/delivery-order/user).**
- If the combination has a problem, a red note appears and you cannot save (「**工程構成にエラーがあります**」 — there is an error in the step setup). Please fix the steps until the red note is gone.

After saving, the work order detail screen shows 「**工程ルート**」 (step route) with the name and version of the step list used, for example "standard steps v1". You can open the product's step list from there.

## Getting approval

Work cannot start on a work order until it is approved. **How many approval stages it goes through** is decided in the [approval settings](/manual/en/operations/masters/approval-setting/user), and the number of stages can differ depending on what is in the document. The card on the screen shows which stage it is currently on.

1. On the work order screen, press 「**承認依頼**」 (Request approval) on the card at the very top.
2. The status changes to 「**承認待ち**」 (waiting for approval). From this point, the original order line can no longer be edited.
3. The person approving each stage presses 「**承認**」 (Approve) in turn.
4. Once the last stage is through, the status becomes 「**承認済**」 (approved) and the work can start.

![Approval status panel of a work order](../../../assets/screenshots/work-order-approval-01.png)

- Only people **in the approval group** for that step, and stand-ins appointed for a set period, can approve. If you are not in the group, the buttons do not appear and the screen shows 「◯◯ のメンバーのみ承認・差し戻しできます」 (Only members of that group can approve or send back). In addition, you also need **permission to view or edit that work order** (including the scope of the site in charge) — someone in the group who cannot open the document cannot approve it.
- If there is a problem, press 「**差し戻し**」 (Send back). You must enter a 「**差し戻し理由**」 (reason for sending back).
- A work order that was sent back returns to 「下書き」 (draft) and the reason appears in red on the screen. After fixing it, you can send it out again with 「**再承認依頼**」 (Request approval again).
- Records of approvals and send-backs stay under 「手続き状況」 (procedure status). Ones approved by a stand-in are marked 「（代理: 原承認者）」 (stand-in for the original approver).

You can also approve from the list in [approval management](/manual/en/operations/production/approval/user) (PD03).

When a 「製造分」 (to make) work order is approved, the material it will use is **set aside (reserved)** for that work order.

## Connecting a preceding work order (quantity handoff)

A work order can **start by receiving the finished pieces of another work order** — for example a work order that makes a base material, followed by one that finishes it. Set this up in 「**関連指示書（数量受け渡し）**」 (related work orders — quantity handoff) on the work order screen.

1. Press 「**先行指示書を追加**」 (Add preceding work order).
2. In 「**先行指示書番号**」 (preceding work order number), enter the lot number of the work order that must finish first.
3. 「**受け渡し数量**」 (handoff quantity) is optional. If you leave it empty, the full finished quantity of the preceding work order is received when it completes.

Once a preceding work order is connected, the first step here cannot start until that work order is finished (the screen shows 「先行指示書 #◯◯ が未完了です」 — preceding work order #◯◯ is not finished yet). When it finishes, its finished quantity becomes the **initial received quantity** of the first step here.

## Working through the steps

At the bottom of the work order screen is 「**工程ワークフロー**」 (step workflow), where the steps are listed in order.

![Work order detail screen and step workflow](../../../assets/screenshots/work-order-detail-01.png)

Once approval is done, a link called 「**工程実行ビューを開く**」 (Open step execution view) appears at the top right. Pressing it opens a screen with the list of steps on the left and the work recording screen on the right. Before approval and after completion, the same screen can still be opened from 「**工程ビューを開く**」 (Open step view), but it is **view only** and the work cannot be operated (the link is marked 「（実行は承認後）」 — execution after approval — or 「（閲覧のみ）」 — view only).

![Step execution view](../../../assets/screenshots/work-order-steps-01.png)

### Starting the work

1. From the list on the left, choose the step you are about to do.
2. On steps set up to record lots, enter the material lot or slip code in 「**ロット/伝票コード**」 (lot / slip code). On "required" steps you cannot start without it; on "optional" steps it can stay empty. The code can still be corrected while the step is in progress.
3. Press 「**工程開始**」 (Start step).
4. If it cannot be started — for example because the previous step is not finished — you see 「**開始できません**」 (Cannot start) with the reasons listed.

Once you start the work, that step is marked as being used by you. Other people see 「**別のユーザーがセッション中です**」 (Another user is working on this) and cannot operate it.

### Recording the quantity and finishing

Once you start a step, the 「**数量・不良**」 (quantity and defects) boxes appear.

![Quantity and defect entry screen for a step](../../../assets/screenshots/work-order-step-quantity-01.png)

- **受入数** (received quantity) … how many pieces came into that step. The good quantity of the previous step is filled in automatically and you cannot change it here (it shows 「固定」 — fixed).
- **良品数** (good quantity) … calculated automatically (it shows 「自動計算」 — calculated automatically). It goes down by the number of defects you enter.
- **総不良数** (total defects) … the total of the numbers entered on the defect lines. This is also shown automatically.
- **不良内訳** (defect breakdown) … enter this only when there are defects. Press 「**不良を追加**」 (Add defect) and fill in the following on each line:
  - Type … 「**半製品**」 (semi-finished — put back into stock) / 「**廃棄**」 (scrapped) / 「**工程分岐**」 (step branch — pieces sent to another step, such as rework)
  - Defect type (required) … choose from 「**不良種類を選択**」 (Select defect type), which lists what is registered in [defect types](/manual/en/operations/masters/defect-type/user)
  - Number of pieces
  - Details (required) … describe in words what the defect was
- Finally, press 「**工程完了**」 (Complete step).

On inspection steps, the boxes are named differently, such as 「**検査数**」 (number inspected), 「**合格数**」 (number passed), 「**不合格（半製品）**」 (failed — semi-finished), and 「**不合格（工程分岐）**」 (failed — step branch). On steps where no quantity is recorded, no boxes appear; the screen shows something like 「この工程は数量記録なしで完了します（通過数 51）」 (this step finishes without recording a quantity — 51 pieces passing through) and you can simply complete it.

> ⚠️ If the defects add up to more than the received quantity, you see 「**不良の合計（55）が受入数（51）を超えています**」 (the defect total, 55, is more than the received quantity, 51) and you cannot complete the step. Please check the numbers again. Also, if a defect line is missing its defect type or details, you see 「**不良の各行に種類と詳細を入力してください**」 (enter a type and details on every defect line). Fill in every line before completing the step.

### Other things you can record

- **検査記録** (inspection record) … on inspection steps, you enter the measured value for each item on the inspection sheet. Pass or fail is judged automatically according to the type of item. For sampling inspections, where you do not measure everything, the number to inspect is decided by the sample size rules. On inspection approval steps, you can approve inspection records that passed.
- **不良記録（任意）** (defect record, optional) … you can write down the defect type and what happened.
- **作業計画 / 作業実績** (work plan / work result) … you can record who, when, where, and how many pieces will be done (or were done), using the person in charge, date, time, quantity, and work place (see "Work plans and work actuals" below).
- **外注日程** (outsourcing schedule) … on outsourced steps, you can record 「依頼日」 (sent date), 「入荷予定日」 (expected return date), 「入荷日」 (return date), and 「外注費」 (outsourcing cost).

### Work plans and work actuals

Near the bottom of the step screen there are 「**作業計画**」 (work plans) and 「**作業実績**」 (work actuals) tables. Each row records the person, date (or times), quantity, and the **work location**.

![The work plan and work actual tables with work locations](../../../assets/screenshots/work-order-step-records-01.png)

- **作業場所（任意）** (work location, optional) … which machine or area the work happens (happened) at. For steps whose [process step](/manual/en/operations/masters/process-step/user#field-allowed-locations) restricts allowed work locations, only the allowed places can be chosen
- When a step is started or resumed from a shared floor tablet, the actual row is created automatically and its work location is filled with the tablet's **default work location** (or a scanned work-location QR)
- Actuals entered by hand here can carry a work location the same way
- **同時作業数** (concurrent work count) … an actual where one person was working on several steps at the same time gets a 「**同時 ◯**」 (concurrent ◯) badge. The working time is counted as the elapsed time divided by the number of concurrent steps (proration) — for example, two at once counts as half each

### When you want to redo something

- **中断（巻き戻し）** (pause and roll back) … puts a step that is in progress back to not started, with a reason. Any quantity you had entered is not kept.
- **巻き戻し** (roll back) … puts a finished step back to not started. It cannot be done if the next step has already started, or if the pieces have already gone into stock.

## Sending step-branch pieces down a different path (adding a branch)

Sometimes you want the pieces sent to a step branch to go through different steps.

1. On the card of a finished step, press the button with three dots.
2. Choose 「**分岐追加**」 (Add branch).
3. In 「**追加する工程（実行順）**」 (steps to add, in the order they run), choose the steps to go through.
4. Enter how many pieces to send down this path in 「**分岐数量**」 (branch quantity).
5. Choose how the branch ends — 「**本流へ合流**」 (rejoin the main line) or 「**在庫へ**」 (to stock). You must choose one.
   - 「**本流へ合流**」 (rejoin the main line) … in 「**合流先（未着手のメインライン工程）**」 (where it rejoins — main-line steps not started yet), choose which step the pieces come back to.
   - 「**在庫へ**」 (to stock) … in 「**入庫先**」 (stock destination), choose semi-finished or finished product. The good pieces of the branch's last step go into that stock when the work order completes.
   - If you choose neither, you see 「合流先を選ぶか、「在庫へ」を選んでください。分岐は必ず合流か在庫で終わります。」 (choose where it rejoins, or choose "to stock" — a branch must end in a rejoin or in stock) and the branch cannot be added.
6. Press 「**分岐を追加**」 (Add branch).

Once you make a branch, a picture of the flow of the steps appears above the step workflow, showing how many pieces go from which step to where.

After creating a branch, you can still change the **branch quantity** (only while every step in the branch is not started) and **how it ends** (the rejoin target or stock destination — only while the last step is not started) from the pencil button on the branch block. To swap the steps themselves, delete the branch and make it again.

### Changing a branch may also need approval

If you add, change, or delete a branch on an approved or in-progress work order, and the [approval settings](/manual/en/operations/masters/approval-setting/user) have a 「工程フロー変更」 (step flow change) stage, the change takes effect **only after it goes through approval**. Depending on the settings, it works in one of two ways.

- **事前承認** (approval first) … the change is held, and is applied to the steps only after approval is done. While it is held, a card appears at the top of the work order screen (people who can approve see approve / send-back buttons).
- **事後承認** (approval afterwards) … the change is applied to the steps right away, and the approval happens afterwards. If it is sent back later, the steps are not put back automatically, so a red notice appears on the screen. Check the steps, fix them by hand if needed, and press 「**確認済みにする**」 (Mark as checked).

If the approval settings have no 「工程フロー変更」 (step flow change) stage at all, the change is applied as it is, without approval.

## When everything is finished

When all the steps are finished, the work order automatically becomes 「**完了**」 (finished).

- The good pieces from the last step go into product stock, with the lot number.
- Pieces marked as 「半製品」 (semi-finished) go into stock as semi-finished items.
- The material that was set aside is taken out of stock as material used.

You can check stock in [inventory management](/manual/en/operations/production/product-inventory/user) (PD04). Pieces still being made are shown on the 「**仕掛品**」 (work in progress) tab of the same app.

## Other things you can do

- **編集** (edit) … only while it is 「下書き」 (draft). Press 「**編集**」 (Edit) at the top right of the screen.
- **キャンセル** (cancel) … only while it is 「下書き」 (draft) or 「承認待ち」 (waiting for approval). Choose 「**キャンセル**」 (Cancel) from the button with three dots at the top right.
- **コピー** (copy) … choose 「**コピー**」 (Copy) from the button with three dots at the top right, then choose the order line to use. You get a draft that keeps the steps, the places where they are done, and the inspection sheets. Where it was copied from stays on the detail screen as 「**コピー元**」 (copied from). If there is a newer version than the one you copied, a note suggests copying the latest version.
- **ストリップ印刷** (strip print) … choose 「**ストリップ印刷**」 (Strip print) from the button with three dots at the top right to print strips with the key points of the work order and a QR code (6 strips on a plain A4 sheet). You can stick them on the pieces or the boxes.
- The tabs on the detail screen are 「**概要**」 (overview — steps and notes), 「**関連**」 (related — the original order line and where it was copied from), and 「**履歴**」 (history — who changed what and when).

You need work order permission to use this app.

## Input fields

Every field on the work order screen. The order of the steps themselves is set in the process list.

| Field | Required | What to enter |
|-------|----------|---------------|
| [Order line allocations](#field-order-line) | Optional | Which orders this work order makes pieces for, and how many |
| [Allocation quantity](#field-alloc-quantity) | Conditional | How many pieces for that order line |
| [Product](#field-product) | Required | The product being made |
| [Planned quantity](#field-planned-quantity) | Required | How many pieces |
| [Material](#field-material) | Optional | The material used |
| [Storage location](#field-storage-location) | Optional | Where the finished products are kept |
| [Drawing to use](#field-design-file) | Optional | Which version of the drawing to build from |
| [Process list / version](#field-route) | Required (made-to-order) | Which sequence of steps to use |
| [New process list name](#field-new-route-name) | Conditional | Name when creating a new list |
| [Inspection sheets](#field-inspection-templates) | Optional | Templates per inspection step |
| [Lot input](#field-lot-input-mode) | Optional | How the lot / slip code is recorded per step |
| [Work hours](#field-step-work-hours) | Optional | A rough estimate of the time each step takes |
| [Work plans (assignees)](#field-step-plans) | Optional | The person in charge and planned date per step |
| [Notes](#field-notes) | Optional | Notes |

### Order line allocations [#field-order-line]

Which orders the work order is for. By adding rows you can **combine several order lines of the same product into one work order (one lot)**, and the other way round, you can split one order line across several work orders. **It can be left empty for work orders that only build stock** (standalone stock work orders).

### Allocation quantity [#field-alloc-quantity]

How many pieces this work order makes for that order line. The upper limit is that line's **remaining allocatable quantity** (the ordered quantity minus what other work orders already cover).

### Product [#field-product]

The product being made. Choosing a order line fills in that order's product.

### Planned quantity [#field-planned-quantity]

How many pieces to make. Enter **at least the total of the allocations** (adding extra as spares for defects is up to you; for a from-stock work order it equals the allocation total). It also becomes **the initial received quantity of the first step** (but if a preceding work order is connected, its finished quantity becomes the received quantity instead).

### Material [#field-material]

The material used. When the work order is approved, **this material is reserved from stock.**

### Drawing to use [#field-design-file]

**Pins** the version of the drawing the shop floor sees. Optional.

Left empty, nothing is pinned and the **newest version at the time** is shown whenever the screen is opened — so if the drawing is revised, what the floor sees changes with it. The field's description shows what would be used ("固定しない場合: …").

Pick a version and it is pinned: later revisions do not change what the floor sees. **A pinned version can no longer be edited or deleted**, because it is the record of what the part was made from.

Drawings are split per product × customer. When nothing is pinned, the series for this work order's customer is used, falling back to the generic series. **Another customer's drawings are never chosen** — showing them silently would mean making the wrong part without noticing. If a work order bundles order lines from more than one customer, the generic series is used.

Pinning and unpinning are also available on the 図面 (drawing) tab of the work order.

### Storage location [#field-storage-location]

Where the finished products are kept. Choose from the [storage location](/manual/en/operations/masters/storage-location/user) master. If it is not decided yet, it can stay empty.

### Process list / version [#field-route]

Which sequence of steps to use, chosen from the lists registered for that product. **Choosing a version copies that sequence as it stands** — editing the process list later does not change work orders already created. Not used for from-stock work orders (their step set is fixed).

### New process list name [#field-new-route-name]

The name when creating a new process list here. It becomes selectable for the same product next time.

### Inspection sheets [#field-inspection-templates]

The inspection templates used per inspection step. Several can be selected; picking a step auto-selects the sheets that name it as their related step, and each inspection step offers its own assigned sheets during execution.

### Lot input [#field-lot-input-mode]

How the lot / slip code is recorded for each step. Choose from "default" (as set in the process step master), "lot required", "lot optional", or "no lot". A "lot required" step cannot be started on the floor without entering the code.

### Work hours [#field-step-work-hours]

A rough estimate of the time each step takes, in hours. It is shown on the step card as 「予定 ◯h」 (planned ◯h), so you can compare it with the actuals.

### Work plans (assignees) [#field-step-plans]

The person in charge and the planned date for each step (optional). Steps with an assignee get a work plan, and the work appears in the 「工程実行」 (step execution) list on that person's floor tablet. To set times or quantities as well, add them in each step's plan table after creating the work order.

### Notes [#field-notes]

Notes. **The floor reads this when working from the order.** Put anything to watch out for here.

## Questions and problems

**Q. I can open the step screen, but cannot start the work.**
A. That work order has not been approved yet. While the link says 「**工程ビューを開く**（実行は承認後）」 (Open step view — execution after approval), you can only view it. Please get it approved first.

**Q. The approval buttons do not appear.**
A. You are not in the approval group for that step. The screen shows 「◯◯ のメンバーのみ承認・差し戻しできます」 (Only members of that group can approve or send back). Please ask an administrator about being added to the approval group in the approval settings.

**Q. I see 「別のユーザーがセッション中です」 (Another user is working on this) and cannot do anything.**
A. Someone else is working on that step. Please wait until they complete or pause it.

**Q. I see 「不良の合計（55）が受入数（51）を超えています」 (the defect total, 55, is more than the received quantity, 51) and cannot complete the step.**
A. The numbers you entered on the defect lines add up to more than the number of pieces you received. Please check the number on each line.

**Q. I see 「工程構成にエラーがあります」 (there is an error in the step setup) and cannot save.**
A. Something is missing in the combination of steps you chose. The red note says which step needs what, so please add that step.

**Q. I reduced the planned quantity and could not save.**
A. The planned quantity is below the total of the 「割当数量」 (allocation quantities). Raise the planned quantity to at least the allocation total, or reduce the allocation quantities instead.

**Q. I see 「割当が受注残を超えています」 (the allocation exceeds the remaining order quantity) and cannot save.**
A. Part of that order line is already allocated to other work orders. You can only allocate up to the remaining quantity (「残」) shown in the note. If you want to make more pieces, leave the allocation as it is and raise the 「予定数量」 (planned quantity) instead (spares for defects).

**Q. I cannot roll back a finished step.**
A. Either the next step has already started, or the work order is finished and the pieces have already gone into stock. Differences in quantity after stock has been updated cannot be fixed on this screen. Please talk to an administrator.
