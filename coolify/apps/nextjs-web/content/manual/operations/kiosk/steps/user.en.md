---
title: "Shop-floor Tablet — Recording Work"
description: "How to check today's work on the tablet and record the start, the finish, and the number of pieces."
screenshots: [kiosk-steps-01, kiosk-step-detail-01, kiosk-step-location-01]
---
In 「**工程実行**」 (Run step) on the tablet, you check the work given to you and record when you start and finish it.

## What you can do with this app

- You can see the list of the work (the steps) to do today.
- You can record when you **start, pause, restart, and finish** the work.
- You can enter how many pieces you received and any defects that came out (the good quantity is calculated automatically).
- When defects come out, you can leave the type, the number of pieces, and the details.
- On inspection steps, you can record the values you measured and whether they passed.
- When several work orders share the same step, you can **start, pause, or finish them together**.
- While you are working on more than one step at once, you can always check which ones are in progress from a widget in the corner of the screen.

## Words used on this page

- **指示書** (work order) … the work instruction that says which product to make and how many. It has a number such as `#9001`.
- **受入数** (received quantity) … how many pieces came into that step.
- **良品数** (good quantity) … how many pieces are fine to pass on to the next step.
- **前工程待ち** (waiting for the previous step) … you cannot start yet, because the work before it is not finished.

## How to read the screen

The work is shown in three groups.

