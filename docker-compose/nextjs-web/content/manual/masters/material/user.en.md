---
title: "Material — User Manual"
description: "A ledger where you register, one kind at a time, the material bars you buy and keep in stock. The materials you register here become the choices for purchase orders and stock."
screenshots: [master-material-list-01, master-material-new-01, master-material-search-01, master-material-detail-01]
---
This is a ledger where you register, one kind at a time, the material bars you buy and keep in stock. The operation code is `MS06`.

If a [Material Type](/manual/en/masters/material-type/user) says "what kind of material it is", a material is **"that material, in this diameter, this length and this surface finish"** — the actual bar you buy and put on the shelf. A material that is not registered here **cannot be chosen** on a [Material Purchase Order](/manual/en/apps/purchase-order/user) or in [Inventory Management (Materials and Work in Progress)](/manual/en/apps/material-inventory/user).

> ⚠️ This app is currently available **only in the development environment (the environment for testing)**. The screens and the steps may change before it becomes available for real work.

## What you can do in this app

- You can register the material bars you buy, by diameter, length and surface finish.
- After you register one, you can choose it on the material purchase, receipt and stock screens.
- The material code is **built automatically** from what you choose. You do not need to type it.
- When you stop buying a material, you can set it to **無効** (Inactive) instead of deleting it.

## Words used on this page

- **素材 (Material)** … the material bar you actually buy and keep in stock.
- **材種 (Material type)** … the kind of material. It is the "parent" of the material (you register it in [Material Type](/manual/en/masters/material-type/user)).
- **黒皮 / 研磨 (Black skin / Ground)** … the surface finish of the material.
- **種類 (Kind)** … a more detailed division for each shape. For a normal round bar it is decided automatically.
- **メーカ型式 (Maker model)** … the part number given by the maker.
- **呼び径 (Nominal diameter)** … the rough diameter used in catalogues and so on.

## Before you start

To register a material, the **[Material Type](/manual/en/masters/material-type/user) must be registered first**. Every material always belongs to one material type.

You also need **master data permission** to use this app. If the screen does not open, please ask your administrator.

Please note that a [Product](/manual/en/masters/product/user) sets its material as "material type + diameter + length". **A product is not tied to one particular material.** This ledger is only for buying and stock.

## How the material code works

The material code is the material type code with the **surface finish, the diameter and the length** joined after it. You do not type them one by one — the code is **built automatically from what you choose**.

For example, `A02A0001-A080-310` is read like this.

| Place | What you see | What it means |
|---|---|---|
| First 8 characters | `A02A0001` | Material type code (the parent material type) |
| 1 character after the hyphen | `A` | Surface finish (black skin in this case) |
| Next 3 characters | `080` | Diameter 8.0mm |
| Last 3 characters | `310` | Length 310mm |

The diameter goes in as **the number multiplied by 10**. 8.0mm becomes `080`, and 12.5mm becomes `125`. The converted number is shown under the input field, so you do not need to work it out yourself.

## How to read the screen

When you open the app, a list of the registered materials is shown.

![Material list screen](../../assets/screenshots/master-material-list-01.png)

- **素材コード (Material code)** … the number joined with hyphens.
- **材種 / 直径 / 全長 / 黒皮研磨 (Material type / Diameter / Length / Surface finish)** … the content of that material, split into columns.
- **状態 (Status)** … the green 「**有効**」 (Active) means a material you can still use. The gray 「**無効**」 (Inactive) means one you can no longer choose.
- Use the search box at the top (「**素材コード・名称で検索**」 / Search by material code or name) to narrow the list.
- In the 「**材種**」 (Material type) and 「**黒皮研磨**」 (Surface finish) fields you can show only one material type or one surface finish.
- Click a row to open the detail screen for that material.

## Registering a material

### Choosing the parent material type

1. Press 「**新規作成**」 (New) at the top right of the list screen.
2. Click the 「**材種**」 (Material type) field and type a material type name or a material type code.
3. Choose one from the list that appears.

If you cannot remember the material type name, press the **magnifying-glass button** on the left of the field. A screen named 「材種の詳細検索」 (Detailed material type search) opens, where you can look for it while narrowing by maker or shape.

![Detailed material type search screen](../../assets/screenshots/master-material-search-01.png)

