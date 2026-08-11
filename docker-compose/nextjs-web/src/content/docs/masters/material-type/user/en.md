# Material Type — User Manual

Operation code **MS04**. A registry for managing material types (材種) — the kinds of raw material you use. [Products](/docs/masters/product/user), [material](/docs/masters/material/user) registration, and material-cost calculation in [trial estimates](/docs/apps/trial-estimate/user) all use the material types registered here.

## What you can do with this app

Manage "which manufacturer, which grade, and what shape of material" via the **material type code**.

- Once registered, a material type can be selected in products, materials, and trial estimates.
- Each material type can hold **default unit prices** (the fallback material price for trial estimates).

## How the material type code works

A material type code is 8 characters made of 4 parts (e.g. `B01B0001`).

- **Manufacturer** (1st character, one uppercase letter) — the material maker, e.g. `B` = AFC.
- **Manufacturer grade** (2nd–3rd characters, 2 digits) — the grade within that maker, e.g. `01` = K10UF.
- **Shape** (4th character, one uppercase letter) — e.g. `A` = standard, `B` = OH, `C` = cylinder.
- **Kind** (5th–8th characters, 4 digits) — a serial number within the same manufacturer × grade × shape. **Assigned automatically on save.**

The choices themselves (manufacturers, shapes, etc.) are managed in [Material Numbering (採番構成)](/docs/masters/material-numbering/user).

## Viewing the list

- Columns: **material type code / name / manufacturer / shape / status / updated**. Click a row to open the detail page.
- Use the search box to filter by **code or name**.
- You can also filter by **conversion status** (converted / unconverted) and **status** (active / inactive).
- Select rows to run **bulk activate / bulk deactivate / bulk delete**.

"Unconverted" rows were imported from the legacy system and have no code composition yet. You can edit their names, but they cannot be used as the parent of a material.

## Creating a new material type

Click "新規作成" (New) at the top right of the list.

1. Select the **manufacturer**.
2. Select the **manufacturer grade** (only grades of the chosen maker are shown).
3. Select the **shape**. A preview of the material type code appears (`####` = the kind, auto-numbered on save).
4. Enter the **name** (Japanese required, English optional), **description**, and **active** flag, then save.

## Detail page

- **概要 (Overview)** — descriptions (Japanese / English).
- **既定単価 (Default prices)** — enter default material prices (¥/1000mm) per diameter × surface finish in a grid. When there is no purchase history, [trial estimates](/docs/apps/trial-estimate/user) fall back to these prices. Empty cells mean "no price".
- **関連 (Related)** — the materials belonging to this type. Click to jump to the material detail.
- **履歴 (History)** — change log (who updated what, when).

The menu at the top right offers **edit / deactivate / delete**.

## Edit and delete rules

- **The code composition (manufacturer, grade, shape, kind) cannot be changed after creation.** Only name, description, and active flag are editable.
- A material type **cannot be deleted** while materials still reference it — deactivate it instead.
- Deactivated types no longer appear in new selections, but existing data is kept.

This app requires the **master permission**. New users may also want to read the [Start Manual](/docs/start).
