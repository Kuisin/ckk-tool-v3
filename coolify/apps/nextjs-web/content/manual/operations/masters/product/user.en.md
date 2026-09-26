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
- You can check the product's **specification** (material type, diameter, length, hardness, tolerance and so on) from the confirmed version in [Drawing](/manual/en/operations/production/design-file/user).
- You can register the **order of the process steps** used to make that product.
- You can **copy** a similar product and change only the parts you need.

## Words used on this page

- **製品コード (Product code)** … one control number for each product. It starts with `PRD-`. It is added automatically when you save.
- **材種 (Material type)** … the kind of material. It shows whose material it is and what kind it is (you register it in [Material Type](/manual/en/operations/masters/material-type/user)).
- **単位 (Unit)** … how the items are counted (本 / 個 / kg / m / セット).
- **仕様 (Specification)** … the material type, diameter and length, plus the rules for that product such as hardness, tolerance and drawing number. **It belongs to the version in [Drawing](/manual/en/operations/production/design-file/user)** (it cannot be edited in the product master).
- **工程リスト（ルート） (Process route)** … the order of the process steps used to make that product.

## Before you start

The product master only holds **the product as something you sell** (name, unit, tax category, keywords). **Material type, diameter, length, product type and product items are entered in [Drawing](/manual/en/operations/production/design-file/user).** They change together with the drawing across revisions and customers, so they belong to the drawing version.

After registering a product, register a version in Drawing and confirm it. The specification of the confirmed version is what this screen and the material candidates of a [Work Order](/manual/en/operations/production/work-order/user) use.

## How to read the screen

When you open the app, a list of the registered products is shown.

![Product list screen](../../../assets/screenshots/master-product-list-01.png)

- **製品コード (Product code)** … a control number that starts with `PRD-`. The system adds it automatically.
- **材種 (Material type)** … shows what material the product is made from, in the form "material type code — material type name φdiameter×length" (taken from the confirmed drawing version). A product with no confirmed version shows "—".
- **状態 (Status)** … the green 「**有効**」 (Active) means a product you can still use. The gray 「**無効**」 (Inactive) means a product you can no longer choose.
- In the search box at the top (「**製品コード・名称・材種で検索**」 / Search by product code, name or material type) you can search **not only by product name but also by material type**.
- Click a row to open the detail screen for that product.

> 💡 Some products brought over from the old system have no product code. Those rows show 「**未採番**」 (Not numbered) in gray. You can use them as they are.

## Registering a product

### Entering the name and the unit

1. Press 「**新規作成**」 (New) at the top right of the list screen.
2. Enter the product name in 「**名称（日本語）**」 (Name in Japanese). **This field must always be filled in.**
3. Choose 「**単位**」 (Unit). **This must also always be chosen** (it is usually 「本」).

4. If needed, enter 「**税区分**」 (Tax category), 「**キーワード**」 (Keywords) and 「**備考**」 (Notes).
5. Press 「**保存**」 (Save).

![New product form](../../../assets/screenshots/master-product-new-01.png)

> ⚠️ You cannot type in the 「**製品コード**」 (Product code) field. As the screen says 「保存時に自動採番」 (numbered automatically on save), a number such as `PRD-202607-0001` is added by itself when you save.

### Entering the specification (in Drawing)

Material type, diameter, length, product type and product items are entered by registering a version in [Drawing](/manual/en/operations/production/design-file/user). **Register the specification in Drawings** on the product's "Overview" tab opens the registration form with that product already selected. Choosing a Zunou RAPID SXF (.sfc) file fills them in automatically from the title block and dimensions.

## Looking at what you registered

The screen of a saved product has five tabs.

![Product detail screen](../../../assets/screenshots/master-product-detail-01.png)

- **概要** (Overview) … the specification (from the confirmed drawing version, with a link to that version), keywords and notes.
- **工程** (Processes) … the order of the process steps used to make this product. Each route shows its target customer (「汎用」 — generic — when none is set) and its 「◯ バージョン」 (number of versions).
- **顧客品番** (Customer product codes) … what each customer calls this product (their own product code), registered per customer.
- **関連** (Related) … this product's drawings (one series per ordering customer), design requests and price lists, listed per customer. Click one to open it.
- **履歴** (History) … the record of when and who changed this registration.

To correct the content, press 「**編集**」 (Edit) at the top right of the screen.

