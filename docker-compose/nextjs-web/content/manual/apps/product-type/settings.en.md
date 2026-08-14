---
title: "Product Items & Product Types — Settings Manual"
description: "Set up the input boxes that appear when you register a product, so they are ready in advance."
screenshots: [product-items-01, product-item-edit-01, product-types-01, product-type-edit-01, product-form-type-01]
---
These settings let you prepare, in advance, the input boxes that appear when you register a [product](/manual/en/masters/product/user). The settings are split into two screens.

- **製品項目 (Product items)** (operation code `SY03`) … Where you make the input boxes one by one.
- **製品種別 (Product types)** (operation code `SY04`) … Where you combine the input boxes you made into a product "template".

> ⚠️ These settings need system permission. Also, changing things here changes the product registration screen **for everyone**.

## What you can do with these settings

- Add input boxes your company needs, such as "surface treatment" or "hardness".
- Decide, for each input box, whether it takes text, numbers, or a date.
- Group input boxes into templates such as "standard item" or "coated item".
- Give a template values that are already filled in (defaults).
- Input boxes and templates you no longer use can be paused instead of deleted.

## Words used on this page

- **項目 (item)** … One input box. For example, "surface treatment" or "hardness".
- **キー (key)** … The name the system uses to tell that input box apart. It does not appear on the screen.
- **型 (type)** … The kind of value the box accepts. If you set it to "number", nothing but digits can be entered.
- **製品種別 (product type)** … A product template made from a group of input boxes. For example, "standard item".
- **割り当て (assignment)** … Putting an input box into a template.
- **既定値 (default value)** … A value that is already filled in from the start.

## Before you start

- First make the input boxes under 「**製品項目**」 (Product items), then combine them under 「**製品種別**」 (Product types). In the other order there are no input boxes to assign.
- To open it, choose 「**製品項目**」 (Product items) under System on the home screen, or type `SY03` in the search box at the top.
- You can move between the two screens with the 「**製品種別へ**」 (To product types) and 「**製品項目へ**」 (To product items) buttons at the top right of each.

## 1. Making the input boxes (Product items)

![Product items list screen](../../assets/screenshots/product-items-01.png)

The list shows the input boxes made so far. Click a row's name to open its edit screen.

- The switch on the left turns that input box **on or off**. When it is off, the row turns pale.
- The **↑ ↓** on the right change the order.
- The trash-can mark on the right deletes it. Deleting it also removes it from any template it was assigned to.
- To make a new one, press 「**項目を追加**」 (Add item) at the top right.

### Making one input box

1. Press 「**項目を追加**」 (Add item) at the top right of the list.
2. In 「**項目名（日本語）**」 (Item name (Japanese)), type the name you want on the screen (for example, 表面処理 / surface treatment).
3. In 「**項目名（英語）**」 (Item name (English)), type the same meaning in English.
4. In 「**キー（識別子）**」 (Key (identifier)), type a name that starts with a single-byte letter or an underscore (`_`). From the second character on, digits can be used too (for example, `surfaceTreatment`).
5. In 「**型**」 (Type), choose the kind of value it takes.
6. If there is a value you want filled in from the start, put it in 「**既定値（基本）**」 (Default value (base)).
7. If you want a faint example shown in the box, put it in 「**プレースホルダ**」 (Placeholder).
8. To make it a box that must be filled in, turn on 「**必須項目にする**」 (Make required).
9. Press 「**保存**」 (Save).

![Input box edit screen](../../assets/screenshots/product-item-edit-01.png)

> ⚠️ 「キー（識別子）」 (Key (identifier)) **cannot be changed** once saved. This is because template assignments are joined by this name. If you want a different name, make a new item instead.

### Type (the kind of value it takes)

| Type | What you can put in |
|---|---|
| 文字列 (Text) | Any text. If you want a set format, you can decide the shape with 「パターン（正規表現）」 (Pattern) |
| 数値 (Number) | Digits only. You can also set a range with 「最小値」 (Minimum) and 「最大値」 (Maximum) |
| 真偽（はい/いいえ） (Yes/no) | Becomes a switch for choosing "yes" or "no" |
| 選択 (Choice) | Becomes a box where you pick from options you prepared |
| 日付 (Date) | Dates only |