![List of today's work](../../../assets/screenshots/kiosk-steps-01.png)

- **遅延** (late) … work that is past its planned date. Clear this first.
- **本日** (today) … what is planned for today.
- **予定** (upcoming) … work for a later date.

Each card shows the work order number, the site, the step name, the product name, and the number of pieces given to you. The label at the top right is the status now.

- **開始可** (can start) … you can start right away.
- **前工程待ち** (waiting for the previous step) … the work before it is not finished. You cannot start.
- **作業中** (in progress) … you are working on it now.
- **一時停止中** (paused) … it is stopped. Press 「再開」 (Restart) to carry on from where you were.
- **◯◯ さんが作業中** (◯◯ is working on it) … someone else is working on that step. You cannot operate it until they finish or pause it.
- **完了** (finished) … the work is done.
- **キャンセル** (cancelled) … work that was called off.

> 💡 You can hide finished work from the list with 「**完了した工程を隠す**」 (Hide finished steps). Use it when there are too many items on the screen.

## Starting the work

1. From the list, press the card for the work you want to start.
2. Press 「**工程開始**」 (Start step) at the bottom of the screen.
3. On the 「工程を開始」 (Start step) screen, check the **受入数** (received quantity — how many pieces came into that step). The number carried over from the previous step is already filled in.
4. If it is different from the real number, change the number.
5. On steps that show a 「**ロット/伝票コード**」 (lot / slip code) box, enter the material lot or slip code. On "required" steps you cannot start without it; on "optional" steps it can stay empty. The code you enter is shown on the step card as 「ロット ◯◯」 (lot ◯◯).
6. Press 「**開始する**」 (Start).

![Step screen](../../../assets/screenshots/kiosk-step-detail-01.png)

Once you start, the status changes to 「作業中」 (in progress) and the work time starts being counted.

> 💡 You can also work on several steps at the same time. While you do, the working time is **divided by the number of steps you are working on at once** and recorded on each step (for example, two at once means the time counts half for each).

## Stopping partway and restarting

- To stop partway, for example for a lunch break, press 「**一時停止**」 (Pause). The work time stops being counted.
- To carry on, press 「**再開**」 (Restart).

Even if you pause, the work time so far is kept. You can stop and restart as many times as you like.

## Recording the work location

The step screen has a 「**作業場所**」 (work location) box: **which machine or area the work happened at** is recorded on the work actual.

![The work location box and the scan button](../../../assets/screenshots/kiosk-step-location-01.png)

- Usually you don't need to do anything. **When you start or resume, the default work location set on this tablet is recorded automatically**
- When you work at a different machine, tap 「**作業場所を読み取り**」 (scan work location) and scan the **work-location QR label** on the machine with the camera. The location for the current work changes to the scanned one
- If you scan before starting, that location is recorded the moment you start

> ⚠️ If you see 「**この工程では使用できない作業場所です**」 (this work location is not allowed for this step), the step is limited to certain places (set by an administrator in the process step master). Check that the machine's QR is one this step may use.
>
> ⚠️ If you see 「**この端末の作業場所ではこの工程を実行できません**」 (this step cannot run at this device's work location), this tablet's place is not allowed for the step. Check the **allowed work locations** (and the tablets there) shown on the screen, and work from one of those tablets.

## Finishing the work

1. Press 「**工程完了**」 (Complete step) at the bottom of the screen.
2. On the 「工程を完了」 (Complete step) screen, check the **良品数** (good quantity — how many pieces you can pass on). The good quantity is **calculated automatically** as the received quantity minus the total of the defects (it shows 「自動計算」 — calculated automatically). You only enter the defects.
3. When defects came out, press 「**不良を追加**」 (Add defect) and fill in the following on each line.
   - **種別** (type) … one of 半製品 (semi-finished), 廃棄 (scrapped), or 工程分岐 (step branch — pieces sent to another step, such as rework)
   - **不良種類** (defect type, required) … choose from the defect types registered in advance
   - **本数** (number of pieces)
   - **詳細** (details, required) … describe in words what the defect was
4. Press 「**完了する**」 (Complete).

> ⚠️ If the defects add up to more than the received quantity, you see 「**不良の合計（n）が受入数（n）を超えています**」 (the defect total, n, is more than the received quantity, n) and you cannot finish. Please check the numbers again. Also, if a defect line is missing its type or details, you see 「**不良の各行に種類と詳細を入力してください**」 (enter a type and details on every defect line). Fill in every line before finishing.

## Inspection steps

On inspection steps, you enter the inspection record before you finish.

1. In the 「**検査記録**」 (inspection record) area, enter 「**検査数**」 (number inspected) and 「**合格数**」 (number that passed).
2. Enter the **実測値** (measured value) for each item. Pass or fail is **judged automatically** if the value is inside the range that was set.
3. For items that cannot be judged automatically, choose 「合格」 (pass) or 「不合格」 (fail) yourself.
4. Press 「**検査記録を保存**」 (Save inspection record).

## Recording several steps at once

When one machine is running the same step for several work orders, you don't have to open each one — you can start, pause, or finish them together.

### Selecting from the list and acting on them together

1. When the list has two or more steps, a 「**選択**」 (Select) button appears at the top right. Press it, and checkboxes appear on the cards.
2. Check the steps you want to act on together. A step that cannot take that action in its current state keeps a disabled checkbox (the status badge tells you why it can't be selected).
3. A bar at the bottom of the screen shows how many you selected, along with buttons for whichever action (start, pause, complete) is **common to every step you selected**.
4. Pressing a button opens a confirmation screen listing the steps that can be batched and the ones that cannot (with the reason). Steps that cannot be batched can be opened individually with 「**開く**」 (Open).
5. Press 「**実行**」 (Run) to process them together.

> ⚠️ **You cannot select startable steps and in-progress steps at the same time.** If you see 「開始できる工程と作業中の工程が混ざっています。どちらかに揃えてください。」 (Startable steps and in-progress steps are mixed. Select one kind only.), reselect so that only one kind is checked.

> ⚠️ Completing in a batch records **the entire received quantity as good**. If a step had defects, leave it out of the batch and open it individually to enter the breakdown. Likewise, starting in a batch keeps the received quantity at the expected value carried from the previous step — if you need to change it, open that step individually too.

> 💡 **Resuming from pause cannot be done in a batch.** Open each step you want to resume individually.

Once run, the screen switches to a result view. Any step that failed stays selected, so you can fix it and run again right away.

### Opening the same step together

When the list has **the same step** two or more times, a row automatically appears above that group reading 「**{step name} — n 件**」 (n) with an 「**まとめて開く**」 (Open together) button. Pressing it opens a dedicated screen that collects only that step.

This screen has something the list's batch bar does not: **you can enter a different lot / slip code per work order while starting them together.** (The list's batch start leaves out any step that requires a lot / slip code, telling you to open it individually — here, each row has its own input box.)

1. In 「**開始できる工程**」 (Steps that can start), enter a lot / slip code on each row if needed.
2. Check the rows you want to start together and press 「**選択した n 件を開始**」 (Start n selected).
3. In-progress and paused steps appear under 「**作業中・一時停止中の工程**」 (In progress / paused). Check the rows you want to finish together and press 「**選択した n 件を完了**」 (Complete n selected) — this completion is also **all good**; open a step individually with 「**開く**」 (Open) if it has defects.
4. Steps you cannot operate right now (waiting for the previous step, being worked by someone else, and so on) are shown for reference only, under 「**いま操作できない工程**」 (Not available right now).

Press 「**工程一覧へ**」 (Back to steps) to return to the original list.

## Keeping track of steps in progress

While you are working on more than one step, a round 「**作業中 n件**」 (n in progress) button stays in the bottom right corner of the screen. You can always check which steps you currently hold, without going back to the list.

- Press it, and the steps in progress are shown as cards, with the step name, work order number, and elapsed time.
- Press a card to jump straight to that step's recording screen.
- It disappears when nothing is in progress.

When you have two or more running at once, you see the note 「**n 件同時のため、実働時間は 1/n で計上されます**」 (n at once — work time is counted at 1/n). This is the same time-splitting rule mentioned under "[Starting the work](#starting-the-work)".

## Input fields

Which quantities you are asked for depends on the step. Steps that do not track quantity only have start and complete.

| Field | Required | What to enter |
|-------|----------|---------------|
| [Received / inspected](#field-input) | Required | How many arrived in your hands |
| [Lot / slip code](#field-lot) | Conditional | The material lot or slip code |
| [Good / passed](#field-success) | Calculated | How many go on to the next step (not entered) |
| [Defect breakdown](#field-defects) | Conditional | Type, defect type, count, and details per defect line |
| [Defect reasons](#field-reasons) | Conditional | The defect type and details on each defect line |
| [Inspection record](#field-inspection) | Conditional | Measured values on the sheet |

### Received / inspected [#field-input]

Entered **when starting** the step: how many actually arrived. The previous step's good count is filled in for you. If what arrived differs, **change it to what arrived.**

### Lot / slip code [#field-lot]

Entered **when starting** the step: the material lot or slip code. Each step is set to "required", "optional", or "none"; on required steps you cannot start without it. The code you enter is shown on the step card as 「ロット ◯◯」 (lot ◯◯).

### Good / passed [#field-success]

How many can go on to the next step. **You do not enter it yourself** — the received quantity minus the total of the defects is calculated and shown automatically.

### Defect breakdown [#field-defects]

A list of what did not become good pieces, one line per defect. On each line you enter the **type**, the **defect type** (required), the **count**, and the **details** (required). The type is one of these three.

- **Semi-finished** — not a product, but kept as stock
- **Scrapped** — thrown away
- **Branched** — sent to another step, such as rework

The totals per type and how they affect stock are calculated automatically from this list. The only condition is that **the defect total must not exceed the received quantity** — the screen warns you when it does (the good quantity becomes the received quantity minus the defect total).

### Defect reasons [#field-reasons]

The **defect type** and **details** entered on each defect line. These used to be a separate box, but they are now part of the defect breakdown list. A step cannot be completed until every line has a defect type chosen and details written. They become clues when looking back at causes later.

### Inspection record [#field-inspection]

On inspection steps, enter a measured value per item on the sheet. **Anything outside the tolerance fails automatically.** For sampling inspections, the required sample count is shown on screen.

---

Pausing records the time worked so far and releases the step so someone else can take it over. Resuming starts recording again under your name.

## Questions and problems

**Q. Nothing appears in the list.**
A. If the screen shows 「**本日の担当工程はありません**」 (You have no steps today), no work has been given to you today. The office (the person in charge of the work order) makes the assignments.

**Q. I cannot start because it says 「前工程待ち」 (waiting for the previous step).**
A. The step before it is not finished yet. Once the person doing that work finishes it, you can start.

**Q. The received quantity is different from the real number.**
A. Please change the number when you start. It is only the number carried over from the previous step as a starting value, so it is fine to match it to the number of pieces you really received.

**Q. I finished it by mistake.**
A. You cannot undo it from the tablet. Please tell the person in charge in the office (they will handle it on the PC).

**Q. The screen closed while I was working.**
A. Your record is kept. Log in again and open the same step; it is still 「作業中」 (in progress) and you can carry on from where you were.

**Q. I selected several steps, but the start or complete button did not appear.**
A. You may have startable steps and in-progress steps mixed in your selection. Reselect so that only one kind is checked.

**Q. I completed a batch of steps, and there was nowhere to enter defects.**
A. A batch completion records the entire received quantity as good. Leave any step that had defects out of the batch, and open it individually to enter the breakdown.

**Q. I got 「ロット/伝票コードが必要です」 (needs a lot / slip code) and cannot start in a batch.**
A. A lot / slip code is different for every work order, so the list's batch start cannot handle it. Open that step individually, or, if there are several of the same step, use the 「**まとめて開く**」 (Open together) screen, which lets you enter a code on each row before starting.

<!-- permissions:start -->
## Permissions required

Using this screen requires the **Work order** (`work_order`) permission.

| What you want to do | Permission needed |
| --- | --- |
| Open the screen, view lists and details | Work order — View |
| Add, change or delete | Work order — Create / Edit / Delete |

Viewing only needs *View*. Where a screen offers adding, changing or deleting, each of those needs its matching permission.

Permissions come through roles. If something is missing, ask an administrator.

For the whole picture see [Permissions and roles](../../../permissions).
<!-- permissions:end -->