## Registering customer product codes

The "顧客品番" (customer product codes) tab lets you register the code each customer uses for this product. Registering one does two things:

- When an order document from that customer prints this product under that code, the [order acceptance](/manual/en/operations/sales/order-acceptance/user)'s AI import can match it to this product **from the code alone**.
- The [delivery note](/manual/en/operations/shipping/delivery-note/user) and [invoice](/manual/en/operations/billing/invoice/user) item line can print that customer's own code alongside your product name.

The tab opens read-only by default. Press 「**編集**」(Edit) to switch to a table of one row per customer, where you can add or remove rows.

- **Customer** (required) … the customer this code belongs to.
- **Code** (required) … the code that customer uses for this product.
- **Name** (optional) … what that customer calls this product.
- **Aliases** (optional) … any other spellings you see on that customer's orders besides the code itself. Used as extra matching candidates.
- **Status** … active / inactive. Deactivate a code that is no longer used instead of deleting it.

The same customer cannot appear on two rows (one code per customer).

## Viewing drawings

The "related" tab shows this product's drawings. **This view is read-only** — registering, editing and deleting happen in [Drawing](/manual/en/operations/production/design-file/user) (PD06). Keeping one place to write is what keeps version numbering consistent across screens. Use「**設計図で管理**」(manage in Drawing) at the top right to go there.

**Drawings grow per product and customer** (version numbers run across the whole product). The same product grows a separate drawing for each customer, so each series gets its own heading. A series with no customer is the **generic** one, used by work orders for customers that have no drawing of their own. Each series gets its own heading, with a thumbnail of the latest version on top (select it to enlarge; 3D models rotate in place).

Each version carries a source tag.

- **依頼 (request)** — registered as the deliverable of a [design request](/manual/en/operations/sales/design-request/user).
- **手動 (manual)** — registered without going through a request.

## Registering the order of the process steps

On the 「工程」 (Processes) tab you can register the order of the process steps used to make that product. If you register it, the steps are **already filled in** when you make a [Work Order](/manual/en/operations/production/work-order/user). You no longer have to choose the steps from nothing every time.

![Processes tab on the product detail screen](../../../assets/screenshots/master-product-routes-01.png)

1. Open the 「**工程**」 (Processes) tab.
2. Press 「**ルート新規作成**」 (New route).
3. Enter 「**ルート名（日本語）**」 (Route name in Japanese) — for example, 標準工程 (standard process). **This field must always be filled in.**
4. To make the route for a specific customer, choose that customer in 「**対象顧客**」 (Target customer). Left empty, it becomes 「**汎用**」 (generic — usable for any customer). A route with a customer set is chosen first when making a work order for the same customer × the same product.
5. In 「**工程選択**」 (Choose steps), tick the steps you use.
6. The steps you ticked are listed in 「**選択済み工程・実施場所**」 (Chosen steps and where they are done).
7. For a step that can be done in-house or outside, choose 「**社内**」 (In-house) or 「**外注**」 (Outsourced).
8. When you choose 「**外注**」 (Outsourced), also choose 「**仕入先（外注先）**」 (Supplier / outsourcing company).
9. For the steps you know, enter 「**作業時間**」 (Work time) (you can leave it empty).
10. If you need to, add a note in 「**備考**」 (Notes).
11. Press 「**保存**」 (Save).

![New process route screen](../../../assets/screenshots/master-product-route-new-01.png)

> 💡 Some steps, such as inspection and approval, are always needed together with another step. Those steps are added automatically when you choose the other one. A blue bar tells you: 「必須工程を自動追加しました」 (Required steps were added automatically).

### When you want to change the order of the steps

The order of the steps is kept by **version**. The earlier content is kept too, so you can see later when and how it changed.

- To change the steps → press 「**新バージョン**」 (New version) on the route. It starts with the earlier content already filled in. If you note what you changed in 「**備考**」 (Notes), it is shown next to the version selector, so the reason for the change can be seen later.
- To correct the route name (Japanese / English) or the 「**有効**」 (Active) switch → press 「**編集**」 (Edit).
- To remove the whole route → press 「**削除**」 (Delete).

## Making a similar product

When you add a product that is almost the same as one you registered before, you can copy it instead of typing everything again.

