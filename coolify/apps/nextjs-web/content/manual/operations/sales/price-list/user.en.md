---
title: "Price List — User Manual"
description: "A register where you record the price of each product for each customer. The amounts on a quote come from here automatically."
screenshots: [price-list-list-01, price-list-new-01, price-list-detail-01, price-list-edit-01, price-list-discounts-01, price-list-quote-01]
---
A register where you record "this [product](/manual/en/operations/masters/product/user) costs this much" for each customer. The operation code is `SA02`.

## What you can do with this app

- You can record the selling price of a product for each [customer](/manual/en/operations/masters/business-partner/user).
- Once recorded, the amounts on a [quote](/manual/en/operations/sales/quote/user) **fill in automatically** (you never have to type an amount on the quote screen).
- On an [order acceptance](/manual/en/operations/sales/order-acceptance/user), the unit price on the customer's order form is **compared with the price here automatically**, and you are told if they differ.
- You can set prices per quantity, so that **each piece becomes cheaper when the customer buys more**.
- You can record a campaign discount that only runs for a set period.
- You can make a quote straight from this price list.

Register a price here when you and the customer have agreed a price. From then on, changing this changes the amounts on quotes too.

## Words used on this page

- **価格表 (price list)** … one record is "one customer × one product". You can only make one record for the same combination.
- **注文種別 (order type)** … the classes **本番 (production) / テスト (test) / サンプル (sample) / その他 (other)**. The same product can have a different price in each class.
- **基準単価 (base unit price)** … the basic price for that order type. Normally it comes from the result of a [trial estimate](/manual/en/operations/sales/trial-estimate/user).
- **段階（数量段階）(quantity tier)** … a break by quantity, such as "1–49 pieces cost this much, 50–99 pieces cost this much".
- **倍率 (multiplier)** … the number the base unit price is multiplied by. Below 1 makes it cheaper.
- **値引きルール (discount rule)** … a discount that is taken off automatically when you make a quote, if the period and the number of pieces match the conditions you set.

## Before you start

- The [customer](/manual/en/operations/masters/business-partner/user) and the [product](/manual/en/operations/masters/product/user) must already be registered.
- It helps to have a [trial estimate](/manual/en/operations/sales/trial-estimate/user) to base the price on. If you set a product on the estimate and set it to 確定 (confirmed), you can choose it on this screen and the amount fills in automatically.
- You can still register a price list without an estimate by typing the price in by hand.

## Reading the screen

When you open the app, the registered price lists are shown as a list. One row is one "customer × product".

![Price list screen](../../../assets/screenshots/price-list-list-01.png)

- **注文種別 (order type)** … the classes registered on that price list, shown as badges.
- **段階 (tiers)** … how many quantity breaks there are.
- **単価 (unit price)** … the range from the cheapest price to the most expensive one.
- **値引き (discount)** … the number on the pink badge is how many discount rules can be used.
- **価格試算元 (source estimate)** … which estimate the price was taken from. 「手動」(manual) means it was typed in by hand.
- **状態 (status)** … 「有効」(active) or 「無効」(inactive) shows whether it can be used.
- Click a row to open the detail screen.

## Making a price list

1. Press「**新規作成**」(New) at the top right of the list screen.
2. Click the「**顧客**」(customer) field and choose the customer.
3. Click the「**製品**」(product) field and choose the product.
4. Choose a class in「**注文種別**」(order type). It starts at 「本番」(production).
5. Click the「**価格ソース（価格試算）**」(price source, estimate) field and choose the estimate to base the price on. The amount then fills in automatically in「**基準単価**」(base unit price).
6. Choose「**有効開始日**」(valid from).
7. For テスト (test) and サンプル (sample), you must also choose「**有効終了日**」(valid until).
8. In the quantity table, enter「**最小数量**」(minimum quantity),「**最大数量**」(maximum quantity) and「**倍率**」(multiplier).
9. To add another break, press「**段階を追加**」(add tier).
10. To register a price for another class too, press「**注文種別を追加**」(add order type) and repeat steps 5 to 9.
11. Press「**保存**」(save).

![New price list form](../../../assets/screenshots/price-list-new-01.png)