When you choose 「**選択**」 (Choice), boxes for the options appear below. Fill in 「**値**」 (Value — what gets saved) and 「**表示ラベル**」 (Display label — the text shown on the screen), and add rows with 「**選択肢を追加**」 (Add option).

## 2. Making the templates (Product types)

![Product types list screen](../../assets/screenshots/product-types-01.png)

This list works the same way as product items. The switch turns it on or off, the ↑ ↓ reorder it, and the trash-can mark deletes it. The blue badge to the right of the name is the number of input boxes built into that template.

### Making one template

1. Press 「**種別を追加**」 (Add type) at the top right of the list.
2. In 「**種別名（日本語）**」 (Type name (Japanese)), type a name (for example, 標準品 / standard item).
3. In 「**種別名（英語）**」 (Type name (English)), type the same meaning in English.
4. Write in 「**説明**」 (Description) when this template is used (it can be left blank).
5. Press 「**項目を割り当て**」 (Assign item).
6. In the 「**項目**」 (Item) box that appears, choose the input box you want to build in.
7. If you want a value filled in only for this template, put it in 「**既定値（上書き）**」 (Default value (override)).
8. Repeat 6–7 as many times as you need.
9. You can change the order with the **↑ ↓** on each row.
10. Press 「**保存**」 (Save).

![Product type edit screen](../../assets/screenshots/product-type-edit-01.png)

> 💡 If you leave 「既定値（上書き）」 (Default value (override)) blank, the default set on the product item side is used as it is. Fill it in only when you want a different value per template.

If you turn off the 「**有効（製品作成の選択肢に出す）**」 (Enabled — show as a choice when creating a product) switch, that template no longer appears as a choice on the product registration screen. For a template you no longer use, this is a safer way to stop it than deleting it.

## 3. How it looks when registering a product

A box called 「**製品種別**」 (Product type) appears on the new [product](/manual/en/masters/product/user) screen.

1. Choose a template in 「**製品種別**」 (Product type).
2. The input boxes built into that template appear below.
3. The defaults are already filled in, so change only the parts you need to.

![Product type on the product registration screen](../../assets/screenshots/product-form-type-01.png)

You can also add input boxes that are not in the template, by choosing them under 「**追加項目**」 (Extra items) below. Only the input boxes made under "製品項目" (Product items) appear there.

If a value you entered does not match its type, you are told when you try to save; fix it and save again.

## Questions and problems

**Q. On the product registration screen, I cannot choose a template I made.**
A. Check in the list whether that template's switch is off. Rows shown in pale colour are turned off.

**Q. There are no input boxes at all to assign to a template.**
A. Only input boxes whose switch is on can be assigned. Either make input boxes under "製品項目" (Product items) first, or turn the switch back on for ones you had paused.

**Q. I get 「キーは英字/アンダースコア始まりの識別子にしてください」 (The key must be an identifier starting with a letter or underscore).**
A. Start the key with a single-byte letter or an underscore (`_`). From the second character on, digits can be used too. Japanese, a leading digit, and symbols such as hyphens or spaces cannot be used (for example, `surfaceTreatment`).

**Q. I get 「同じキーの項目が既に存在します」 (An item with the same key already exists).**
A. That key is already in use. Please use a different name.

**Q. I get 「選択肢を1つ以上追加してください」 (Please add at least one option).**
A. You set the type to 「選択」 (Choice) but there is nothing to choose from. Add at least one with 「選択肢を追加」 (Add option).

**Q. I get 「同じ項目が重複して割り当てられています」 (The same item is assigned more than once).**
A. You have built the same input box into one template twice. Delete one of the rows with the trash-can mark.

**Q. I deleted an input box and it disappeared from the template too.**
A. That is how it works. Deleting an input box also removes it from any template that used it. If you only want to pause it for a while, turn the switch off instead of deleting it.
