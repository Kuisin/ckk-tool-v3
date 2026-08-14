---
title: "試算計算 (Trial calculation) — Settings Manual"
description: "The app where an administrator decides how the Trial estimate app calculates unit prices."
screenshots: [trial-pricing-hub-01, trial-pricing-criteria-01, trial-pricing-tool-types-01, trial-pricing-material-policy-01, trial-pricing-custom-inputs-01, trial-pricing-lookups-01]
---
This is the app where an administrator decides **how unit prices are calculated** in the [試算](/manual/en/apps/trial-estimate/user) (Trial estimate) app. Its operation code is `SY02`.

This screen changes the way prices are worked out, so **only staff who know your company's rules** should touch it.

## What you can do with this app

- Decide the order and the content of the steps that build up a quoted unit price.
- Add tool types (round bar, cylinder, with OH, and so on), and choose which calculations each type uses.
- Decide which purchase records the material price is taken from.
- Add or remove the fields shown on the trial estimate input screen.
- Register reference tables (quick-lookup tables) used in the calculation.

## Terms used on this page

- **計算基準 (calculation criterion)** … one single part of the unit price. "Material price", "machining effort", and so on are each one criterion.
- **見積単価 (quoted unit price)** … the final amount per piece that comes out after all the criteria are added up.
- **工具種 (tool type)** … the kind of tool. Three types are included from the start: **丸棒** (round bar) / **円筒** (cylinder) / **OH付** (with OH).
- **式 (expression)** … the written definition of *how* a criterion calculates. This is set up by staff who know the calculation well.
- **ルックアップ表 (lookup table)** … a quick-lookup table such as "for this diameter, this price". It is referenced during the calculation.

## Before you start

- You need the **system administration permission** to use this app. If you cannot open it, please ask your system administrator.
- Changes here take effect **from the next trial estimate you create**. Amounts on trial estimates that are already 確定 (confirmed) do not change (see "Changing settings does not change past trial estimates" below).
- If you are unsure what to change, do not change anything and ask your system administrator. Unit price calculation is the foundation of every quotation.

## How to open it

Press **試算計算** in the システム (System) group on the home screen. Or type `SY02` into the search box at the top of the screen.

## Changing settings does not change past trial estimates

This is the most important rule.

- A trial estimate **stores the calculation result exactly as it was when it was created and confirmed**.
- So even if you change the way calculation works here, **amounts on trial estimates that are already 確定 (confirmed) do not change**. Past quotations will never move on their own.
- However, a trial estimate that is still a 下書き (draft) **is recalculated with the settings in force at the moment it is confirmed**. Please keep this in mind if you have trial estimates left as drafts.

## Reading the screen (top page)

When you open the app, five cards are shown. Press a card to open that settings screen.

![Top screen of 試算計算](../../assets/screenshots/trial-pricing-hub-01.png)

- 「**計算基準**」 (Calculation criteria) … the list of the parts that build up the unit price.
- 「**工具種管理**」 (Tool type management) … adding and deleting tool types, and the settings for each type.
- 「**材料参照価格ポリシー**」 (Material reference price policy) … where the material price is taken from.
- 「**カスタム入力項目**」 (Custom input fields) … the fields shown on the trial estimate input screen, and company-wide fixed values.
- 「**ルックアップ表**」 (Lookup tables) … the quick-lookup tables used in the calculation.

Each card also shows, in small text, how many entries are currently registered.

## 計算基準 (Calculation criteria) — how the unit price is built up

The quoted unit price is decided by **adding up the criteria in the list, from the top down**. If you change the order, the calculation order changes too.

When you open 「計算基準」, the list is on the left and the content of the selected criterion is on the right. The list is split into two parts.

- 「**計算基準（加算・中間）**」 (Calculation criteria — added / intermediate) … the parts that are built up.
- 「**見積単価（工具種ごとに設定）**」 (Quoted unit price — set per tool type) … the part that turns the built-up total into the final quoted unit price.

![The calculation criteria screen](../../assets/screenshots/trial-pricing-criteria-01.png)

Each row in the list carries one of these marks.

- 「**加算**」 (added) … a part that is added into the total.
- 「**中間**」 (intermediate) … a part that is not added into the total; it is only referenced by other calculations.
- 「**見積単価**」 (quoted unit price) … the part that wraps everything up at the end.
- 「**無効**」 (disabled) … a part that is not in use right now.
- 「**全工具種**」 (all tool types) … used for every kind of tool.
- 「**適用なし**」 (not applied) … **not used for any kind of tool.** This mark is red. It may mean a setting was forgotten.

### Changing the order

1. Press 「**並び替え**」 (Reorder) above the list.
2. A screen titled 「**計算基準の並び替え**」 (Reorder calculation criteria) appears.
3. Swap the order using the up and down buttons.
4. Press 「**並び順を保存**」 (Save order).

### Editing one criterion

