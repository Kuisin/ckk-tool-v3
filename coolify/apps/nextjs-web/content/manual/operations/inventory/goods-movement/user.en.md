---
title: "Manual Stock Movement — User Manual"
description: "The one door for a person to record a stock movement (in / out / transfer) by hand. Each entry creates one stock movement slip."
---
The **one door for a person to record a stock movement by hand** — in, out, or transfer. The operation code is `ST06`.

> ⚠️ This app is currently available **only in the test environment**. The screens and the steps may change before it becomes available for real work.

> This app belongs to … [Production flow](/manual/en/process/production)

## What you can do in this app

- Record 「入庫」(in), 「出庫」(out), or 「移動」(transfer), by choosing a [Movement Type](/manual/en/operations/inventory/movement-types/user) (ST09).
- Enter an item and quantity to create one [Stock Movement](/manual/en/operations/inventory/inventory-movements/user) (ST04) slip on the spot.
- Keep entering several in a row — the movement type, source, and destination you last chose stay selected for the next entry.

**Use this app whenever you need to correct a stock quantity by hand.** The "Move" button in [Inventory Management](/manual/en/operations/inventory/inventory-management/user) (ST01) is a dedicated entry point that only changes location — an actual in or out can only be recorded here.

## Terms used on this page

- **移動タイプ (Movement type)** … the kind of movement — "what is this move for". Choose from what has been registered in [Movement Type](/manual/en/operations/inventory/movement-types/user) (ST09) in advance. It decides which direction — in / out / transfer.
- **出庫元 / 入庫先 (Source / Destination)** … where it decreases from, and where it increases to. Depending on the movement type, one, both, or neither may be required.
- **品目 (Item)** … the product or material being moved.

## Making an entry

1. Choose a 「**移動タイプ**」(movement type). A badge for its direction (in / out / transfer) appears.
2. If that movement type requires it, choose 「**出庫元**」(source — site → storage location → shelf).
3. If that movement type requires it, choose 「**入庫先**」(destination — site → storage location → shelf).
4. Search for and choose 「**品目**」(item). A badge shows whether it's a product or a material.
5. Enter 「**数量**」(quantity). Products accept whole numbers only; materials accept up to 3 decimal places.
6. When receiving a product into stock, optionally enter 「**ロット番号**」(lot number).
7. Add 「**備考**」(notes) if needed.
8. Press 「**登録**」(Register).

If there is a problem with what you entered, a red notice appears on the spot (item not chosen, quantity zero or below, source/destination missing, or — for a transfer — source and destination the same). You cannot register while a notice is showing.

Registering creates one [Stock Movement](/manual/en/operations/inventory/inventory-movements/user) (ST04, cause "手動"/manual) slip with that content. For a "移動" (transfer), the outgoing side is recorded first and the incoming side second (so that if stock is insufficient, the increase doesn't happen alone before the decrease).

Once registered, a green notice and a link to that slip appear. **「移動タイプ」「出庫元」「入庫先」 (movement type, source, destination) stay selected for the next entry** — only 「品目」「数量」「ロット番号」「備考」 (item, quantity, lot number, notes) are cleared. This saves reselecting them when registering many entries in a row with the same movement type.

Using this app requires the inventory permission.

## Frequently asked questions / troubleshooting

**Q. I chose a movement type, but neither source nor destination shows up.**
A. That movement type is configured to need neither. Check or change it in [Movement Type](/manual/en/operations/inventory/movement-types/user) (ST09).

**Q. When I try to register, it says there isn't enough.**
A. The source doesn't have as much of that item as you want to move. Check the actual quantity in [Inventory Management](/manual/en/operations/inventory/inventory-management/user) (ST01) or [Stock Overview](/manual/en/operations/inventory/stock-overview/user) (ST02).

**Q. I want to correct something I registered.**
A. This app has no correction operation. If you made a mistake, register the reverse movement to undo it.

**Q. I want more movement-type choices.**
A. An administrator registers those in [Movement Type](/manual/en/operations/inventory/movement-types/user) (ST09).

<!-- permissions:start -->
## Permissions required

Using this screen requires the **Inventory** (`inventory`) permission.

| What you want to do | Permission needed |
| --- | --- |
| Open the screen, view lists and details | Inventory — View |
| Add, change or delete | Inventory — Create / Edit / Delete |

Viewing only needs *View*. Where a screen offers adding, changing or deleting, each of those needs its matching permission.

Permissions come through roles. If something is missing, ask an administrator.

For the whole picture see [Permissions and roles](../../../permissions).
<!-- permissions:end -->
