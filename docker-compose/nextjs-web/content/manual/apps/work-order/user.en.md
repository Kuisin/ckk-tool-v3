---
title: "Work Order — User Manual"
description: "An app for making the document that decides which product to make, how many, and in what order at the factory, and for recording everything from approval to the end of the work."
screenshots: [work-order-list-01, work-order-new-01, work-order-detail-01, work-order-approval-01, work-order-steps-01, work-order-step-quantity-01]
---
This app is for making the document (**指示書**, work order) that decides which product to make, how many, and in what order at the factory, and for recording everything from approval to the end of the work. The operation code is `PD02`.

> ⚠️ For now this app works **only in the test environment**. The screens and the steps may change before it can be used for real work.

## What you can do with this app

- You can make instructions for the factory, based on a customer's order (the sales order).
- You can send the work order you made to your manager and get **承認** (approval).
- For each piece of work (each step), you can record that it **started, finished, and how many pieces were made**.
- When defects come up, you can record how many and why.
- When all the work is done, the finished products **go into stock automatically**.

## Words used on this page

- **注文請書** (sales order) … an internal document that splits a customer's order by product and by quantity. You choose one of these to make a work order.
- **工程** (step) … one stage of the work, such as cutting, step machining, or inspection.
- **工程リスト** (step list) … the order of the steps for making a product, registered in advance.
- **ロット番号** (lot number) … the number given to a batch of products you made. The work order number becomes the lot number.
- **受入数 / 良品数** (received quantity / good quantity) … the received quantity is how many pieces came into that step; the good quantity is how many pieces are fine to pass on.
- **承認グループ** (approval group) … the list of people who are allowed to approve. Only people on this list can approve.

## Before you start

- You need a **sales order** first. Sales orders are made from the import screen of [order acceptance](/manual/en/apps/order-acceptance/user), and you can check them on the sales order screen (operation code `PD01`).
- When you run 「**在庫照合**」 (Check stock) on the sales order screen, the stock you already have is set aside for that order. You make the missing amount with this app.
- People who approve must be registered in an [approval group](/manual/en/masters/approval-group/user) in advance.

## How to read the screen

When you open the app, you see a list of the work orders made so far.

![Work order list](../../assets/screenshots/work-order-list-01.png)

- **指示書番号** (work order number) … a serial number such as `#9001`. The system adds it for you. This number also becomes the lot number.
- **種別** (type) … either 「**在庫分**」 (from stock — using stock you already have) or 「**製造分**」 (to make — making new pieces).
- **予定数量** (planned quantity) … how many pieces you plan to make.
- **承認状態** (approval status) … a coloured badge shows how far the approval has gone: 「第一承認待ち」 (waiting for first approval), 「第一承認済」 (first approval done), 「第二承認待ち」 (waiting for second approval), 「承認済」 (approved), 「差し戻し」 (sent back), and so on.
- **状態** (status) … one of 「下書き」 (draft), 「承認待ち」 (waiting for approval), 「承認済」 (approved), 「進行中」 (in progress), 「完了」 (finished), or 「キャンセル」 (cancelled).
- Type a work order number, a sales order number, or a product name into the search box at the top to find one. You can also narrow it down with 「**種別**」 (type) and 「**状態**」 (status).
- Click a row to open the detail screen for that work order.

## Creating a work order

1. Press 「**新規作成**」 (New) at the top right of the list screen. You can also open it from the sales order screen, in which case the sales order is already chosen.
2. Click the 「**注文請書**」 (sales order) box and choose the sales order to base it on. You can search by sales order number, product, or customer.
3. Once you choose it, the customer name, the product, and the ordered quantity appear below.
4. In 「**種別**」 (type), choose 「在庫分」 (from stock) or 「製造分」 (to make).
5. Enter how many pieces to make in 「**予定数量**」 (planned quantity).
6. If you chose 「製造分」 (to make), choose the 「**使用素材**」 (material to use).
7. 「**検査表**」 (inspection sheets) — the ones you need are chosen automatically. Add more if any are missing.
8. Choose the 「**工程リスト**」 (step list). See the next section.
9. For steps that can be done either in-house or outside, choose 「**社内**」 (in-house) or 「**外注**」 (outsourced) — then choose the site for in-house, or the partner company for outsourced.
10. Press 「**保存**」 (Save).

![New work order form](../../assets/screenshots/work-order-new-01.png)

When you save, a 「**下書き**」 (draft) work order is created and its detail screen opens.

> 💡 Under 「予定数量」 (planned quantity) you may see a note such as 「最低 55（不良予備分は上乗せ可）」 (at least 55 — you may add extra for defects). This is the smallest number needed after subtracting stock and other work orders. You cannot save with less. Making more is up to you.

If there is not enough material, you see a note such as 「**素材在庫が 30 不足しています**」 (material stock is short by 30). This is only a warning, so you can still save. If nothing is due to arrive, you see 「**入荷予定がありません。素材発注を検討してください**」 (nothing is due to arrive — please consider ordering material).

### About the step list

