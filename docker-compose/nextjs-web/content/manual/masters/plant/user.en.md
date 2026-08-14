---
title: "Plant — User Manual"
description: "Operation code MS0C. A registry for the plants (拠点) that serve as your manufacturing, inventory, and shipping locations. Besides basic information, it manages the regions that group plants and the floor maps (drawings)."
screenshots: [master-plant-list-01, master-plant-regions-01]
---
Operation code **MS0C**. A registry for the plants (拠点) that serve as your manufacturing, inventory, and shipping locations. [Product inventory](/manual/en/apps/product-inventory/user) and [material inventory](/manual/en/apps/material-inventory/user) are managed per plant, and receiving destinations for materials are chosen from the plants registered here.

> This app is currently available **in the development (dev) environment only**. Screens and steps may change before the production release.

## What you can do with this app

- Register a plant's basic information (code, name, address, contacts).
- Manage the **regions** that group plants (see "Region management" below). Regions are the units targeted by REGION-scope permissions.
- Manage per-plant **floor maps** (floor drawings). Storage-location pins from the storage location app (MS0E) and device pins from device management (SY09) are placed on these maps.

Managing the **storage locations and shelves** inside a plant has moved to the storage location app (MS0E). This app manages the floor maps (drawings) only.

![Plant list](../../assets/screenshots/master-plant-list-01.png)

## Viewing the list

- Columns: **code / name / country / region / status / updated**. Click a row to open the detail page.
- Use the search box to filter by **code or name**. You can also filter by **status** (active / inactive).
- Select rows to run **bulk activate / bulk deactivate / bulk delete**.
- Next to "New" at the top right there is also a "**Region management**" button.

## Creating a new plant

Click "New" at the top right of the list.

**Basic information**

- **Plant code** — enter a unique code identifying the plant (e.g. `F01`). **It cannot be changed after creation.**
- **Name** (Japanese required, English optional) / **kana reading**.
- **Active** — turn off to remove the plant from selections (past data is kept).
- **Notes**.

**Contact and address**

- **Country** (default: Japan) / **Region** — the region this plant belongs to. It becomes the target of REGION-scope permissions (optional).
- **Postal code** / **address** (Japanese / English).
- **Phone** / **email** / **contact person**.

## Region management

Use "Region management" at the top right of the list to manage the **regions** that group plants. Regions are the units referenced by **REGION-scope** permissions (e.g. someone with a permission for region `jp` covers all plants in that region).

![Region management](../../assets/screenshots/master-plant-regions-01.png)

- The columns are **code / name (Japanese) / name (English) / plant count / status / actions** (edit, deactivate, delete).
- Add a region on the bottom row: enter a code (e.g. `jp`) and names (e.g. 日本 / Japan), then click "Add".
- Region codes are the identifiers referenced by REGION-scope permissions, so they **cannot be changed after creation**. A region can be deleted only when its **plant count is 0** (no plant references it).

## Detail page

- The summary shows the plant code, names, kana reading, country, postal code, address, phone, email, and contact person.
- There are two tabs: **Overview** (notes) and **Floor maps**.
- The menu at the top right offers **edit / deactivate / delete**.

## Floor maps

Manage the plant's floor drawings on the **Floor maps** tab of the detail page.

- Click "**Add floor**" to create a floor and give it a **floor name** (e.g. `1F 加工場`).
- **Upload a drawing** per floor (it can be replaced later).
- **Overlay view** shows multiple floor drawings on top of each other to check alignment.
- A floor **cannot be deleted** while device or storage-location pins are placed on it.

Drawings are managed only in this app (MS0C). The storage location app (MS0E) and device management (SY09) only place pins on these maps.

## Edit and delete rules

- **The plant code cannot be changed after creation.** All other fields are editable.
- A plant referenced by inventory or other records may not be deletable. Deactivate plants that are no longer in use.

## Glossary

- **Region** — a group of plants. The entity behind REGION-scope permissions.
- **Floor map** — a per-floor drawing of a plant, on which storage-location and device pins are placed.

This app requires the **master permission**. New users may also want to read the [Start Manual](/manual/en/start).
