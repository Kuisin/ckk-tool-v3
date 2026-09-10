---
title: "Shop-floor Tablet — Work Location Steps"
description: "An app for finding and recording the steps waiting at this machine or this place, rather than steps assigned to you."
---
In 「**作業場所の工程**」 (Work location steps) on the tablet, you find and record **the steps waiting at the machine or place you are at now**, rather than steps assigned to you.

## Why this app exists

The list in 「工程実行」 (Run step) only shows work **assigned to you**. But a work plan can also be made with only 「**いつ・どの機械で**」 (when and at which machine) decided, without deciding who does it. Work with no assignee can be picked up by whoever is standing in front of that machine.

That kind of work never shows up in the 「工程実行」 list, because it belongs to no one in particular. 「作業場所の工程」 finds the same work by **using the place as the key**.

## What you can do with this app

- See the list of steps waiting at **the machine or place this tablet is placed at right now**.
- Switch to another machine's list by scanning the **work-location QR label** stuck to that machine.
- Look at a whole group of machines at once (for example, the same production island or area).
- Choose a step from the list to open the same recording screen as 「工程実行」, and record starting, pausing, and finishing.

## Words used on this page

- **作業場所** (work location) … a machine, area, or similar place where a step is carried out. It has a QR label on it (set up in the work location master, `MS0D`).
- **既定の作業場所** (default work location) … the usual work location set for this tablet. A system administrator sets this per device.
- **グループ** (group) … a set of work locations bundled together (for example, machines on the same island). Choosing the whole group shows steps from every work location inside it.
- **未計画** (unplanned) … a work plan made with only a date and a work location, and no assignee. Anyone standing at that place can operate it.

## Before you start

- You need the same **work order** permission as 「工程実行」 to use this app. If you cannot open it, please ask your system administrator.
- This tablet needs a **default work location** set. If it is not set, the camera starts automatically when you open the app, and you are guided to scan a work-location QR code. This is set up in Device Management (`SY09`), so contact your administrator if it needs to be set first.

## How to open it

Press 「**作業場所の工程**」 (Work location steps) in the app list.

## Reading the screen

When you open it, the steps waiting at **this tablet's default work location** are listed. Just as in 「工程実行」, they are split into three groups: **遅延** (late), **本日** (today), and **予定** (upcoming).

Near the top of the screen, the name of the work location you are currently viewing is shown. To its right is a switch between 「**この作業場所**」 (This location) and 「**グループ全体（group name）**」 (Whole group), and choosing the whole group shows steps from every work location in the same group at once.

Each card shows the step name, work order number, product name, assignee (a name if one is set, or 「未計画」 (Unplanned) if not), work location name, and quantity. The status label on the right is the same as in 「工程実行」 (can start, in progress, paused, finished, and so on).

A card for a step that is **already assigned to someone else** is shown dimmed, with 「**他の担当者の工程です**」 (This step belongs to another person), and cannot be opened. A step with no assignee can be opened by anyone.

> 💡 Press 「**読み込み直す**」 (Refresh) at the top right of the list to update to the latest state. Changes made on another tablet (for example, someone else completing a step) show up when you press this, or when you leave and come back to the screen.

## Viewing a different location

1. Press 「**作業場所を読み取り**」 (Scan work location) at the top right of the screen — the camera starts.
2. Point it at the **work-location QR label** stuck to the machine you want to view.
3. Once it is read, the list switches to that work location.

If you scan a work order's QR code or a QR card by mistake, you get the warning 「**作業場所の QR コードではありません**」 (Not a work-location QR code), and the list you are viewing does not change.

If you scan a code that is not registered, you see 「**この作業場所コードは見つかりません**」 (That work-location code was not found). This can happen if the label is dirty, damaged, or on the wrong machine — check with your administrator.

> ⚠️ **The location you are viewing and the location that gets recorded are different things.** Scanning here only narrows the list. The work location recorded in the actual results when you start a step stays **this tablet's default work location**. While you are viewing a different location, the screen shows a note such as: "This list shows '◯◯'. Steps started from here record '◯◯' as well (this tablet's default is '△△')." If you actually want to change the location that gets recorded, scan it from inside the step's own screen instead (see "Recording the work location" in [Recording Work](/manual/en/operations/kiosk/steps/user)).

## Recording a step

Press a card in the list to open the same recording screen as 「工程実行」. Starting, pausing, finishing, entering quantities, recording defects, and recording inspections all work exactly as described in [Recording Work](/manual/en/operations/kiosk/steps/user).

Pressing 「**戻る**」 (Back) on the recording screen returns you to the work-location list you were just viewing (same location, same scope).

## Frequently asked questions

**Q. The camera started as soon as I opened the app.**
A. This tablet has no default work location set yet. Scan the work-location QR label on a nearby machine. If you want the default set up first, contact your administrator.

**Q. The list shows nothing.**
A. The work location (or group) you are viewing has no waiting steps. Try scanning a different work location, or switch to "Whole group" to check more broadly.

**Q. A card is dimmed and I cannot press it.**
A. That step is already assigned to someone else. A step marked 「他の担当者の工程です」 cannot be operated until that person finishes or pauses it.

**Q. I got "この作業場所コードは見つかりません" (That work-location code was not found).**
A. The code on the scanned label is not registered. It may be damaged or on the wrong machine — check with your administrator.

**Q. A step I completed here was recorded under a different work location than the one I was viewing.**
A. The location you were viewing (a filter) and the location recorded in the results (this tablet's default) may have differed. Check whether a note appeared at the top of the screen. If you want the recorded location itself to change, scan the work location again from inside the step's own screen.

**Q. What is the difference from 「工程実行」 (Run step)?**
A. 「工程実行」 only shows work **assigned to you**. 「作業場所の工程」 finds work by **place**, so it also finds work that was planned with no assignee (unplanned). The same step shows up in 「工程実行」 for whoever it is assigned to, and in 「作業場所の工程」 if it is assigned to no one.

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
