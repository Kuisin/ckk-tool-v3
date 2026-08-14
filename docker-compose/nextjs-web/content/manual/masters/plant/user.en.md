---
title: "Plant — User Manual"
description: "Operation code MS0B. A registry for the plants (拠点) that serve as your manufacturing, inventory, and shipping locatio…"
screenshots: []
---
Operation code **MS0B**. A registry for the plants (拠点) that serve as your manufacturing, inventory, and shipping locations. [Product inventory](/manual/en/apps/product-inventory/user) and [material inventory](/manual/en/apps/material-inventory/user) are managed per plant, and receiving destinations for materials are chosen from the plants registered here.

> This app is currently available **in the development (dev) environment only**. Screens and steps may change before the production release.

## What you can do with this app

- Register a plant's basic information (code, name, address, contacts).
- Check a per-plant inventory summary (product and material stock).

## Viewing the list

- Columns: **code / name / country / status / updated**. Click a row to open the detail page.
- Use the search box to filter by **code or name**. You can also filter by **status** (active / inactive).
- Select rows to run **bulk activate / bulk deactivate / bulk delete**.

## Creating a new plant

Click "新規作成" (New) at the top right of the list.

**Basic information**

- **Plant code** — enter a unique code identifying the plant (e.g. `F01`). **It cannot be changed after creation.**
- **Name** (Japanese required, English optional) / **kana reading**.
- **Active** — turn off to remove the plant from selections (past data is kept).
- **Notes**.

**Contact and address**

- **Country** (default: Japan) / **postal code** / **address** (Japanese / English).
- **Phone** / **email** / **contact person**.

## Detail page

- The summary shows the code, names, country, address, and contact details.
- **概要 (Overview)** — notes.
- **関連 (Related)** — this plant's **product inventory** and **material inventory** summary (counts plus the 10 most recently updated rows). Click a row to open the inventory detail, or use the links to the inventory lists.
- **履歴 (History)** — change log (who updated what, when).

The menu at the top right offers **edit / deactivate / delete**.

## Edit and delete rules

- **The plant code cannot be changed after creation.** All other fields are editable.
- A plant referenced by inventory or other records may not be deletable. Deactivate plants that are no longer in use.

This app requires the **master permission**. New users may also want to read the [Start Manual](/manual/en/start).
