---
title: "Material Receipt — User Manual"
description: "Operation code PU01. Records the arrival of materials at a plant and adds them to material inventory."
screenshots: []
---
Operation code **PU01**. Records the arrival of materials at a plant and adds them to material inventory.

> This app is currently available **in the development (dev) environment only**. Screens and steps may change before the production release.

## What you can do here

A ledger of material receipt (素材入荷) records. There are two kinds of receipt.

- **Purchase-order receipt** — created **automatically** by the "Complete receiving" action of a [material purchase order (素材発注書, PU03)](/manual/en/apps/purchase-order/user). The list shows a link to the PO number (PO-…).
- **Direct procurement** — a receipt of material procured without a purchase order. You register it manually with **New** in this app.

In both cases, the material is added to the receiving plant's [material inventory (素材在庫, PD05)](/manual/en/apps/material-inventory/user) at the same time the record is created. Registration requires the material-receipt permission.

## New registration (direct procurement)

1. Open **New** at the top right of the list.
2. Search for and select the **material** (required) — from the [material master](/manual/en/masters/material/user).
3. **Supplier** and **receiving plant** are optional. If you choose a plant, the stock is added to that plant's material inventory.
4. Enter the **receipt date** (defaults to today) and the **quantity and unit**.
5. Optionally attach **evidence files** (delivery-note copies, inspection sheets, etc. — PDF / PNG / JPG / WEBP / HEIC / XLSX / CSV, up to 20 MB each) and press **Register**. Evidence is uploaded after the registration completes.

After saving you are taken to the detail screen.

## Detail screen

- Shows the material, supplier, receiving plant, quantity, receipt date, and the PO line (a link to the material purchase order for a PO receipt; a badge for direct procurement).
- A receipt is a **finalized record** whose stock has already been posted, so it cannot be edited or deleted.
- **Evidence** can be added or removed at any time.

## List & search

- Columns: material (code + name) / supplier / receiving plant / quantity / receipt date / PO line (PO number or direct procurement).
- Filter with the search box (material, supplier, PO number) and the **receipt type** (PO receipt / direct procurement).
- Click a row to open the detail screen.

## FAQ

**Do I register receipts for ordered materials here?** — No. PO receipts are created automatically by "Complete receiving" on the material purchase order (PU03). Only direct procurement is entered manually in this app.

**What about split (partial) deliveries?** — "Complete receiving" on a purchase order receives the remaining quantity all at once. Register partial arrivals directly in this app instead.

**I made a mistake in a record** — There is no correction feature for receipt records. Because they affect stock quantities, double-check the quantity and plant before registering.
