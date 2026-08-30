---
title: "Numbering Setup — User Manual"
description: "A screen where you register the parts used to build material type codes and material codes. You add to it when you start using a new maker or a new shape."
screenshots: [master-material-numbering-01, master-material-numbering-grades-01, master-material-numbering-add-01, master-material-numbering-diameters-01]
---
This is a screen where you register the "parts" used to build [Material Type](/manual/en/operations/masters/material-type/user) codes and [Material](/manual/en/operations/masters/material/user) codes. The operation code is `MS07`.

When you register a material type or a material, you **choose** the 「メーカー」 (Maker), the 「形状」 (Shape) and so on from a list. This screen is where those choices themselves are prepared. **When you start using material from a new maker, for example, you add it here first.**

> ⚠️ This app is currently available **only in the development environment (the environment for testing)**. The screens and the steps may change before it becomes available for real work.

## What you can do in this app

- You can see all seven kinds of choices used in material type codes and material codes in one place.
- You can add a new maker, a new shape and so on.
- You can stop a choice you no longer use from appearing in new registrations.

## Words used on this page

- **構成要素 (Code element)** … the "parts" that build a code. It means each single choice, such as a maker or a shape.
- **材種コード (Material type code)** … the 8-character number given to each material type (for example `A02A0001`).
- **素材コード (Material code)** … the material type code with the surface finish, the diameter and the length added (for example `A02A0001-A080-310`).
- **黒皮 / 研磨 (Black skin / Ground)** … the surface finish of the material.

## Before you start

You need **master data permission** to use this app. If the screen does not open, please ask your administrator.

You will almost never open this screen in your daily work. It is the screen you use **when the choice you want does not appear on the [Material Type](/manual/en/operations/masters/material-type/user) or [Material](/manual/en/operations/masters/material/user) registration screen**.

## How to read the screen

This screen is split into seven tabs. Press a tab at the top to switch what is shown.

![Maker tab of the numbering setup screen](../../../assets/screenshots/master-material-numbering-01.png)

| Tab | What choices it holds | Where it is used |
|---|---|---|
| **メーカー** (Maker) | Material makers | The first 1 character of the material type code |
| **メーカー材種** (Maker grade) | The grades inside that maker | Characters 2–3 of the material type code |
| **形状** (Shape) | 通常 / OH / 円筒 (normal / OH / cylinder) and so on | The 4th character of the material type code |
| **種類** (Kind) | The detailed divisions for each shape | Chosen when you register a material |
| **黒皮・研磨** (Black skin / Ground) | The surface finish of the material | The middle 1 character of the material code |
| **直径** (Diameter) | The diameter of the material | The middle 3 digits of the material code |
| **全長** (Length) | The length of the material | The last 3 digits of the material code |

On every tab, the table has the columns 「**コード**」 (Code), 「**名称**」 (Name), 「**状態**」 (Status) and 「**更新日**」 (Updated). The 「メーカー材種」 (Maker grade) tab also has a 「**メーカー**」 (Maker) column showing which maker it belongs to, and the 「種類」 (Kind) tab has a 「**形状**」 (Shape) column.

![Maker grade tab of the numbering setup screen](../../../assets/screenshots/master-material-numbering-grades-01.png)

## Adding a choice

1. Open the tab for the kind you want to add.
2. Press the button at the top right of the screen. **The text on the button changes to match the tab you have open** (「**メーカーを追加**」 / Add maker, 「**形状を追加**」 / Add shape, and so on).
3. Fill in the content on the screen that opens (see the table below).
4. Press 「**追加**」 (Add).

![Screen for adding a choice](../../../assets/screenshots/master-material-numbering-add-01.png)

