# Product — User Manual

Operation code **MS03**. A ledger for registering and managing the products you make. [Trial Estimates](/docs/apps/trial-estimate/user), [Quotes](/docs/apps/quote/user), and price lists are created by choosing a product registered here.

## What you can do here

Register "what products you handle". Besides a name, a product can record what material it is made from (**material spec**) and its dimensions, tolerances, and other **specifications**.

- Once a product is registered, it becomes selectable in the Trial Estimate, Quote, and [Price List](/docs/apps/price-list/user).
- Material is specified as "**material type + diameter + length**". It is not tied to a specific material code.

## Viewing the list

- The list shows registered products. Click a row to open its detail screen.
- Use the search box to filter by **product code or name**.

## Creating a new product

Register from **New** at the top right of the list. The main fields are:

**Basic info**

- **Name** (Japanese required, English optional).
- **Unit** — choose from pcs (本) / piece (個) / kg / m / set.
- **Active** — turn off to hide it from selection lists.
- **Notes**.

**Material spec**

- **Material type** — only material types that have a registered code structure can be selected. Search by material-type code or name.
- **Diameter (mm)** — 0.1 to 99.9 mm. Entering it shows the code (diameter × 10).
- **Length (mm)** — 1 to 999 mm.
- The idea is to cut a material of the same type and diameter to the required length. It is not tied to a specific material.

**Specifications**

- Describe freely as "item name" and "value" pairs (e.g. Outer diameter → `φ20 ±0.01`).
- Use "Add spec item" to add rows.

The **product code** (`PRD-YYYYMM-NNNN`) is assigned automatically on save. No manual entry is needed.

## Detail screen

- Basic info, material spec, and specifications (items and values) are shown.
- The **price lists** linked to this product are also shown.
- Use the menu at the top right to **Edit** / **Deactivate** / **Delete**.

## Glossary

- **Material type** — the kind of material (a combination of maker, grade, shape, etc.). A product specifies its material by material type plus dimensions.
- **Diameter / length** — the thickness (mm) and length (mm) of the material.
- **Specification (spec)** — free-form per-product items such as outer diameter and tolerance.
- **Unit** — how quantity is counted (pcs, piece, etc.).

If you are new, please also see the [Start Manual](/docs/start).
