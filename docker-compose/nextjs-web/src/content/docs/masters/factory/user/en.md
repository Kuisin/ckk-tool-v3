# Factory — User Manual

Operation code **MS0B**. A registry for the factories (工場) that serve as your manufacturing, inventory, and shipping locations. [Product inventory](/docs/apps/product-inventory/user) and [material inventory](/docs/apps/material-inventory/user) are managed per factory, and receiving destinations for materials are chosen from the factories registered here.

> This app is currently available **in the development (dev) environment only**. Screens and steps may change before the production release.

## What you can do with this app

- Register a factory's basic information (code, name, address, contacts).
- Check a per-factory inventory summary (product and material stock).

## Viewing the list

- Columns: **code / name / country / status / updated**. Click a row to open the detail page.
- Use the search box to filter by **code or name**. You can also filter by **status** (active / inactive).
- Select rows to run **bulk activate / bulk deactivate / bulk delete**.

## Creating a new factory

Click "新規作成" (New) at the top right of the list.

**Basic information**

- **Factory code** — enter a unique code identifying the factory (e.g. `F01`). **It cannot be changed after creation.**
- **Name** (Japanese required, English optional) / **kana reading**.
- **Active** — turn off to remove the factory from selections (past data is kept).
- **Notes**.

**Contact and address**

- **Country** (default: Japan) / **postal code** / **address** (Japanese / English).
- **Phone** / **email** / **contact person**.

## Detail page

- The summary shows the code, names, country, address, and contact details.
- **概要 (Overview)** — notes.
- **関連 (Related)** — this factory's **product inventory** and **material inventory** summary (counts plus the 10 most recently updated rows). Click a row to open the inventory detail, or use the links to the inventory lists.
- **履歴 (History)** — change log (who updated what, when).

The menu at the top right offers **edit / deactivate / delete**.

## Edit and delete rules

- **The factory code cannot be changed after creation.** All other fields are editable.
- A factory referenced by inventory or other records may not be deletable. Deactivate factories that are no longer in use.

This app requires the **master permission**. New users may also want to read the [Start Manual](/docs/start).
