---
title: "Tax categories — user guide"
description: "Where the consumption tax categories (standard 10% / reduced 8% / exempt) and the date each rate starts are kept."
---
This app holds the consumption tax **categories** and their **rates**. Its operation code is `MS0F`.

[Products](/manual/en/operations/masters/product/user) and [business partners](/manual/en/operations/masters/business-partner/user) point at these categories, and the tax on a [quote](/manual/en/operations/sales/quote/user), a [delivery note](/manual/en/operations/shipping/delivery-note/user) and an [invoice](/manual/en/operations/billing/invoice/user) is decided from them.

Three categories are there from the start — 課税 (taxable, 10%), 軽減税率 (reduced, 8%) and 非課税 (exempt, 0%) — so **you normally leave this alone**. You come here when a rate changes, or when you need a category of your own.

## What you can do here

- Add, edit and delete tax categories.
- Keep a **history of rates** per category, so "what rate, from when" can be entered in advance.
- Choose the **default category** used when neither the product nor the business partner names one.

## Words on this page

- **税区分 (tax category)** … How consumption tax is treated — taxable, reduced, exempt and so on.
- **税率 (tax rate)** … The percentage for that category. Enter it as a percentage (10 means 10%).
- **適用開始日 (effective from)** … The day the rate starts. **There is no end date** — a rate runs until the day before the next one starts.
- **既定の税区分 (default tax category)** … Used when neither the product nor the business partner sets one. **Only one** can be the default.

## Which category is used

When working out the tax, the system decides in this order:

1. The **business partner's** tax category, if it is set
2. If the partner is left empty (follow the product), the **product's** tax category
3. If both are empty, the **default** category

> 💡 The partner comes first because a tax-exempt partner has to be billed at 0% whatever the product says. The flip side is that **a tax-exempt partner gets 0% even on a reduced-rate product**.

## Changing a rate

When the tax law changes, **add a new rate to the category** — do not delete the current row.

1. Press 「**税率を追加**」 (Add tax rate) on the category.
2. Put the day the new rate starts in 「**適用開始日**」 (Effective from).
3. Put the new percentage in 「**税率（%）**」 (Tax rate (%)) — 10 means 10%.
4. Press Create.

Enter it with a future date and the current rate keeps being used until that day arrives. The row in force is marked 「**現在の税率**」 (current tax rate) in the list.

> ⚠️ **Take care when adding a rate that starts in the past.** Documents that are not yet final (draft quotes, a delivery note PDF you regenerate) change their rate back to that date. The screen warns you. **Issued invoices, quotes and delivery notes do not move** — their rate was written into each line when the document was made.

## Adding a category

1. Press 「**税区分を追加**」 (Add tax category).
2. Fill in 「**コード**」 (code, letters and digits) and 「**名称**」 (name).
3. 「**帳票の区分表示**」 (label on documents) can stay empty — left empty it is built from the rate, e.g. "10%".
4. After creating it, add **at least one rate**. Without a rate the tax cannot be worked out.

## When it will not delete

The screen tells you why:

- **A category already in use** … Products, business partners or issued documents point at it. To stop using it, switch 「**有効**」 (enabled) off instead. Products and documents already pointing at it keep working.
- **The default category** … Make another category the default first.
- **The last remaining rate** … Without a rate that category cannot be calculated. Add another rate first.

## Questions

**Q. If I fix a rate, do past invoices change?**
A. No. The rate is written into each line when the document is made. Changing the setting afterwards does not move an issued invoice, quote or delivery note.

**Q. Which date's rate is used?**
A. The **order date**. Even for a closing that spans the day a rate changes, the rate at the time the order was taken is used. With no order date it falls back to the shipping date, then to the closing date.

**Q. I have a product on the reduced rate.**
A. Choose 軽減税率 in the [product's](/manual/en/operations/masters/product/user) tax category, and leave the business partner empty (follow the product).

**Q. I have a tax-exempt business partner.**
A. Choose 非課税 in the [business partner's](/manual/en/operations/masters/business-partner/user) tax category. Their documents come out at 0% whatever the product says.

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