1. Click the criterion you want to edit in the list.
2. Its content appears on the right.
3. You can change the displayed name in 「**基準名**」 (Criterion name).
4. If you turn off the 「**有効**」 (Enabled) switch, that criterion is no longer used in the calculation.
5. In 「**適用工具種**」 (Applicable tool types), choose which kinds of tool it is used for.
6. Press 「**保存**」 (Save).

> ⚠️ If **you do not select even one** 「**適用工具種**」**, that criterion is not used anywhere.** If you forget to select, red text appears saying 「**⚠ 未選択 — この基準はどの工具種にも適用されません**」 (Not selected — this criterion is not applied to any tool type). If you want it used everywhere, press 「**全選択**」 (Select all).

> ⚠️ The 「**式**」 (Expression) box is where the calculation itself is written. If it is written incorrectly, trial estimate amounts will come out wrong. **Please leave this box to your system administrator.**

### Trying it out before you change it

When you have edited an expression, you can check the result on the spot before saving.

1. Choose the kind of tool you want to try in 「**テスト工具種**」 (Test tool type).
2. Press 「**テスト実行**」 (Run test).
3. A table of 「**ロット**」 (Lot) and 「**見積単価**」 (Quoted unit price) appears — check that the amounts are what you expect.

### Adding and deleting

- To create a new one, press 「**基準を追加**」 (Add criterion) above the list.
- To remove one, press 「**削除**」 (Delete) on that criterion's screen. **Deletion cannot be undone.**

## 工具種管理 (Tool type management) — the kinds of tool

When you open 「工具種管理」, the registered kinds of tool are listed.

![The tool type settings screen](../../assets/screenshots/trial-pricing-tool-types-01.png)

- **丸棒** (round bar) / **円筒** (cylinder) / **OH付** (with OH) are the three types included from the start. They carry the 「**組み込み**」 (built-in) mark and **cannot be deleted**.
- Types added later carry the 「**カスタム**」 (custom) mark.
- Each row shows 「**計算基準 N 件 · 試算 M 件**」 (N criteria · M trial estimates). This tells you how many criteria are used for that type, and how many trial estimates of that type exist.

### Adding a kind of tool

1. Press 「**工具種を追加**」 (Add tool type).
2. In 「**値**」 (Value), enter a code using uppercase letters, digits and underscores (for example `BALL_END`). **It cannot be changed after it is created.**
3. In 「**表示名**」 (Display name), enter the name shown on screen (for example ボールエンド / ball end).
4. Press 「**追加**」 (Add).

The added type becomes selectable on the trial estimate input screen. Criteria set to 「全工具種」 (all tool types) are attached to the new type automatically.

### Settings for each type

Click a type in the list to open its settings screen.

- 「**適用する計算基準**」 (Applicable calculation criteria) … tick the parts used in trial estimates for that type.
- 「**使用する見積単価**」 (Quoted unit price to use) … choose one part that wraps everything up at the end. **Exactly one is required for each type.**

The settings here are simply another view of the same content as 「適用工具種」 on the calculation criteria screen. Editing on either side gives the same result.

### When deletion is possible

- The three 「組み込み」 (built-in) types cannot be deleted.
- A type you added can be deleted **only when there is not a single trial estimate of that type**.
- Deleting it also removes that type from every calculation criterion.

## 材料参照価格ポリシー (Material reference price policy) — how the material price is decided

Decide how the material price used in a trial estimate is taken from actual purchase records.

![The material reference price policy screen](../../assets/screenshots/trial-pricing-material-policy-01.png)

1. Choose 「**算出方法**」 (Calculation method).
   - 「**最高単価（期間内）**」 (Highest unit price within the period) … uses the highest price within the period. Choose this when you want to estimate on the safe side.
   - 「**最新単価**」 (Latest unit price) … uses the price of the most recent purchase.
   - 「**平均単価（期間内）**」 (Average unit price within the period) … uses the average within the period.
2. In 「**参照期間（ヶ月）**」 (Reference period, months), enter how many months to look back (1–36 months).
3. In 「**既定材料単価（¥/1000mm）**」 (Default material unit price, ¥/1000mm), enter the price to use when no purchase record is found. Setting it to `0` means it is treated as having no price.
4. Press 「**保存**」 (Save).

> 💡 On a trial estimate where no purchase record existed and the default price was used, 「**既定価格**」 (default price) is shown on screen. That amount is not based on actual results, so please check whether it is fine to use as-is in a quotation.

## カスタム入力項目 (Custom input fields) — input boxes and fixed values

You can add or remove the fields used in trial estimates here.

![The custom input fields screen](../../assets/screenshots/trial-pricing-custom-inputs-01.png)

Each field has the following settings.