### Entering the diameter, the length and the surface finish

4. Choose 「**黒皮・研磨**」 (Black skin / Ground).
5. Enter the diameter in 「**直径 (mm)**」 (Diameter in mm) — from 0.1 to 99.9.
6. Enter the length in 「**全長 (mm)**」 (Length in mm) — from 1 to 999.
7. Choose 「**種類**」 (Kind). For a normal round bar it is already chosen for you.
8. A blue bar shows 「**素材コード:**」 (Material code) with the code that will be made.

![New material form](../../assets/screenshots/master-material-new-01.png)

### Checking the name and the unit, then saving

9. 「**名称（日本語）**」 (Name in Japanese) is **filled in automatically** in the form "material type name φdiameter×length". You can leave it as it is, or rewrite it.
10. Check 「**単位**」 (Unit) — it is usually 「本」.
11. Fill in 「**メーカ型式**」 (Maker model), 「**呼び径 (mm)**」 (Nominal diameter in mm) and 「**備考**」 (Notes) as far as you know them (you can save with them empty).
12. Press 「**保存**」 (Save).

> ⚠️ **The material type, the surface finish, the diameter, the length and the kind cannot be changed after you save.** They are part of the code. If you entered something wrong, please register a new material instead.

> ⚠️ You cannot register two materials with exactly the same diameter, length and surface finish. Please use the one that already exists.

## Looking at what you registered

The screen of a saved material has three tabs.

![Material detail screen](../../assets/screenshots/master-material-detail-01.png)

At the top of the screen you see the material code, material type, surface finish, diameter, length, kind, nominal diameter, maker model and unit.

- **概要** (Overview) … the name (Japanese and English) and the notes.
- **関連** (Related) … an explanation of how it connects to products.
- **履歴** (History) … the record of when and who changed this registration.

To correct the content, press 「**編集**」 (Edit) at the top right of the screen. **You can edit the name, the unit, the maker model, the nominal diameter, the active setting and the notes.**

## What to do with a material you no longer buy

Even when you stop buying a material, **please do not delete it**. Past purchase and stock records point to that material. Set it to "Inactive" instead.

1. Press the menu (the button with three dots) at the top right of the material screen.
2. Choose 「**無効化**」 (Deactivate).
3. On the confirmation screen, press 「**無効化する**」 (Deactivate).

Once it is inactive, you can no longer choose it on new purchase orders or work orders, but **the past data stays as it is**.

## Questions and problems

**Q. I see 「同一構成（材種 × 黒皮研磨 × 直径 × 全長）の素材が既に存在します」 (A material with the same make-up — material type × surface finish × diameter × length — already exists) and cannot save.**
A. A material with exactly the same combination is already registered. Please find it in the list and use it. You do not need to make a new one.

**Q. I see 「未変換（レガシー）の材種では素材を作成できません。変換済の材種を選択してください。」 (You cannot create a material from a not-converted (legacy) material type. Please choose a converted material type).**
A. The material type you chose does not have a code yet. Register it again on the [Material Type](/manual/en/masters/material-type/user) screen, then choose that material type.

**Q. I type in the material type field, but the material type I want does not appear.**
A. Only material types that have a code can be chosen. The screen also says under the field: 「変換済（コード構成あり）の材種のみ選択できます」 (Only converted material types, which have a code structure, can be chosen). Please register it again on the [Material Type](/manual/en/masters/material-type/user) screen.

**Q. The 「種類」 (Kind) field is gray and I cannot use it.**
A. Please choose 「材種」 (Material type) first. The field shows 「先に材種を選択してください」 (Please choose a material type first).

**Q. I see 「直径は 0.1〜99.9mm で入力してください」 (Please enter a diameter between 0.1 and 99.9 mm).**
A. Please enter a diameter between 0.1 and 99.9. The length must be between 1 and 999.

**Q. I cannot correct the diameter or the length on the edit screen.**
A. That is how it works. They are part of the code, so they cannot be changed after you save. If you entered something wrong, please register a new material instead.

**Q. When I try to delete, I see 「関連するデータが存在するため実行できません」 (This cannot be done because related data exists).**
A. Purchase or stock records that use that material already exist, so it cannot be deleted. This is normal. Please use 「無効化」 (Deactivate).