The order of the steps is registered per product as a 「工程リスト」 (step list).

- When you choose a sales order, the step list for that product is chosen automatically and the steps are filled in.
- If you choose a different 「**バージョン**」 (version), you can use an earlier order of steps.
- If the product has no step list yet, you see 「**この製品の工程リストは未登録です（下で新規作成）**」 (this product has no step list yet — create one below). Enter a 「**新しい工程リスト名**」 (new step list name), such as "standard steps", and saving registers it as a new list.
- If you add or remove steps, you see a note saying the list will be saved as a new version. The contents of work orders you used before do not change.

You pick steps from checklists grouped by category. If a step needs an inspection or something similar, that is added automatically when you pick it. If the combination has a problem, a red note appears and you cannot save (「**工程構成にエラーがあります**」 — there is an error in the step setup). Please fix the steps until the red note is gone.

After saving, the work order detail screen shows 「**工程ルート**」 (step route) with the name and version of the step list used, for example "standard steps v1". You can open the product's step list from there.

## Getting approval

Work cannot start on a work order until it is approved. Approval has **two stages**.

1. On the work order screen, press 「**承認依頼**」 (Request approval) in the 「**承認状況**」 (approval status) area.
2. The status changes to 「**承認待ち**」 (waiting for approval). From this point, the original sales order can no longer be edited.
3. The person doing the first approval (factory manager or department manager level) presses 「**第一承認**」 (First approval).
4. Then the person doing the second approval (department manager level) presses 「**第二承認**」 (Second approval).
5. When both stages are done, the status becomes 「**承認済**」 (approved) and the work can start.

![Approval status panel of a work order](../../assets/screenshots/work-order-approval-01.png)

- Only people **in the approval group** for that stage, and stand-ins appointed for a set period, can approve. If you are not in the group, the buttons do not appear and the screen shows 「第一承認グループのメンバーのみ承認・差し戻しできます」 (Only members of the first approval group can approve or send back).
- If there is a problem, press 「**差し戻し**」 (Send back). You must enter a 「**差し戻し理由**」 (reason for sending back).
- A work order that was sent back returns to 「下書き」 (draft) and the reason appears in red on the screen. After fixing it, you can send it out again with 「**再承認依頼**」 (Request approval again).
- Records of approvals and send-backs stay under 「承認状況」 (approval status). Ones approved by a stand-in are marked 「（代理: 原承認者）」 (stand-in for the original approver).

You can also approve from the list in [approval management](/manual/en/apps/approval/user) (PD03).

When a 「製造分」 (to make) work order is approved, the material it will use is **set aside (reserved)** for that work order.

## Working through the steps

At the bottom of the work order screen is 「**工程ワークフロー**」 (step workflow), where the steps are listed in order.

![Work order detail screen and step workflow](../../assets/screenshots/work-order-detail-01.png)

Once approval is done, a link called 「**工程実行ビューを開く**」 (Open step execution view) appears at the top right. Pressing it opens a screen with the list of steps on the left and the work recording screen on the right. Before approval, the screen shows 「工程実行は指示書の承認後に可能になります」 (Steps can be run after the work order is approved) and it cannot be opened.

![Step execution view](../../assets/screenshots/work-order-steps-01.png)

### Starting the work

1. From the list on the left, choose the step you are about to do.
2. Press 「**工程開始**」 (Start step).
3. If it cannot be started — for example because the previous step is not finished — you see 「**開始できません**」 (Cannot start) with the reasons listed.

Once you start the work, that step is marked as being used by you. Other people see 「**別のユーザーがセッション中です**」 (Another user is working on this) and cannot operate it.

### Recording the quantity and finishing

Once you start a step, the 「**数量・不良**」 (quantity and defects) boxes appear.

![Quantity and defect entry screen for a step](../../assets/screenshots/work-order-step-quantity-01.png)

- **受入数** (received quantity) … how many pieces came into that step. The good quantity of the previous step is filled in automatically and you cannot change it here (it shows 「固定」 — fixed).
- **良品数** (good quantity) … calculated automatically (it shows 「自動計算」 — calculated automatically). It goes down by the number of defects you enter.
- **不良内訳** (defect breakdown) … enter this only when there are defects. Press 「**不良を追加**」 (Add defect) and choose the following on each line:
  - Type … 「**半製品**」 (semi-finished — put back into stock) / 「**廃棄**」 (scrapped) / 「**手直し**」 (rework)
  - Reason … choose from 「**不良種類を選択**」 (Select defect type), which lists what is registered in [defect types](/manual/en/masters/defect-type/user)
  - Number of pieces
- Finally, press 「**工程完了**」 (Complete step).

On inspection steps, the boxes are named differently, such as 「**検査数**」 (number inspected), 「**合格数**」 (number passed), and 「**不合格（半製品）**」 (failed — semi-finished). On steps where no quantity is recorded, no boxes appear; the screen shows something like 「この工程は数量記録なしで完了します（通過数 51）」 (this step finishes without recording a quantity — 51 pieces passing through) and you can simply complete it.

