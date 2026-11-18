---
title: "Movement Type — User Manual"
description: "The master data for the \"kind of move\" chosen in Manual Stock Movement. Only the kinds registered here appear as choices there."
---
The master data for the **"kind of move"** chosen in [Manual Stock Movement](/manual/en/operations/inventory/goods-movement/user) (ST06). The operation code is `ST09`.

> ⚠️ This app is currently available **only in the test environment**. The screens and the steps may change before it becomes available for real work.

> This app belongs to … [Production flow](/manual/en/process/production)

## What you can do in this app

- Register and edit the "movement types" selectable in Manual Stock Movement.
- Decide, per type, its direction (in / out / transfer) and whether a source and/or a destination is required.
- Deactivate a type no longer used (it cannot be deleted — see "Why it cannot be deleted" below).

What you register here becomes, directly, the choices for "movement type" in [Manual Stock Movement](/manual/en/operations/inventory/goods-movement/user) (ST06). A change here is reflected there immediately.

## Terms used on this page

- **向き (Direction)** … whether that movement type is "入庫" (in), "出庫" (out), or "移動" (transfer).
- **出庫元要 / 入庫先要 (Source required / Destination required)** … whether choosing this movement type requires entering a source / a destination.

## The list

- **番号 (Code)** … the movement type's code.
- **名称 (Name)** … the movement type's name.
- **向き (Direction)** … a badge for in / out / transfer.
- **出庫元要 / 入庫先要 (Source required / Destination required)** … a ✓ or ✗ icon (these columns can be hidden).
- **表示順 (Sort order)** … the order it appears in the choices on Manual Stock Movement (this column can be hidden).
- **状態 (Status)** … active / inactive.

Filter using the search box, 「**向き**」(direction), and 「**状態**」(status). You can select multiple rows and 「**一括有効化**」(bulk activate) or 「**一括無効化**」(bulk deactivate) (there is no bulk delete).

Click a row, or use its 「**編集**」(Edit) action, to change its content. Use 「**新規**」(New) to register a new one.

## Registering a new one / editing

Pressing 「**新規**」(New) or a row's 「**編集**」(Edit) opens the entry screen.

| Field | Required | What to enter |
|-------|----------|----------------|
| [Code](#field-code) | Required | The movement type's code |
| [Name](#field-name) | Required | The movement type's name |
| [Direction](#field-direction) | Required | In / Out / Transfer |
| [Source required](#field-requires-from) | Optional | Whether to require entering a source |
| [Destination required](#field-requires-to) | Optional | Whether to require entering a destination |
| [Sort order](#field-sort-order) | Optional | The order it appears in the choices |
| [Active/Inactive](#field-is-active) | Optional | Whether it can be used |
| [Notes](#field-notes) | Optional | Supplementary notes |

### Code [#field-code]

The movement type's code. **You can enter it only when creating; it cannot be changed afterward** — records made in Manual Stock Movement point to this code.

### Name [#field-name]

The movement type's name. Japanese is required; other languages can be entered via "多言語" (Translations).

### Direction [#field-direction]

Either "入庫" (in), "出庫" (out), or "移動" (transfer). The Manual Stock Movement screen shows a badge matching the direction you chose.

### Source required [#field-requires-from]

Turning this on makes entering a source required whenever this movement type is chosen. **If the direction is "出庫" (out) or "移動" (transfer), turning it off is blocked when saving** — those directions cannot do without a source.

### Destination required [#field-requires-to]

Turning this on makes entering a destination required whenever this movement type is chosen. **If the direction is "入庫" (in) or "移動" (transfer), turning it off is blocked when saving** — those directions cannot do without a destination.

### Sort order [#field-sort-order]

The order it appears in the choices on Manual Stock Movement. A smaller number appears higher.

### Active/Inactive [#field-is-active]

Deactivating removes it from the choices on Manual Stock Movement, but does not affect past records.

### Notes [#field-notes]

Supplementary notes about this movement type.

## Why it cannot be deleted

**A movement type has no delete operation.** Once a movement type has ever been used, its records (stock movement slips) point to it, so deleting it would leave those records unable to say what they were. Once you stop using one, set it to 「**無効**」(inactive) instead. Deactivating leaves all previously registered records untouched.

Using this app requires the inventory permission.

## Frequently asked questions / troubleshooting

**Q. I want to change the code, but the field can't be pressed.**
A. The code cannot be changed after creation — Manual Stock Movement records are linked by this code. To use a different code, register a new one and deactivate the old one.

**Q. I turned off "Source required", and it wouldn't save.**
A. That movement type's direction (out / transfer) always requires a source. It cannot be turned off.

**Q. A movement type I deactivated still shows as a choice in Manual Stock Movement.**
A. It shouldn't. Reopen (reload) the Manual Stock Movement screen and check again.

**Q. I want to delete a movement type, but there's no button for it.**
A. Movement types have no delete operation. See "Why it cannot be deleted" above, and deactivate it instead.

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