When you enter a multiplier, the amount appears on the spot in「**自動計算単価**」(automatically calculated price) and「**採用単価**」(price used), so you can check as you go.

> 💡 Set the quantity breaks like this: "1–49 pieces at multiplier 1.05, 50–99 at 1.00, 100 and above at 0.95". This is how you make each piece cheaper the more the customer buys.

> ⚠️ If you see「この製品にリンクされた確定済みの価格試算はありません」(there is no confirmed estimate linked to this product), no estimate for that product has been confirmed yet. If you want to use an estimate, first set the product on the [trial estimate](/manual/en/operations/sales/trial-estimate/user) and confirm it. If you do not want to use an estimate, tick「**カスタム単価を使用**」(use a custom price) and type the base unit price in by hand.

## Looking at what you registered

The price list screen has five tabs.

![Price list detail screen](../../../assets/screenshots/price-list-detail-01.png)

- **価格設定 (price settings)** … the base unit price, the valid period, and the price per quantity, for each order type.
- **値引き設定 (discount settings)** … the list of discount rules.
- **関連 (related)** … which estimate the price came from, and the quotes made from this price list.
- **コメント (comments)** … a thread where you can post exchanges about this price list.
- **履歴 (history)** … the record of who changed what, and when.

In the quantity table, a row with an orange「**手動**」(manual) badge uses a price typed in by hand instead of the one worked out from the multiplier.

## Changing a price

1. Press「**編集**」(edit) at the top right of the price list screen.
2. Change what you need — the base unit price, the valid period, or the quantity tiers.
3. Press「**保存**」(save).

![Price list edit screen](../../../assets/screenshots/price-list-edit-01.png)

- **The customer and the product cannot be changed after the record is made.** If you need a different combination, make a new record.
- A saved order type, and the estimate its price came from, also cannot be changed.
- To give one quantity break a special price, tick「**カスタム単価**」(custom price) on that row and enter the amount. A confirmation screen appears — press「**カスタム設定する**」(use a custom setting).

## Registering a discount rule

1. Open the「**値引き設定**」(discount settings) tab on the price list screen.
2. Press「**値引きルールを追加**」(add discount rule) to the right of the order type you want the discount on.
3. Enter a name you will recognise later in「**名称**」(name) — for example, a summer campaign.
4. In「**値引き種別**」(discount type), choose「**率（%）**」(rate, %) or「**金額（¥/本）**」(amount, ¥ per piece).
5. Enter the discount number.
6. Use「**数量下限**」(minimum quantity) and「**数量上限**」(maximum quantity) to decide from how many pieces it applies. Leave the maximum empty for no upper limit.
7. Choose「**有効開始日**」(valid from). Leave the end date empty for no time limit.
8. Press「**追加**」(add).

![Discount settings tab](../../../assets/screenshots/price-list-discounts-01.png)

A registered discount is taken off automatically when you make a quote, as long as the conditions (period and number of pieces) match. When several rules match, the one with the largest discount is used.

To change a rule press the pencil mark, and to remove it press the bin mark.

## Making a quote from this price list

1. Press「**…**」(the three-dot button) at the top right of the price list screen.
2. Choose「**見積書を作成**」(create a quote).
3. Enter「**注文種別**」(order type) and「**数量**」(quantity). The unit price and the discount are shown automatically.
4. Enter「**納期**」(delivery date) if you need it.
5. Press「**見積書を作成（下書き）**」(create the quote as a draft).

![Screen for creating a quote](../../../assets/screenshots/price-list-quote-01.png)

The [quote](/manual/en/operations/sales/quote/user) creation screen opens with the contents already filled in. You can do the same from「**…**」on a row in the list.

## Other things you can do

From「**…**」at the top right of the price list screen, you can also do the following.

- **有効期間を変更 (change the valid period)** … keeps the prices and moves them to a new period.
- **別の顧客・製品へコピー (copy to another customer or product)** … copies the same price settings to another customer or product. The link to the estimate is dropped, and the copy is treated as typed in by hand.
- **削除 (delete)** … deletes that price list. This cannot be undone.