> ⚠️ If the defects add up to more than the received quantity, you see 「**不良の合計（55）が受入数（51）を超えています**」 (the defect total, 55, is more than the received quantity, 51) and you cannot complete the step. Please check the numbers again.

### Other things you can record

- **検査記録** (inspection record) … on inspection steps, you enter the measured value for each item on the inspection sheet. Pass or fail is judged automatically according to the type of item. For sampling inspections, where you do not measure everything, the number to inspect is decided by the sample size rules. On inspection approval steps, you can approve inspection records that passed.
- **不良記録（任意）** (defect record, optional) … you can write down the defect type and what happened.
- **作業計画 / 作業実績** (work plan / work result) … you can record who, when, where, and how many pieces will be done (or were done), using the person in charge, date, time, quantity, and work place.
- **外注日程** (outsourcing schedule) … on outsourced steps, you can record 「依頼日」 (sent date), 「入荷予定日」 (expected return date), 「入荷日」 (return date), and 「外注費」 (outsourcing cost).

### When you want to redo something

- **中断（巻き戻し）** (pause and roll back) … puts a step that is in progress back to not started, with a reason. Any quantity you had entered is not kept.
- **巻き戻し** (roll back) … puts a finished step back to not started. It cannot be done if the next step has already started, or if the pieces have already gone into stock.

## Sending rework pieces down a different path (adding a branch)

Sometimes you want the pieces sent for rework to go through different steps.

1. On the card of a finished step, press the button with three dots.
2. Choose 「**分岐追加**」 (Add branch).
3. In 「**追加する工程（実行順）**」 (steps to add, in the order they run), choose the steps to go through.
4. Enter how many pieces to send down this path in 「**分岐数量**」 (branch quantity).
5. In 「**合流先（未着手の工程）**」 (where it rejoins — steps not started yet), choose which step they come back to. If they do not come back, you can leave it blank.
6. Press 「**分岐を追加**」 (Add branch).

Once you make a branch, a picture of the flow of the steps appears above the step workflow, showing how many pieces go from which step to where.

## When everything is finished

When all the steps are finished, the work order automatically becomes 「**完了**」 (finished).

- The good pieces from the last step go into product stock, with the lot number.
- Pieces marked as 「半製品」 (semi-finished) go into stock as semi-finished items.
- The material that was set aside is taken out of stock as material used.

You can check stock in [inventory management](/manual/en/apps/product-inventory/user) (PD04). Pieces still being made are shown on the 「**仕掛品**」 (work in progress) tab of the same app.

## Other things you can do

- **編集** (edit) … only while it is 「下書き」 (draft). Press 「**編集**」 (Edit) at the top right of the screen.
- **キャンセル** (cancel) … only while it is 「下書き」 (draft) or 「承認待ち」 (waiting for approval). Choose 「**キャンセル**」 (Cancel) from the button with three dots at the top right.
- **コピー** (copy) … choose 「**コピー**」 (Copy) from the button with three dots at the top right, then choose the sales order to use. You get a draft that keeps the steps, the places where they are done, and the inspection sheets. Where it was copied from stays on the detail screen as 「**コピー元**」 (copied from). If there is a newer version than the one you copied, a note suggests copying the latest version.
- The tabs on the detail screen are 「**概要**」 (overview — steps and notes), 「**関連**」 (related — the original sales order and where it was copied from), and 「**履歴**」 (history — who changed what and when).

You need work order permission to use this app.

## Questions and problems

**Q. 「工程実行ビューを開く」 (Open step execution view) does not appear.**
A. That work order has not been approved yet. If the screen shows 「工程実行は指示書の承認後に可能になります」 (Steps can be run after the work order is approved), please get it approved first.

**Q. The approval buttons do not appear.**
A. You are not in the approval group for that stage. The screen shows 「第一承認グループのメンバーのみ承認・差し戻しできます」 (Only members of the first approval group can approve or send back). Please ask an administrator about being added to the approval group.

**Q. I see 「別のユーザーがセッション中です」 (Another user is working on this) and cannot do anything.**
A. Someone else is working on that step. Please wait until they complete or pause it.

**Q. I see 「不良の合計（55）が受入数（51）を超えています」 (the defect total, 55, is more than the received quantity, 51) and cannot complete the step.**
A. The numbers you entered on the defect lines add up to more than the number of pieces you received. Please check the number on each line.

**Q. I see 「工程構成にエラーがあります」 (there is an error in the step setup) and cannot save.**
A. Something is missing in the combination of steps you chose. The red note says which step needs what, so please add that step.

**Q. I reduced the planned quantity and could not save.**
A. It is below the smallest number allowed, shown as something like 「最低 55（不良予備分は上乗せ可）」 (at least 55 — you may add extra for defects). Please enter at least the number shown in the note.

**Q. I cannot roll back a finished step.**
A. Either the next step has already started, or the work order is finished and the pieces have already gone into stock. Differences in quantity after stock has been updated cannot be fixed on this screen. Please talk to an administrator.
