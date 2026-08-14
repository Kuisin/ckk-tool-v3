---
title: "Product — User Manual"
description: "Operation code MS03. A ledger for registering and managing the products you make. Trial Estimates, Quotes, and price …"
screenshots: [master-product-list-01, master-product-routes-01]
---
Operation code **MS03**. A ledger for registering and managing the products you make. [Trial Estimates](/manual/en/apps/trial-estimate/user), [Quotes](/manual/en/apps/quote/user), and price lists are created by choosing a product registered here.

## What you can do here

Register "what products you handle". Besides a name, a product records what material it is made from (**material spec**), per-type input items and additional items (**specifications**), and the manufacturing **process routes**.

- Once a product is registered, it becomes selectable in the Trial Estimate, Quote, and [Price List](/manual/en/apps/price-list/user).
- Material is specified as "**material type + diameter + length**". It is not tied to a specific material code.
- Specification items are not free-form: you pick them from the items defined in **Product Items (SY03)**.

## Viewing the list

- The list columns are **Product code / Name / Material type / Unit / Status**. The material-type column shows the material spec as "type name φdiameter×length". Click a row to open its detail screen.
- Use the search box to filter by **product code, name, or material type**. You can also filter by **status** (active / inactive).
- Selecting rows enables **bulk activate / bulk deactivate / bulk delete**.
- The row menu offers **Edit** / **Duplicate** / **Deactivate** / **Delete**.
- Products imported from the legacy system without a product code are shown as "**未採番**" (unnumbered).

![Product list with product code, name, material type, unit, and status columns, plus the search and filter bar](../../assets/screenshots/master-product-list-01.png)

## Creating a new product

Register from **New** at the top right of the list. The main fields are:

**Basic info**

- **Name** (Japanese required, English optional).
- **Unit** (required) — choose from pcs (本) / piece (個) / kg / m / set.
- **Active** — turn off to hide it from selection lists.
- **Notes**.

**Material spec**

- **Material type** — only material types that have a registered code structure (converted) can be selected. Search by material-type code or name.
- **Diameter (mm)** — 0.1 to 99.9 mm. Entering it shows the code (diameter × 10).
- **Length (mm)** — 1 to 999 mm.
- Once a material type is chosen, diameter and length become required. The idea is to cut a material of the same type and diameter to the required length. It is not tied to a specific material.

**Product type**

- Shown when **product types (SY04)** are registered. Choosing a type expands the input items predefined by that type (text, number, switch, select, date). Whether each item is required follows the type's definition.

**Additional items**

- Use "Add item" to pick from the **items defined in Product Items (SY03)** and enter values. Free-form keys cannot be used. Added items can be removed with the "−" button.

The **product code** (`PRD-YYYYMM-NNNN`) is assigned automatically on save. No manual entry is needed.

## Detail screen

The summary shows the product code, name, material type, diameter, length, and unit; below it, the screen is split into tabs.

- **Overview** — the product type (if set), the specifications (item/value table), and notes.
- **Routes** — the process routes for this product. See below.
- **Related** — the price-list entries linked to this product (customer / order type / validity / status). Click to jump to the price-list detail.
- **History** — the record of changes (when and who updated it).

Use the menu at the top right to **Edit** / **Duplicate** / **Deactivate** / **Delete**.

## Process routes

On the "Routes" tab, you can register the process composition used to make this product as **routes**. Once registered, the process composition can be prefilled when creating a work order.

- Use "New route" to register a new route.
- A route is managed in **versions**. Switching the version shows that version's step list (snapshot).
- "Create new version" makes a new version with a changed process composition. "Edit" changes the name and active flag; "Delete" removes the route.

![Routes tab on the product detail screen, showing the route list and the "New route" button](../../assets/screenshots/master-product-routes-01.png)

## Glossary

- **Material type** — the kind of material (a combination of maker, grade, shape, etc.). A product specifies its material by material type plus dimensions.
- **Diameter / length** — the thickness (mm) and length (mm) of the material.
- **Product type** — a definition that bundles the input items per product type (managed in SY04).
- **Additional item** — a specification item added by picking from the items defined in Product Items (SY03).
- **Process route** — the process composition used to make this product. It is versioned and used to prefill work orders.
- **Unit** — how quantity is counted (pcs, piece, etc.).

If you are new, please also see the [Start Manual](/manual/en/start).