1. Open the product you want to copy.
2. From the menu at the top right (the button with three dots), press 「**複製**」 (Copy).
3. 「**名称（日本語）**」 (Name in Japanese) contains a name with 「（コピー）」 (copy) added, so change it to the correct name.
4. Check 「**単位**」 (Unit).
5. Press 「**複製して新規作成**」 (Copy and create).

A new product code is added automatically. **The specification (material type, diameter, length, product items) is not copied** — it belongs to the drawing version, so register a drawing for the new product in Drawing.

## What to do with a product you no longer make

Even when you stop making a product, **please do not delete it**. Past quotes and other documents point to that product. Set it to "Inactive" instead.

1. Press the menu (the button with three dots) at the top right of the product screen.
2. Choose 「**無効化**」 (Deactivate).
3. On the confirmation screen, press 「**無効化する**」 (Deactivate).

Once a product is inactive, you can no longer choose it in new trial estimates, price lists or quotes, but **the past data stays as it is**.

## Input fields

Every field on the product screen.

| Field | Required | What to enter |
|-------|----------|---------------|
| [Product code](#field-code) | Required | The product's reference number |
| [Name](#field-name) | Required | The product name |
| [Unit](#field-unit) | Required | Pieces and so on |
| [Tax category](#field-tax-category) | Optional | Consumption tax category (empty = use the default) |
| [キーワード (keywords)](#field-keywords) | Optional | Other ways this product is written (search + AI intake) |
| [Active](#field-active) | — | Whether it appears in pick lists |
| [Notes](#field-notes) | Optional | Notes |

### Product code [#field-code]

The product's reference number, used on quotes, order lines, work orders and every other document.

### Name [#field-name]

The product name, printed on documents.

### Unit [#field-unit]

How it is counted. The default is pieces.

### Tax category [#field-tax-category]

The consumption tax category for this product. It decides the tax on quotes and invoices.

Left empty, the **default** of the [tax category](/manual/en/operations/masters/tax-category/user) master applies — normally the standard 10% rate. Only pick a category for products on the reduced rate.

If the business partner has a tax category of its own, **that wins** (for a tax-exempt partner, for example).

> 💡 The rate is written into each line when the document is created. Changing a tax category afterwards does not move a quote or invoice that has already been issued.

### キーワード (keywords) [#field-keywords]

Other ways this product is written: abbreviations, readings (hiragana / katakana), English, and other notations of the size (φ8.3 / 8.3mm) — anything that differs from the registered name.

Registering them does two things.

1. **You can find it** — typing any of those words in the list's search box finds this product.
2. **The AI can find it** — when a received document is read, a name printed on it can be resolved to this product.

Press 「**AI で候補を出す**」 (suggest with AI) and candidates are generated from what is currently entered (name, unit, notes …). **Only the ones you click are added, and nothing is registered until you save** — look at them and pick the ones that fit.

If the same word is put on two products, neither can be chosen. Use words that point at **this product only**.

### Active [#field-active]

Turning it off removes the product from pick lists on quotes and price lists.

### Notes [#field-notes]

Notes. Writing down why something was decided, or anything to watch out for, helps whoever reads it later.

## Questions and problems

**Q. I see 「単位を選択してください」 (Please choose the unit) and cannot save.**
A. 「単位」 (Unit) in 「基本情報」 (Basic information) has not been chosen yet. Normally you choose 「本」.

**Q. There is no field for the material type or diameter.**
A. The specification belongs to the version in [Drawing](/manual/en/operations/production/design-file/user), so the product master has no fields for it. Register a version in Drawing and confirm it.

**Q. When I try to delete, I see 「この製品を参照するデータ（価格表・見積書）が存在するため削除できません。無効化を検討してください。」 (This product cannot be deleted because data that refers to it — price lists, quotes — exists. Please consider deactivating it instead).**
A. Price lists or quotes that use that product already exist, so it cannot be deleted. This is normal. Please use 「無効化」 (Deactivate).

**Q. When I try to save a process route, I see 「工程を1つ以上選択してください」 (Please choose at least one step).**
A. No step is ticked. Please tick the steps you use in 「工程選択」 (Choose steps).

**Q. When I try to save a new version, I see 「最新バージョン v◯ と同じ構成です（変更がありません）」 (This is the same as the latest version v◯ — there is no change).**
A. The steps are exactly the same as the earlier version. Change something before saving, or press 「キャンセル」 (Cancel) to go back if it is fine as it is.

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
