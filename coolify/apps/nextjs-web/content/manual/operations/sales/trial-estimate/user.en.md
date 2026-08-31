---
title: "Trial Estimate — User Manual"
description: "Enter the material and the machining conditions, and this app works out for you how much to sell one piece of that product for."
screenshots: [trial-estimate-list-01, trial-estimate-new-01, trial-estimate-new-02, trial-estimate-detail-01, trial-estimate-detail-02, trial-estimate-detail-03]
---
Enter the material cost and the machining conditions, and this app works out for you **how much to sell one piece** of that product for. The operation code is `SA01`.

## What you can do with this app

- From the material cost, machining cost, coating cost and so on, **the selling price per piece (the quoted unit price) is worked out for you**.
- The material price is filled in automatically from **how much that material was bought for in the past**.
- You can give the calculation a name, save it, and look at it again later.
- When you set a saved estimate to 確定 (confirmed), you can use it as the base price when you make a [price list](/manual/en/operations/sales/price-list/user).
- If you want to calculate again with similar conditions, you can **copy it and redo it**.

This is the first app you use when you decide the price of a new product.

## Words used on this page

- **価格試算 (trial estimate)** … one record of "how much do we sell this product for", worked out from the cost.
- **工具種 (tool type)** … the shape class of the tool. Three are provided as standard: **丸棒 (round bar) / 円筒 (cylinder) / OH付 (with OH)**. The class you choose changes which fields you fill in. Each company can also add its own classes, so you may see four or more on the screen.
- **材種 (material type)** … the kind of material. It is decided by the combination of maker and material grade.
- **参照単価 (reference unit price)** … the purchase price for 1000 mm of the material. It is filled in automatically from past purchases.
- **見積単価（基準）(quoted unit price, base)** … the selling price per piece worked out by this estimate. It becomes the 基準単価 (base unit price) on the price list.
- **下書き (draft) / 確定 (confirmed) / 価格表登録済 (used in a price list)** … where the estimate stands now. 下書き means it has only been created, 確定 means it can be used in a price list, and 価格表登録済 means it has actually been used in a price list.

## Before you start

- The **material you want to calculate with (材種 material type, 直径 diameter, and 黒皮/研磨 black skin or ground — three items)** must already be decided.
- Have the **machining conditions** at hand: machining time, coating, whether an inspection certificate is needed, and so on.
- If you plan to use the result in a [price list](/manual/en/operations/sales/price-list/user), register the [product](/manual/en/operations/masters/product/user) first. If no product is set on the estimate, you cannot choose it in the price list.

## Reading the screen

When you open the app, you see a list of the estimates made so far.

![Trial estimate list screen](../../../assets/screenshots/trial-estimate-list-01.png)

- **価格試算番号 (estimate number)** … a number starting with `EST-`. It is added automatically when you save.
- **状態 (status)** … a colored badge shows where the estimate stands. Gray is 「下書き」(draft), blue is 「確定」(confirmed), green is 「価格表登録済」(used in a price list).
- **カスタム (custom)** … an estimate with an orange badge is one where the material price was typed in by hand.
- Type an estimate number, a name, or a customer name in the search box at the top to narrow down the list. You can also narrow it down with「状態」(status) and「工具種」(tool type) on the right.
- Click a row to open the detail screen for that estimate.

## Making an estimate

1. Press「**新規作成**」(New) at the top right of the list screen.
2. At the top of the screen, choose the tool shape from the ones listed there. The standard ones are「**丸棒**」(round bar),「**円筒**」(cylinder) and「**OH付**」(with OH); at some companies other classes are listed as well.
3. Choose the customer in「**見積り先**」(quote for). You can also calculate with this left empty.
4. Choose the product in「**製品**」(product). Be sure to choose one if you will use this in a price list later.
5. Enter the tool sizes in「**最大径 (mm)**」(max diameter) and「**全長 (mm)**」(total length).
6. In the「**素材**」(material) area, choose「**材種**」(material type),「**直径**」(diameter) and「**黒皮/研磨**」(black skin / ground) in that order.
7. Once all three are chosen, the material price is filled in automatically in「**参照単価（¥/1000mm）**」(reference unit price).
8. In the「**加工**」(machining) area, enter the length and kind of the step machining and the neck machining, and the「**加工時間 (分)**」(machining time in minutes).
9. In the「**コート・処理**」(coating and treatment) area, choose「**コート**」(coating),「**ラップ処理**」(lapping) and「**検査成績書**」(inspection certificate).
10. If there is LD machining, turn on「**LD加工あり**」(has LD machining) and enter the position, outer diameter and blade length.
11. Check「**基準数量（本）**」(base quantity in pieces). It starts at 100 pieces.
12. Finally enter a name in「**価格試算名**」(estimate name). This one is required.
13. Press「**保存**」(save) at the top right of the screen.

![New trial estimate form](../../../assets/screenshots/trial-estimate-new-01.png)

