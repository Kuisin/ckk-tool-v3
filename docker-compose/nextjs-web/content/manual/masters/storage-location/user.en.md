---
title: "Storage Location — User Manual"
description: "Operation code MS0E. A registry that manages the warehouses and storage areas (storage locations) inside each plant and their shelves. Inventory is stored per storage location × shelf, and pins are placed on floor maps here as well."
screenshots: [master-storage-location-01, master-storage-location-manage-01]
---
Operation code **MS0E**. A registry that manages the warehouses and storage areas (**storage locations**) inside each plant and their **shelves**. Inventory is stored per storage location × shelf and can be moved between them with the stock-transfer feature of inventory management (PD04). You can also place storage-location pins on the floor maps managed in [Plant](/manual/en/masters/plant/user) (MS0B).

> This app is currently available **in the development (dev) environment only**. Screens and steps may change before the production release.

## What you can do with this app

- Register **storage locations** (warehouses, storage areas) per plant, and **shelves** under them.
- **Place pins** for storage locations on the plant's floor maps (the drawings themselves are managed in the plant master, MS0B).
- The registered storage location × shelf combinations are used by inventory management (PD04) as the storage unit of stock and as the destination of **stock transfers**.

## The list (all plants)

When you open the app, a cross-plant list of all storage locations is shown.

![Storage location list](../../assets/screenshots/master-storage-location-01.png)

- Columns: **plant (name + code) / code / name / shelf count / map placement / status**. Locations already pinned on a floor map show a "placed" badge.
- Use the search box to filter by **code, name, or plant**.
- Choose a plant in "**Select a plant to manage**" — or click a row — to switch to that plant's management mode.
- "New" at the top right adds a storage location directly from the list (in this case you also select the **plant** and **floor**).

## Management mode (per plant)

Selecting a plant switches to a screen that manages that plant's storage locations and shelves together.

![Managing storage locations](../../assets/screenshots/master-storage-location-manage-01.png)

- "**Add storage location**" registers a storage location in the plant.
- **Floor-map placement** — the floor maps registered in the plant master (MS0B) are shown, and you can **drag-place** or **remove** storage-location pins on them. Adding or replacing drawings is not possible in this app (do that in the plant master, MS0B).
- Each storage location has a card showing its name, code, an "inactive" badge when deactivated, and notes, with "**Add shelf**" plus edit/delete per shelf. Shelves are listed as chips with code + name.

## Input fields

**Storage location**

- **Plant** (selected only when creating from the list) / **floor**.
- **Code** (e.g. `WH1`) / **name (Japanese)** (e.g. 第一倉庫) / **name (English)** (optional).
- **Sort order** / **active** / **notes**.

**Shelf**

- **Shelf code** (e.g. `A-1`) / **name (Japanese, optional)** / **name (English)**.
- **Sort order** / **active**.

## Delete rules

- **Storage locations and shelves referenced by inventory cannot be deleted** (an error explains that stock references the location and suggests emptying it with a stock transfer or deactivating it; the same applies to shelves). Empty the location with a stock transfer in inventory management (PD04), or deactivate it.
- Deleting a storage location also deletes its shelves (the confirmation dialog shows the shelf count).

## Glossary

- **Storage location** — a warehouse or storage area inside a plant. The storage unit of inventory.
- **Shelf** — a section inside a storage location. Inventory is managed per storage location × shelf.
- **Floor-map placement** — placing a storage-location pin on a plant's floor drawing. The drawings are managed in the plant master (MS0B).

This app requires the **master permission**. New users may also want to read the [Start Manual](/manual/en/start).