| Tab | What to enter |
|---|---|
| メーカー (Maker) | One capital letter in 「**コード**」 (Code) — for example `A` — and 「**名称（日本語）**」 (Name in Japanese) |
| メーカー材種 (Maker grade) | Choose 「**メーカー**」 (Maker), enter 2 digits in 「**コード**」 (Code) — for example `01` — and 「**名称（日本語）**」 (Name in Japanese) |
| 形状 (Shape) | One capital letter in 「**コード**」 (Code) and 「**名称（日本語）**」 (Name in Japanese) |
| 種類 (Kind) | Choose 「**形状**」 (Shape), enter 2 characters in 「**コード**」 (Code) — capital letters and digits can be mixed, for example `B5` — and 「**名称（日本語）**」 (Name in Japanese) |
| 黒皮・研磨 (Black skin / Ground) | One capital letter in 「**コード**」 (Code) and 「**名称（日本語）**」 (Name in Japanese) |
| 直径 (Diameter) | Only 「**直径 (mm)**」 (Diameter in mm), from 0.1 to 99.9. The code is decided automatically |
| 全長 (Length) | 「**全長 (mm)**」 (Length in mm), from 1 to 999, and 「**カスタム識別（任意）**」 (Custom label, optional) if you need it — for example 特注 330L |

> 💡 On the 「直径」 (Diameter) and 「全長」 (Length) tabs, **you do not need to decide the code yourself**. When you enter a number, the 3 digits decided automatically are shown under the input field as 「コード:」 (Code).

![Diameter tab of the numbering setup screen](../../../assets/screenshots/master-material-numbering-diameters-01.png)

> 💡 「直径」 (Diameter) and 「全長」 (Length) are **added automatically on the spot** when you register a [Material](/manual/en/operations/masters/material/user). You only add them here in advance when you want the choices ready beforehand, or when you want to tidy up the names.

## Hiding a choice you no longer use

The entries on this screen **cannot be deleted**. Once a code is made, it is inside material type codes and material codes. Set it to "Inactive" instead.

1. Press the menu on the right of the row you want to hide.
2. Choose 「**無効化**」 (Deactivate).
3. A screen named 「無効化の確認」 (Deactivation confirmation) opens. Press 「**無効化する**」 (Deactivate).

Once it is inactive, **it no longer appears among the choices when you make a new material type or material.** The material type codes and material codes that are already registered do not change at all.

If you want to use it again, you can turn it back with the same steps using 「**有効化**」 (Activate).

## Input fields

Numbering components registers the "parts" from which material type and material codes are assembled. Every part uses the same three fields.

| Field | Required | What to enter |
|-------|----------|---------------|
| [Code](#field-code) | Required | The symbol used in the code |
| [Name](#field-name) | Required | The name shown in pick lists |
| [Active](#field-active) | — | Whether it appears in pick lists |

### Code [#field-code]

The symbol that becomes part of a material type or material code. **Changing it later would no longer match codes already assembled from it**, so decide it at registration. The number of characters is fixed per part (one for manufacturer, three for diameter, and so on).

### Name [#field-name]

The name shown in pick lists on the material type and material screens.

### Active [#field-active]

Turning it off removes it from the pick lists when registering material types and materials. Use it to **hide a manufacturer or shape you no longer use while keeping past registrations**.

## Questions and problems

**Q. I see 「同じコードが既に存在します」 (The same code already exists) and cannot add it.**
A. That code is already in use. Look at the table and check whether the one you are looking for is already there. If it is only 「無効」 (Inactive), you can bring it back with 「有効化」 (Activate).

**Q. I see 「コードは英大文字1文字です」 (The code must be one capital letter).**
A. Please enter exactly one capital letter in the code field. Small letters, numbers and two or more characters cannot be used.

**Q. I see 「コードは数字2桁です」 (The code must be 2 digits) or 「コードは英数字2桁です」 (The code must be 2 letters or digits).**
A. A maker grade code is 2 digits (for example `01`). A kind code is 2 characters and can mix capital letters and digits (for example `B5`). Please make it exactly 2 characters.

**Q. I cannot find the delete button.**
A. There is no delete on this screen. Codes are inside material type codes and material codes, so deleting one would make past data unreadable. Please use 「無効化」 (Deactivate) for the ones you do not use.

**Q. If I make a choice inactive, what happens to the past data for that material?**
A. Nothing changes. Past material type codes and material codes stay as they are and can still be used. Only "the choices when you create something new" become inactive.

**Q. I registered a name by mistake. Can I correct it?**
A. There is no edit on this screen. Please deactivate the wrong one with 「無効化」 (Deactivate) and add a new one with the correct name. Note that codes cannot be duplicated, so you need to use a different code.

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
