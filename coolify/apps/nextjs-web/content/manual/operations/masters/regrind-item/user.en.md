---
title: "Regrind items — user guide"
description: "Where regrinding itself is registered as an item, so the price has somewhere to live."
---
This app registers **the regrinding itself** as an item, and the price is put on it. Its operation code is `MS0H`.

> ⚠️ This app is currently available **only in the test environment**. The screens and the steps may change before it becomes available for real work.

It replaces the old FileMaker 再研マスタ (regrind master). That table priced one row per **material × ground area × flutes × size band** combination, and this screen works the same way — **one row per combination**.

## What you can do here

- Register regrinding as an item and give it a **standard price** (a list price that applies to every customer).
- Record the conditions the price depends on — tool class, ground area, flutes, size band.
- Filter by tool class, ground area and status to find the row you want.
- Disable rows that are no longer used.

## What you sell and what you hold are two different things

A regrind job points at **two items**. They are easy to mix up, so separate them first.

| | Where it is registered | What it is |
|---|---|---|
| **Regrind item** | This screen (`MS0H`) | The **service you sell**. This is what carries a price |
| **Tool to regrind** | [Products](/manual/en/operations/masters/product/user) (`MS04`) | The **actual tool you take in, work on and return**. Usually an external product |

The tool is not something you sell, so it has no price and no [price list](/manual/en/operations/sales/price-list/user). That means **you do not need a price per tool part number** — the price lives on the row in this screen.

## Words on this page

- **工具の種類 (tool class)** … Write it at the level where the price splits (e.g. `超硬ヘリカルエンドミル`, carbide helical end mill).
- **加工箇所 (ground area)** … Which part you grind (e.g. `外周 + 溝`, periphery + flute).
- **刃数 (flutes)** … The number of flutes. **Leaving it empty means "the price does not depend on the flute count"**.
- **サイズ帯 (size band)** … The diameter range. Read it as **above the lower bound, up to and including the upper bound** (`φ6 超 10 以下`).
- **標準価格 (standard price)** … A list price that applies to every customer.

> 💡 These conditions are **free text fields** — there is no master list behind them. They are there so a person can read a row and recognise it; **the system never matches a row from the conditions automatically**. A person picks the row.

## The price is decided in two steps

1. The **standard price** on this screen (the list price, same for every customer)
2. The customer's **price list**

**When a price list applies, the price list wins.** The standard price is used only when no price list applies — none exists, it has been disabled, or the date is outside its valid period.

> ⚠️ **It does not fall back to the standard price when a live price list simply has no quantity tier for that quantity.** The price list is in force and only that one tier is missing. Filling the gap quietly with the list price would hide the configuration mistake, so the unit price stays unresolved instead. Fix the quantity tiers on the price list.

Leave the standard price empty and the list shows 「**価格表のみ**」 (price list only). That means the item is sold **only to customers who have a price list**.

## Registering one

1. Press 「**新規作成**」 (New) at the top right.
2. Fill in 「**名称**」 (name). Required.
3. Fill in 「**工具の種類**」 (tool class) and 「**加工箇所**」 (ground area), at the level where the price splits.
4. Fill in 「**刃数**」 (flutes). Leave it empty if the price does not depend on the flute count.
5. Fill in 「**サイズ下限**」 and 「**サイズ上限**」 (lower / upper size bound, mm). One side alone is fine.
6. Fill in 「**標準価格**」 (standard price) and 「**単位**」 (unit). The unit is required and starts as 本 (pcs).
7. Add keywords and notes if you want, then press Save.

> ⚠️ **The upper bound must be larger than the lower bound.** Enter them the wrong way round and you get 「サイズ上限はサイズ下限より大きくしてください」 (the upper size bound must be larger than the lower one) and it will not save. If it saved reversed, you would quietly create **a band no tool can ever fall into**.

> 💡 **The code is numbered automatically when you save** (`RGD-YYYYMM-NNNN`). There is no code field. This master runs to hundreds of rows, so nobody is asked to invent a code — rows are told apart by their conditions and their price. **Once numbered, the code cannot be changed.**

## Reading the list

The list shows **code / name / tool class / ground area / flutes / size band / standard price / status**. You choose a row by its **conditions and its price**, not by its name, so the condition columns are shown as they are.

The filters at the top are tool class, ground area and status. Their options are built from **the values actually registered**. The search box covers code, name, tool class and ground area.

> 💡 **There is no detail page for this screen.** Clicking a row opens the edit dialog directly (the same build as the charge items master).

## Changing a price

Changing a price **does not move documents that are already written**. The unit price on a quote or an order acceptance line was written into the line when it was saved.

The normal way to do it:

1. **Disable** the old row. It can no longer be chosen on new lines.
2. **Add** a new row with the new price.

That way "what it cost, from when" stays readable as rows.

## When it will not delete

**An item used by an order line, a quote or a price list cannot be deleted.** You get the counts, e.g. 「使用中のため削除できません（注文明細 3 件 / 見積 1 件 / 価格表 2 件）」 (cannot delete, in use: 3 order lines / 1 quote / 2 price lists).

**Disable** it instead. It can no longer be chosen on new lines, but **the lines already written stay as they are**.

## How it is used on an order acceptance

Set 「注文種別」 (order type) to 再研磨 (regrind) on an [order acceptance](/manual/en/operations/sales/order-acceptance/user) line and the item field switches to the rows on this screen, with a 「**研ぎ直す工具**」 (tool to regrind) field added below it.

- The upper field (regrind item) … the service you sell. **This is where the price comes from.**
- The lower field (tool to regrind) … the tool you hold. Chosen from [products](/manual/en/operations/masters/product/user), external products included. **Required before the line can be confirmed.**

Without the tool the customer-owned stock cannot be counted and no [work order](/manual/en/operations/production/work-order/user) can be made.

## Questions

**Q. If I fix a price, do past quotes and order acceptances change?**
A. No. The unit price is written into the line when the document is saved.

**Q. The same tool costs different amounts for periphery only and periphery + flute.**
A. **Register them as two rows** — one row per ground area. The old 再研マスタ counted them the same way.

**Q. The price does not depend on the flute count.**
A. Leave 「刃数」 empty. Empty means the price does not depend on the flute count.

**Q. The price differs per customer.**
A. Make a [price list](/manual/en/operations/sales/price-list/user) for that customer. When a price list exists it wins over the standard price.

**Q. I got the code wrong.**
A. The code is numbered automatically and cannot be changed. Disable the row and create a new one.

**Q. Do I register the tool to regrind here too?**
A. No. Tools go in [Products](/manual/en/operations/masters/product/user) (`MS04`). A tool made by another maker is registered as an external product.

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