Every time you enter something,「**価格試算結果**」(estimate result) near the bottom of the screen is worked out again on the spot.

![Estimate result (cost breakdown and quoted unit price)](../../../assets/screenshots/trial-estimate-new-02.png)

- **原価内訳（1本あたり）(cost breakdown, per piece)** … the breakdown of material cost, step machining cost, machining unit price, coating cost and so on.
- **見積単価（基準）(quoted unit price, base)** … the selling price per piece, shown at the very bottom.

> 💡 The discount for large quantities (the setting that makes each piece cheaper) is not made on this screen. It is made in the [price list](/manual/en/operations/sales/price-list/user). A trial estimate only gives the base price for one piece.

## When you want to change the material price

The reference unit price is normally filled in for you, and you can just use it as it is. Only do the following when you want to type it in yourself, for example when the market price has changed.

1. Press「**単価を編集**」(edit unit price) at the bottom right of the reference unit price.
2. A confirmation screen called「材料単価のカスタム設定」(custom material price setting) appears. Press「**カスタム設定する**」(use a custom setting).
3. Type a number into the reference unit price field.
4. To go back to the automatic value, press「**ポリシー値に戻す**」(return to the policy value).

Open the「**素材価格推移**」(material price history) tab to see, as a graph, how much that material was bought for in the past. You can also click a point on the graph to use the price of that day.

An estimate typed in by hand gets an orange「**カスタム**」(custom) badge.

> ⚠️ If a yellow「**既定価格**」(default price) badge appears on the reference unit price, there are no purchase records for that material yet. The calculation uses the standard price registered on the material type.

## After saving, and confirming

When you save, the estimate is registered as 「**下書き**」(draft) and the detail screen opens. **A saved estimate cannot be edited afterwards.** To change the contents, use "copy and re-estimate", explained below.

To make it usable in a price list, do the following.

1. Press「**…**」(the three-dot button) at the top right of the estimate screen.
2. If you have not chosen a product yet, press「**製品にリンク**」(link to a product), choose the product, and press「**保存**」(save).
3. Press「**…**」again and choose「**確定**」(confirm).

![Trial estimate detail screen with the menu open](../../../assets/screenshots/trial-estimate-detail-03.png)

After confirming, the status changes to「**確定**」(confirmed) and a note saying 「確定済み」(confirmed) appears at the top of the screen. You can now choose this estimate when you make a [price list](/manual/en/operations/sales/price-list/user).

## Looking at a saved estimate

The screen of a saved estimate has five tabs.

![Trial estimate detail screen](../../../assets/screenshots/trial-estimate-detail-01.png)

- **価格試算結果 (estimate result)** … the quoted unit price and the cost breakdown. The prices from the time you saved stay as they are.
- **素材価格推移 (material price history)** … a graph of how the purchase price of that material changed over time.
- **関連 (related)** … the list of price lists that use this estimate.
- **コメント (comments)** … a thread where you can post exchanges about this estimate.
- **履歴 (history)** … the record of who did what, and when.

![Material price history tab](../../../assets/screenshots/trial-estimate-detail-02.png)

## Making a similar estimate (copy and re-estimate)

When you want to calculate again with only small changes, copy it instead of making it again from scratch.

1. Open the estimate you want to start from.
2. From「**…**」at the top right, press「**複製して再価格試算**」(copy and re-estimate).
3. A new input screen opens with the same contents. Change only what you need.
4. Press「**保存**」(save).

「（再価格試算）」(re-estimate) is added to the estimate name automatically, and a new number is given. You can do the same from「**…**」on a row in the list.

## Input fields

Every field on the trial estimate screen. There are many, so they are grouped by **which cost they affect**. The **?** next to a field in the app links straight to its description here.

