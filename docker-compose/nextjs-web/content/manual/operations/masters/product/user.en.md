---
title: "Product — User Manual"
description: "A ledger for the products you make. The products you register here become the choices in the 「製品」 (Product) field of trial estimates and quotes."
screenshots: [master-product-list-01, master-product-new-01, master-product-detail-01, master-product-routes-01, master-product-route-new-01]
---
This is a ledger for the products you make. The operation code is `MS04`.

**If a product is not registered, you cannot make a [Trial Estimate](/manual/en/operations/sales/trial-estimate/user), a [Price List](/manual/en/operations/sales/price-list/user) or a [Quote](/manual/en/operations/sales/quote/user).** When a new product comes up, register it on this screen first.

## What you can do in this app

- You can register the products you make.
- After you register a product, you can choose it in the 「製品」 (Product) field of trial estimates, price lists and quotes.
- You can record **what material the product is made from** (material type, diameter, length).
- You can record the rules for each product, such as hardness and tolerance.
- You can register the **order of the process steps** used to make that product.
- You can **copy** a similar product and change only the parts you need.

## Words used on this page

- **製品コード (Product code)** … one control number for each product. It starts with `PRD-`. It is added automatically when you save.
- **材種 (Material type)** … the kind of material. It shows whose material it is and what kind it is (you register it in [Material Type](/manual/en/operations/masters/material-type/user)).
- **単位 (Unit)** … how the items are counted (本 / 個 / kg / m / セット).
- **製品種別 (Product type)** … a set of input fields prepared for each type of product, such as 「標準品」 (standard product) or 「コーティング品」 (coated product).
- **仕様 (Specification)** … the rules for that product, such as hardness, tolerance and drawing number.
- **工程リスト（ルート） (Process route)** … the order of the process steps used to make that product.

## Before you start

To register a product, the **[Material Type](/manual/en/operations/masters/material-type/user) must be registered first**. The material type is used in the field where you choose "what material to use".

You can also register a product without choosing a material type, but then you cannot get the material cost later when you make a [Trial Estimate](/manual/en/operations/sales/trial-estimate/user). We recommend that you fill in the material type as well whenever you can.

## How to read the screen

When you open the app, a list of the registered products is shown.

![Product list screen](../../../assets/screenshots/master-product-list-01.png)

- **製品コード (Product code)** … a control number that starts with `PRD-`. The system adds it automatically.
- **材種 (Material type)** … shows what material the product is made from, in the form "material type code — material type name φdiameter×length". For a product with no material decided, it shows "—".
- **状態 (Status)** … the green 「**有効**」 (Active) means a product you can still use. The gray 「**無効**」 (Inactive) means a product you can no longer choose.
- In the search box at the top (「**製品コード・名称・材種で検索**」 / Search by product code, name or material type) you can search **not only by product name but also by material type**.
- Click a row to open the detail screen for that product.

> 💡 Some products brought over from the old system have no product code. Those rows show 「**未採番**」 (Not numbered) in gray. You can use them as they are.

## Registering a product

### Entering the name and the unit

1. Press 「**新規作成**」 (New) at the top right of the list screen.
2. Enter the product name in 「**名称（日本語）**」 (Name in Japanese). **This field must always be filled in.**
3. Choose 「**単位**」 (Unit). **This must also always be chosen** (it is usually 「本」).

### Choosing the material

4. Click the 「**材種**」 (Material type) field in 「**素材仕様**」 (Material specification) and type a material type name or a material type code.
5. Choose the material type you use from the list that appears.
6. Enter the diameter of the material in 「**直径 (mm)**」 (Diameter in mm).
7. Enter the length of the material in 「**全長 (mm)**」 (Length in mm).
8. Press 「**保存**」 (Save).

![New product form](../../../assets/screenshots/master-product-new-01.png)

> 💡 When you enter the diameter or the length, a 3-digit number appears under the field (for example, 「060」 for a diameter of 6.0mm). The system makes this number by itself, so you do not need to worry about it.

> ⚠️ When you choose a material type, you **must also enter the diameter and the length**. You cannot save with only one of them.

> ⚠️ You cannot type in the 「**製品コード**」 (Product code) field. As the screen says 「保存時に自動採番」 (numbered automatically on save), a number such as `PRD-202607-0001` is added by itself when you save.

### Entering the rules for each product (optional)

When the 「**製品種別**」 (Product type) field is shown, choose from 「標準品」 (standard product), 「コーティング品」 (coated product) and so on. When you choose one, the input fields decided for that category (surface treatment, hardness, tolerance and so on) appear below.

If you want more fields, choose them from 「**項目を追加**」 (Add item) under 「**追加項目**」 (Extra items). **You cannot make a field with a name of your own.** You choose from the items that are prepared in advance. To remove a field you added, press the 「−」 button on that row.

> 💡 The items and the categories you can choose are decided by the administrator. If the item you need is missing, please ask the person in charge of [Product Type](/manual/en/operations/system/product-type/settings).

## Looking at what you registered

The screen of a saved product has four tabs.

![Product detail screen](../../../assets/screenshots/master-product-detail-01.png)