In the list, you can also tick the checkboxes on the left of several rows and then use「**有効化**」(activate),「**無効化**」(deactivate) or「**一括削除**」(delete all selected).

## Input fields

Every field on the price list screen. The **?** next to a field in the app links straight to its description here.

| Field | Required | What to enter |
|-------|----------|---------------|
| [Customer](#field-customer) | Required | Who the price is for |
| [Product](#field-product) | Required | Which product the price is for |
| [Active (whole list)](#field-active) | — | Whether this price list is in use |
| [Order type](#field-order-type) | Required | Production, test and so on |
| [Price source (trial estimate)](#field-estimate) | Optional | The estimate the base price comes from |
| [Base price](#field-base-price) | Required | The price the quantity tiers work from |
| [Valid from](#field-valid-from) | Required | When this price starts to apply |
| [Valid until](#field-valid-until) | Optional | When it stops applying |
| [Multiplier](#field-multiplier) | Required | The factor for each quantity tier |
| [Custom price](#field-custom-price) | Optional | Set a tier's price by hand |

### Customer [#field-customer]

Who the price is for. **One price list covers one customer and one product**, and this cannot be changed after creation — recreate the list if it is wrong.

### Product [#field-product]

Which product the price is for. Like the customer, it cannot be changed after creation.

### Active (whole list) [#field-active]

A field for marking a price list you no longer use as 「無効」(inactive), to keep things tidy. Turning it off does not, at present, affect how quotes work out their unit prices.

### Order type [#field-order-type]

Production, test, sample or other. **The same customer and product can hold a different price per type.** For samples, the practice is to set the unit price to zero yourself (it does not become zero automatically).

### Price source (trial estimate) [#field-estimate]

The trial estimate the base price comes from. **Only confirmed estimates can be chosen.** Choosing one copies its quoted unit price into the base price and locks that estimate as registered, so past prices cannot change afterwards. Leave it unset to enter the price by hand.

### Base price [#field-base-price]

The price the quantity tiers work from. Each tier's price is this price times its multiplier.

### Valid from [#field-valid-from]

A date recording when you started using this price. Quote unit prices do not switch over on this date. What does start and stop automatically by period is the discount rules (each rule's own valid period).

### Valid until [#field-valid-until]

When it stops applying. Leave it empty for no end date. **Test and sample prices are normally given an end date.**

### Multiplier [#field-multiplier]

The factor for each quantity range. Use a value below 1 where buying more should cost less per piece.

### Custom price [#field-custom-price]

Sets one tier's price by hand. When set, it takes precedence over the multiplier calculation.

## Questions and problems

**Q. It says「同一の顧客・製品の価格表が既に存在します。既存の価格表を編集してください。」(a price list for the same customer and product already exists; please edit the existing one).**
A. A price list for that customer and that product already exists. Do not make a new one — open the existing price list and add the order type or the price from「編集」(edit). The creation screen also shows a red note and a link to the existing price list when there is a duplicate.

**Q. The customer and product fields are gray and I cannot choose anything.**
A. On an existing price list, the rule is that the customer and the product cannot be changed. If you need a different combination, make a new record from the list.

**Q. When I try to save, it says「テスト・サンプルは有効終了日が必須です」(test and sample need a valid-until date).**
A. Prices for テスト (test) and サンプル (sample) always need an end date. Choose「有効終了日」(valid until) and save again.

**Q. I cannot type a number into the base unit price field.**
A. When the price is taken from an estimate, the rule is that the base unit price stays as the amount from the estimate. To use a different amount, tick「**カスタム単価を使用**」(use a custom price). A confirmation screen appears.

**Q. On a quote it says「この数量に該当する価格段階がありません」(there is no price tier for this quantity).**
A. The price list has no quantity break that covers the number of pieces you entered. From「編集」(edit), add a tier that includes that number. Leaving「最大数量」(maximum quantity) empty on the top tier means no upper limit.

**Q. I changed the price list, but the amount on a quote I made earlier did not change.**
A. A quote keeps the amounts from the time it was made. To use the new amount, open that [quote](/manual/en/operations/sales/quote/user) and do「編集」(edit) →「保存」(save). The amounts are then filled in again from the price list as it is now.