| Field | Required | What to enter |
|-------|----------|---------------|
| [Quoted for](#field-customer) | Optional | Who the estimate is for |
| [Product](#field-product) | Optional | Which product it is for |
| [Max diameter (mm)](#field-max-diameter) | Required | The product's largest diameter |
| [Length (mm)](#field-length) | Required | The product's length |
| [Material type](#field-material-type) | Required | The material grade used |
| [Diameter](#field-diameter) | Required | The stock diameter |
| [Black/ground](#field-surface-finish) | Required | The stock surface condition |
| [Reference price (¥/1000mm)](#field-reference-price) | Automatic | Material price from purchase history |
| [Material price (manual, ¥/pc)](#field-manual-material-price) | Optional | Price when not using the reference |
| [Black bar (centreless addition)](#field-centerless) | Optional | Extra machining for black bar |
| [Cylinder type](#field-cylinder-type) | Conditional | For cylinder tools |
| [Step length / type](#field-step-machining) | Optional | Step machining length and type |
| [Neck length / type](#field-neck-machining) | Optional | Neck machining length and type |
| [Machining time (min)](#field-machining-time) | Required | Machining time per piece |
| [Coating](#field-coating) | Optional | Coating type |
| [Lapping](#field-lapping) | Optional | Whether lapping is applied |
| [Inspection report](#field-inspection-report) | Optional | Whether a report is supplied |
| [LD machining / area / OD / flute length](#field-ld) | Optional | LD machining conditions |
| [Base quantity (pcs)](#field-base-quantity) | Required | How many pieces the costing assumes |

### Quoted for [#field-customer]

Who the estimate is for. **It can be left empty** — the estimate still calculates, which suits rough costing before a customer is decided.

### Product [#field-product]

Which product the estimate is for. Linking it to a product means that, once confirmed, **it can be chosen as the base-price source on a price list**. A product can have several estimates.

### Max diameter (mm) [#field-max-diameter]

The product's largest diameter. It guides which stock diameter to choose.

### Length (mm) [#field-length]

The product's length. **Material cost is driven by length**, so changing this changes the material cost.

### Material type [#field-material-type]

The material grade used, chosen from the registered manufacturer and grade combinations.

### Diameter [#field-diameter]

The stock diameter. Choose one larger than the product's maximum diameter.

### Black/ground [#field-surface-finish]

The stock surface condition. **Black bar is cheaper but may require a centreless grinding addition.**

### Reference price (¥/1000mm) [#field-reference-price]

The price derived **automatically from purchase history** for that material type, diameter and surface. Where there is no history, the material type's default price is used. The screen shows which history it came from.

### Material price (manual, ¥/pc) [#field-manual-material-price]

Used when you want to set the price yourself instead of the reference — **for special purchases, or material with no history yet.**

### Black bar (centreless addition) [#field-centerless]

Extra machining when black bar is used. Selecting it adds that machining cost.

### Cylinder type [#field-cylinder-type]

Chosen when the tool type is cylinder. The type changes the machining cost.

### Step length / type [#field-step-machining]

The length and type of step machining. Cost comes from the combination. Leave empty if there is none.

### Neck length / type [#field-neck-machining]

The length and type of neck machining. Leave empty if there is none.

### Machining time (min) [#field-machining-time]

Machining time per piece. **The machining cost is calculated from this time**, so enter a value close to the real setup.

### Coating [#field-coating]

The coating type. Choosing one adds its cost.

### Lapping [#field-lapping]

Whether lapping is applied.

### Inspection report [#field-inspection-report]

Whether an inspection report is supplied. Selecting it adds the inspection cost.

### LD machining / area / OD (mm) / flute length (mm) [#field-ld]

The conditions when LD machining applies. Turning on LD machining enables the area, outside diameter and flute length.

### Base quantity (pcs) [#field-base-quantity]

How many pieces the costing assumes. **Cost per piece changes with quantity** because setup is spread across them, so enter the quantity you actually expect.

## Questions and problems

**Q. I cannot edit a saved estimate.**
A. An estimate keeps the prices from the moment it was saved as a record, so it cannot be changed afterwards. Use「**複製して再価格試算**」(copy and re-estimate) to make a new one.

**Q. It says「価格試算名を入力してください」(please enter an estimate name) and I cannot save.**
A. The estimate name is required. Enter a name that will be easy to find later in「価格試算名」(estimate name) at the very bottom of the screen.

**Q. I cannot choose this estimate when I make a price list.**
A. Only **estimates that have a product set and whose status is 確定 (confirmed)** can be chosen in a price list. On the estimate screen, use「**…**」to do「製品にリンク」(link to a product), then「確定」(confirm), in that order.

**Q. It says「下書きの価格試算のみ確定できます」(only draft estimates can be confirmed).**
A. That estimate is already confirmed, or already used in a price list. You do not need to confirm it again.

**Q. It says「価格表で使用済みの価格試算は製品リンクを変更できません」(the product link cannot be changed on an estimate already used in a price list).**
A. An estimate used in a price list (status 「価格表登録済」) cannot be changed. To calculate for a different product, make a new one with「複製して再価格試算」(copy and re-estimate).

**Q. The reference unit price shows「既定価格」(default price). The amount looks different from the real one.**
A. There are no purchase records for that material yet, so the standard price registered on the material type is used. If you know the real price, enter it with「**単価を編集**」(edit unit price).

**Q. I chose 円筒 (cylinder) and the reference unit price field disappeared.**
A. For 円筒 (cylinder), the rule is that you enter the material price yourself in「**素材価格（手入力 ¥/本）**」(material price, entered by hand, ¥ per piece). You can still look at the purchase records for reference on the「素材価格推移」(material price history) tab.

<!-- permissions:start -->
## Permissions required

Using this screen requires the **Price list** (`price_list`) permission.

| What you want to do | Permission needed |
| --- | --- |
| Open the screen, view lists and details | Price list — View |
| Add, change or delete | Price list — Create / Edit / Delete |

Viewing only needs *View*. Where a screen offers adding, changing or deleting, each of those needs its matching permission.

Permissions come through roles. If something is missing, ask an administrator.

For the whole picture see [Permissions and roles](../../../permissions).
<!-- permissions:end -->
