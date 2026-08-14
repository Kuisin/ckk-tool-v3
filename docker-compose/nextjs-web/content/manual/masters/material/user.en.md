---
title: "Material — User Manual"
description: "Operation code MS05. A registry for the raw materials (素材) you purchase and stock. A material is a physical bar: a ma…"
screenshots: []
---
Operation code **MS05**. A registry for the raw materials (素材) you purchase and stock. A material is a physical bar: a [material type](/manual/en/masters/material-type/user) combined with a surface finish (黒皮/研磨), diameter, and length. It is used by [material inventory](/manual/en/apps/material-inventory/user) and by material purchasing and receiving.

> This app is currently available **in the development (dev) environment only**. Screens and steps may change before the production release.

## What you can do with this app

- Once registered, a material can be selected in inventory management and material purchase orders.
- The material code is **assembled automatically** from its composition — no manual input needed.

Note that [products](/manual/en/masters/product/user) specify their material as "material type + diameter + length" and are not linked to a specific material code. The material master exists for inventory management.

## How the material code works

A material code has the form `[material type code]-[finish][diameter]-[length]` (e.g. `B01B0001-A083-330`).

- **Material type code** (8 characters) — the parent type. See [Material Type](/manual/en/masters/material-type/user).
- **Surface finish** (one uppercase letter) — e.g. `A` = mill scale (黒皮), `B` = ground (研磨).
- **Diameter** (3 digits) — diameter in mm × 10. E.g. φ8.3 → `083`.
- **Length** (3 digits) — length in mm. E.g. 330mm → `330`.

The finish categories and other components are managed in [Material Numbering (採番構成)](/manual/en/masters/material-numbering/user). Diameter and length component codes are registered automatically when a material is saved.

## Viewing the list

- Columns: **material code / material type / name / diameter / length / finish / status**. Click a row to open the detail page.
- Use the search box to filter by **code or name**.
- You can also filter by **material type / finish / status**.
- Select rows to run **bulk activate / bulk deactivate / bulk delete**.

## Creating a new material

Click "新規作成" (New) at the top right of the list.

1. Search for and select the **material type**. Only converted types (with a code composition) can be chosen.
2. Select the **surface finish**.
3. Enter the **diameter (mm)** (0.1–99.9) and **length (mm)** (1–999). The derived codes are shown below the inputs.
4. Select the **kind**. Only kinds belonging to the parent type's shape are shown (for the standard shape, `A0` is picked automatically).
5. A live preview of the material code is displayed. The **name** is pre-filled as "type name φdiameter×length" (you can overwrite it).
6. Fill in the **unit** (default: 本), **manufacturer model**, **nominal diameter**, and **notes** as needed, then save.

If a material with the same composition (type × finish × diameter × length) already exists, saving fails.

## Detail page

- The summary shows the code composition (type, finish, diameter, length, kind), nominal diameter, manufacturer model, and unit.
- **概要 (Overview)** — names (Japanese / English) and notes.
- **関連 (Related)** — a note about product usage (products do not link to a specific material).
- **履歴 (History)** — change log.

The menu at the top right offers **edit / deactivate / delete**.

## Edit and delete rules

- **The code composition (type, finish, diameter, length, kind) cannot be changed after creation.** Editable fields are name, unit, manufacturer model, nominal diameter, active flag, and notes.
- Materials referenced by purchase orders, receipts, or inventory cannot be deleted — deactivate them instead.

This app requires the **master permission**. New users may also want to read the [Start Manual](/manual/en/start).