- 「**キー（変数名）**」 (Key / variable name) … the name used to call it inside the calculation. Enter it in single-byte letters and digits.
- 「**ラベル**」 (Label) … the name shown on screen.
- 「**型**」 (Type) … the kind of thing entered into the field. Choose from 「**数値**」 (number), 「**ON/OFF**」, 「**文字列**」 (text) and 「**選択**」 (choice). For 「選択」, enter the options separated by `,` (commas).
- 「**スコープ**」 (Scope) … where the field is used.
  - 「**見積入力（フォームに表示）**」 (Estimate input — shown on the form) … **adds a box on the trial estimate input screen.** A person enters it for each job.
  - 「**グローバル定数（固定係数）**」 (Global constant — fixed coefficient) … does not appear on the input screen. It is used as a company-wide fixed value.
- 「**既定値**」 (Default value) … the value filled in from the start.

To add a field, press 「**項目を追加**」 (Add field).

> ⚠️ The fixed values that were there from the start (補正値 / correction value, LDチャージ / LD charge, 加工単価 / machining unit price, 予備形状本数 / spare shape count) **cannot be renamed or deleted**. Only their value and displayed name can be changed.

If the key box turns red, it is one of these two reasons.

- 「**予約語です**」 (This is a reserved word) … the system already uses that name. Please use a different one.
- 「**キーが重複しています**」 (Duplicate key) … two fields have the same name. Please change one of them.

## ルックアップ表 (Lookup tables) — quick-lookup tables

If you register a quick-lookup table such as "for this diameter, this price", it is referenced during the calculation.

![The lookup table screen](../../assets/screenshots/trial-pricing-lookups-01.png)

1. Press 「**表を追加**」 (Add table).
2. In 「**ID（参照キー）**」 (ID / reference key), enter the code used to call this table (single-byte letters, digits, hyphens and underscores). **It cannot be changed after it is created.**
3. In 「**表示名**」 (Display name), enter the name shown on screen.
4. In 「**戻り値の型**」 (Return value type), choose 「**数値**」 (number) or 「**文字列**」 (text).
5. In 「**既定値**」 (Default value), enter the value returned when nothing in the table matches.
6. In 「**キー列**」 (Key columns), decide which columns are used as the clue when searching. There are three 「**照合方法**」 (matching methods).
   - 「**完全一致**」 (Exact match) … looks for an exactly identical value.
   - 「**≥ 以上で最小（径×長）**」 (Smallest value that is ≥, for diameter × length) … picks the smallest row that is at or above that value.
   - 「**≤ 以下で最大（LD/割引）**」 (Largest value that is ≤, for LD / discounts) … picks the largest row that is at or below that value.
7. Under 「**データ**」 (Data), press 「**行を追加**」 (Add row) and enter the contents.
8. Press 「**保存**」 (Save).

### Importing from Excel

For a table with many rows, you can enter everything at once from Excel.

1. Press 「**テンプレート/CSV**」 (Template / CSV) to write the current contents out to a file.
2. Open it in Excel and edit the contents.
3. Press 「**CSV 取込**」 (Import CSV) and select that file.
4. When 「**取り込みました**」 (Imported) appears, check the contents on screen and press 「**保存**」 (Save).

> ⚠️ Importing alone does not save anything. **Always press 「保存」 (Save) at the end.**

## FAQ and troubleshooting

**Q. If I edit a calculation criterion, will past quotation amounts change too?**
A. No, they will not. A trial estimate that is already 確定 (confirmed) stores the calculation result of that time as it was. However, a trial estimate still in 下書き (draft) is recalculated with the new settings when it is confirmed.

**Q. No amount comes out for one particular kind of tool.**
A. It is possible that 「**使用する見積単価**」 (Quoted unit price to use) has not been set for that type. Open that type from 「工具種管理」 (Tool type management) and check that one wrap-up part is selected.

**Q. I cannot delete a tool type I added.**
A. Trial estimates using that type still exist. It cannot be deleted unless 「試算 M 件」 (M trial estimates) in the list shows `0`. There is no problem in leaving a type you no longer use as it is, without deleting it.

**Q. A calculation criterion shows 「適用なし」 (not applied) in red.**
A. That criterion is not set for any kind of tool. If you want to use it, open it and choose 「**適用工具種**」 (Applicable tool types) — or press 「**全選択**」 (Select all) if you want it used everywhere.

**Q. I want to add a new box to the trial estimate input screen.**
A. Add a field in 「**カスタム入力項目**」 (Custom input fields) and set its 「**スコープ**」 (Scope) to 「**見積入力（フォームに表示）**」 (Estimate input — shown on the form). The added field appears as an input box from the next trial estimate you create.

**Q. I want to write extra calculation logic freely by myself.**
A. That function is not on the current screens. When you want to change how the calculation works, do it by adding or editing 「**計算基準**」 (Calculation criteria). Please consult your system administrator about the contents of an expression.

**Q. What should I check after changing a setting?**
A. On the screen of the criterion you changed, choose a 「**テスト工具種**」 (Test tool type), press 「**テスト実行**」 (Run test), and check that the expected amount comes out. On top of that, creating one real trial estimate and comparing the amounts makes it certain.
