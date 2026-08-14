---
title: "Trial Estimate — User Manual"
description: "Operation code SA05. Calculates a quoted unit price from costs and serves as the base-price source for price lists."
screenshots: [trial-estimate-list-01, trial-estimate-new-01, trial-estimate-detail-01]
---
Operation code **SA05**. Calculates a quoted unit price from costs and serves as the base-price source for price lists.

## What you can do here

Automatically calculates "how much to sell this [product](/manual/en/masters/product/user) for" from **costs** such as material, machining, and coating. A trial estimate can optionally be linked to a product (multiple per product allowed), and a **confirmed estimate** becomes the **base-price source** when creating a price list (customer × product).

- **Material cost** fills in automatically from the purchase history (reference price, ¥/1000mm) for the "**material type × diameter × black-skin/polished**" combination. When there is no purchase history, the **default price (¥/1000mm)** registered on the material type is used.
- As you enter dimensions and machining conditions, the **trial result** (cost breakdown and quoted unit price) at the bottom of the screen recalculates on the fly.
- Quantity-based price scaling (quantity tiers) is not handled here — the trial estimate produces a **single base unit price**, and quantity tiers are configured with multipliers on the [price list](/manual/en/apps/price-list/user).

![Trial estimate list](../../assets/screenshots/trial-estimate-list-01.png)

## Creating a new estimate

1. Click **New** at the top right of the list.
2. Choose the **tool type** (built-ins are Round bar / Cylinder / OH — 3 types; tool types added by an administrator in [Trial Pricing (SY02)](/manual/en/apps/trial-estimate/settings) also appear here). The input fields change with the tool type.
3. Choose the **customer** and optionally a **product**. Linking to a product and confirming makes this estimate selectable as a base-price source when creating a price list.
4. Choose the material's **material type, diameter, and black-skin/polished**. Once all three are set, the **reference price (¥/1000mm)** fills in automatically from purchase history for that combination (or the material type's default price — shown with a "default price" badge). Only the Cylinder type takes a manually entered material price.
5. Enter dimensions and machining conditions (max diameter, total length, step machining, neck machining, coating, lapping, inspection report, LD, machining time, etc.). Fill in any **custom fields** added by an administrator.
6. Enter the **base quantity** (default 100; used only to prorate the shape-out / spare-shape cost).
7. Finally enter the **estimate name** (required) and click **Save**.

![New trial estimate form (basic and material sections)](../../assets/screenshots/trial-estimate-new-01.png)

The **trial result** below (per-piece cost breakdown, minimum price, and base quoted unit price) recalculates as you type.

## Overriding the reference price

- By default, the reference price computed from the purchase history of the material combination is used. When there is no purchase history, the material type's default price (¥/1000mm) fills in and a **default price** badge is shown.
- To set the price manually, click **Edit price**. After the confirmation, the field becomes editable and the estimate is recorded as **custom** (badge shown in the list and detail). "Reset to policy value" restores the automatic value at any time.
- On the **Material price history** tab you can inspect purchase history on a chart and pick a point to adopt that price (also treated as custom).

## Saving, confirming, and use in price lists

- **Save** registers the estimate as a draft (DRAFT) and snapshots the price at that moment (changing the calculation settings later never re-prices it). A saved estimate cannot be edited — use **Duplicate & recalculate** to change it.
- **Confirm** from the detail menu makes the estimate selectable as a **base-price source** when creating or editing a price list (SA01). **It must be linked to a product** (the link can also be set from the "Link to product" menu item).
- When first used by a price list it locks as **REGISTERED** and the product link can no longer be changed (recalculate via Duplicate & recalculate). A registered estimate can still be chosen as the source for another customer's price list.

![Trial estimate detail (registered)](../../assets/screenshots/trial-estimate-detail-01.png)

## List & search

- The list shows estimate number / name / customer / tool type / material type / representative quoted price / status / updated date. Search by number, name, or customer; filter by status and tool type.
- Click a row for details (trial result, material price history, related, history). The row menu offers **Duplicate & recalculate**.
- Statuses: **Draft** (gray) → **Confirmed** (blue) → **Registered** (green).
