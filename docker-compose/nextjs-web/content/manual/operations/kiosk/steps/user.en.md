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
