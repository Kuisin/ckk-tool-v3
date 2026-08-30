---
title: "Defect Type — User Manual"
description: "An app for registering the categories you choose when recording a defect, such as 「キズ」 (scratch), 「欠け」 (chip) and 「寸法不良」 (wrong size)."
screenshots: [master-defect-type-list-01, master-defect-type-new-01, master-defect-type-edit-01, master-defect-type-delete-01]
---
This app is for registering the **categories** you choose when a defect appears, such as 「キズ」 (scratch), 「欠け」 (chip) and 「寸法不良」 (wrong size). The operation code is `MS0A`.

The categories registered here become the choices when a defect is recorded on a step of a [指示書 (work order)](/manual/en/operations/production/work-order/user). Defects are recorded one line at a time with a type, a defect type, details, and a count, and **the defect type must always be chosen**. The step cannot be completed until every line is filled in, and the defect totals are calculated automatically from these records.

> ⚠️ This app is in trial release. Depending on your environment, it may not be shown yet.

## What you can do with this app

- You can register defect categories.
- You can decide the **order** they appear in on the entry screen on the floor. You can put the ones used most often at the top.
- You can take a category you no longer use out of the choices without deleting any records.

## Words used on this page

- **Defect type** … the name used to sort defects. Register the words used on the floor, such as 「キズ」 (scratch) and 「欠け」 (chip).
- **Display order** … the order it appears in on the list and in the choices on the floor. The smaller the number, the higher it appears.
- **有効 / 無効** (active / inactive) … active means it appears in the choices; inactive means it does not.

## Before you start

- You need the **master permission** to use this app.
- The categories used most often (wrong size, scratch, chip, breakage, coating defect, other) are already registered. First look at the list and check that the same one does not already exist.

## How to read the screen

This is a small app that holds only a code, a name and an order, so **there is no detail screen**. You register and change everything from this list screen.

![List screen of defect types](../../../assets/screenshots/master-defect-type-list-01.png)

- The list columns are **コード** (code) / **名称** (name) / **表示順** (display order) / **状態** (status).
- Normally the rows are shown from the smallest 「**表示順**」 (display order) number first.
- Use the 「**コード・名称で検索**」 (search by code or name) box at the top to narrow down to the category you are looking for. You can also narrow it by 「**状態**」 (status).
- Click a row and an **edit window** opens right there. You do not move to another screen.

## Register a category

1. Press 「**新規作成**」 (New) at the top right of the list screen.
2. Enter text that stands for this category in 「**コード**」 (code), for example `SCRATCH`.
3. Enter the words used on the floor in the Japanese box of 「**名称**」 (name), for example キズ (scratch). You can save with the English box left empty.
4. Enter a number in 「**表示順**」 (display order). Whole numbers of 0 or more can be used.
5. Press 「**保存**」 (Save).

![New entry form for a defect type](../../../assets/screenshots/master-defect-type-new-01.png)

After you save, you go back to the list.

> 💡 「**コード**」 (code) cannot be changed after you save. The edit screen also shows 「**作成後は変更できません**」 (cannot be changed after creation).

## Correct the name or the order

1. In the list, click the row you want to correct.
2. A small window called 「**不良種類の編集**」 (Edit defect type) opens.
3. Correct 「**名称（日本語）**」 (name, Japanese), 「**表示順**」 (display order) and 「**有効**」 (active).
4. Press 「**保存**」 (Save).

![Edit screen for a defect type](../../../assets/screenshots/master-defect-type-edit-01.png)

You can also open 「**編集**」 (Edit) from the 「**…**」 at the right of the row.

## Take out a category you no longer use

For a category you no longer use, it is better to **make it inactive** than to delete it. Once it is inactive it can no longer be chosen in new records, and the past records stay as they are.

1. In the list, press the 「**…**」 at the right of that row.
2. Choose 「**無効化**」 (Deactivate).
3. A small confirmation window appears, so press 「**無効化する**」 (Deactivate).

You can also tick several rows and take them out together with 「**一括無効化**」 (Deactivate selected). If you want to use one again, follow the same steps and choose 「**有効化**」 (Activate). There is also 「**一括削除**」 (Delete selected), which deletes the ticked rows together — but a category with defect records left cannot be deleted.

![Delete confirmation screen for a defect type](../../../assets/screenshots/master-defect-type-delete-01.png)

When you really want to delete one, choose 「**削除**」 (Delete) from the same 「**…**」. The small confirmation window shows 「**この不良種類を参照する不良記録が存在する場合は削除できません。無効化をご検討ください。**」 (it cannot be deleted if defect records refer to this defect type; please consider deactivating it). Once deleted, it cannot be brought back.

## Input fields

Every field on the Defect type screen.

| Field | What to enter |
|-------|---------------|
| [Code / name](#field-code) | The defect type's code and name, chosen when recording a defect on a step |
| [Sort order](#field-sort-order) | Order in the pick list |
| [Active](#field-active) | Turning it off removes it from the defect pick list |

### Code / name [#field-code]

The defect type's code and name, chosen when recording a defect on a step.

### Sort order [#field-sort-order]

Order in the pick list. Putting common ones first speeds up shop-floor entry.

### Active [#field-active]

Turning it off removes it from the defect pick list. **With no active category at all, the floor can no longer record defects.** Leave at least one category active.

## Questions and problems

**Q. I clicked a row, but no detail screen opened.**
A. This app has no detail screen. It is correct that clicking a row opens the small edit window.

**Q. I entered the wrong code. Can I correct it?**
A. It cannot be corrected after you save. Register a new one with the correct code and deactivate the wrong one.

**Q. I see 「不良記録で使用中の不良種類は削除できません（無効化してください）」 (a defect type used by defect records cannot be deleted — deactivate it instead) and cannot delete it.**
A. There are still defect records that used that category. This is there to protect the records, so make it inactive instead of deleting it.

**Q. If I make a category inactive, does it disappear from the past records too?**
A. No. The past records stay as they are. It only means the category can no longer be chosen in new records from now on.

**Q. I want to change the order of the choices on the floor.**
A. Change the 「**表示順**」 (display order) number of each category. A smaller number comes higher. If you leave gaps, such as 10, 20 and 30, it is easier to add one in between later.

**Q. I see 「表示順は整数で入力してください」 (please enter the display order as a whole number).**
A. Enter a number with no decimal point in the display order, such as 0, 10 or 20.

<!-- permissions:start -->
## Permissions required

Using this screen requires the **Master data** (`master`) permission.

| What you want to do | Permission needed |
| --- | --- |
| Open the screen, view lists and details | Master data — View |
| Add, change or delete | Master data — Create / Edit / Delete |

Viewing only needs *View*. Where a screen offers adding, changing or deleting, each of those needs its matching permission.

Permissions come through roles. If something is missing, ask an administrator.

For the whole picture see [Permissions and roles](../../../permissions).
<!-- permissions:end -->