- **概要** (Overview) … the product type, the specification (a table of items and values) and the notes.
- **工程** (Processes) … the order of the process steps used to make this product.
- **関連** (Related) … the price lists for this product, listed per customer. Click one to open that price list.
- **履歴** (History) … the record of when and who changed this registration.

To correct the content, press 「**編集**」 (Edit) at the top right of the screen.

## Registering the order of the process steps

On the 「工程」 (Processes) tab you can register the order of the process steps used to make that product. If you register it, the steps are **already filled in** when you make a [Work Order](/manual/en/operations/production/work-order/user). You no longer have to choose the steps from nothing every time.

![Processes tab on the product detail screen](../../../assets/screenshots/master-product-routes-01.png)

1. Open the 「**工程**」 (Processes) tab.
2. Press 「**ルート新規作成**」 (New route).
3. Enter 「**ルート名（日本語）**」 (Route name in Japanese) — for example, 標準工程 (standard process). **This field must always be filled in.**
4. In 「**工程選択**」 (Choose steps), tick the steps you use.
5. The steps you ticked are listed in 「**選択済み工程・実施場所**」 (Chosen steps and where they are done).
6. For a step that can be done in-house or outside, choose 「**社内**」 (In-house) or 「**外注**」 (Outsourced).
7. When you choose 「**外注**」 (Outsourced), also choose 「**仕入先（外注先）**」 (Supplier / outsourcing company).
8. For the steps you know, enter 「**作業時間**」 (Work time) (you can leave it empty).
9. Press 「**保存**」 (Save).

![New process route screen](../../../assets/screenshots/master-product-route-new-01.png)

> 💡 Some steps, such as inspection and approval, are always needed together with another step. Those steps are added automatically when you choose the other one. A blue bar tells you: 「必須工程を自動追加しました」 (Required steps were added automatically).

### When you want to change the order of the steps

The order of the steps is kept by **version**. The earlier content is kept too, so you can see later when and how it changed.

- To change the steps → press 「**新バージョン**」 (New version) on the route. It starts with the earlier content already filled in.
- To correct only the name → press 「**編集**」 (Edit).
- To remove the whole route → press 「**削除**」 (Delete).

## Making a similar product

When you add a product that is almost the same as one you registered before, you can copy it instead of typing everything again.

1. Open the product you want to copy.
2. From the menu at the top right (the button with three dots), press 「**複製**」 (Copy).
3. 「**名称（日本語）**」 (Name in Japanese) contains a name with 「（コピー）」 (copy) added, so change it to the correct name.
4. Check 「**単位**」 (Unit).
5. Press 「**複製して新規作成**」 (Copy and create).

The material type, the diameter and the length are carried over from the product you copied. A new product code is added automatically.

## What to do with a product you no longer make

Even when you stop making a product, **please do not delete it**. Past quotes and other documents point to that product. Set it to "Inactive" instead.

1. Press the menu (the button with three dots) at the top right of the product screen.
2. Choose 「**無効化**」 (Deactivate).
3. On the confirmation screen, press 「**無効化する**」 (Deactivate).

Once a product is inactive, you can no longer choose it in new trial estimates, price lists or quotes, but **the past data stays as it is**.

## Questions and problems

**Q. I see 「単位を選択してください」 (Please choose the unit) and cannot save.**
A. 「単位」 (Unit) in 「基本情報」 (Basic information) has not been chosen yet. Normally you choose 「本」.

**Q. I see 「直径は 0.1〜99.9mm で入力してください」 (Please enter a diameter between 0.1 and 99.9 mm).**
A. When you choose a material type, the diameter is required. Enter a value between 0.1 and 99.9. The length must be between 1 and 999.

**Q. I type in the material type field, but the material type I want does not appear.**
A. Only material types "that have a code structure registered" can be chosen. The screen also says under the field: 「変換済（コード構成あり）の材種のみ選択できます」 (Only converted material types, which have a code structure, can be chosen). Material types brought over from the old system cannot be chosen, so please register them again in [Material Type](/manual/en/operations/masters/material-type/user).

**Q. When I try to delete, I see 「この製品を参照するデータ（価格表・見積書）が存在するため削除できません。無効化を検討してください。」 (This product cannot be deleted because data that refers to it — price lists, quotes — exists. Please consider deactivating it instead).**
A. Price lists or quotes that use that product already exist, so it cannot be deleted. This is normal. Please use 「無効化」 (Deactivate).

**Q. When I try to save a process route, I see 「工程を1つ以上選択してください」 (Please choose at least one step).**
A. No step is ticked. Please tick the steps you use in 「工程選択」 (Choose steps).

**Q. When I try to save a new version, I see 「最新バージョン v◯ と同じ構成です（変更がありません）」 (This is the same as the latest version v◯ — there is no change).**
A. The steps are exactly the same as the earlier version. Change something before saving, or press 「キャンセル」 (Cancel) to go back if it is fine as it is.

**Q. I cannot make an extra item with a name of my own.**
A. That is how it works. You can only choose from the items prepared in advance. If the item you need is missing, please ask your administrator.
