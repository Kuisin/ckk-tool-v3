# Product Items — Settings Manual

**Product Items (SY04)** is the config app for the input fields used when creating a new [product](/docs/masters/product/user). It has two screens.

- **Item definitions** — a reusable library of input fields (key, type, options, …).
- **Product types** — templates built by assigning item definitions. When creating a product you pick a type and its items appear.

> This app requires **system permission**. Changes affect every user's product creation screen.

## Opening it

- Home (System) → **製品項目 (Product Items)**, or type `SY04` in the search box.
- The top-right button switches between "Item definitions ⇄ Product types".

## Terms

- **Item definition** — the definition of one input field. e.g. "Surface treatment", "Hardness".
- **Field type** — the kind of value an item accepts; used for validation.
- **Product type** — a product template composed by assigning item definitions. e.g. "Standard", "Coated".
- **Assignment** — linking an item definition to a type; each assignment can override the default.

## 1. Item definitions (library)

On `/settings/product-items` (the main screen) you create reusable input fields. The list supports enable/disable, reorder, and delete; edit each field on its own page via "Edit".

Each field:

- **Item name (ja/en)** — the label shown on the product form.
- **Key (identifier)** — the stored data name. A valid identifier starting with a letter/underscore (e.g. `surfaceTreatment`), unique overall. **Cannot be changed after creation** (assignments reference it).
- **Field type** — one of the following.
- **Required** — when on, the item cannot be left empty.
- **Default (base)** — can be overridden when assigned to a type.

### Field types (formats) and validation

- **Text** — free input; required means non-empty.
- **Number** — digits only; also checks the min/max range.
- **Boolean** — yes/no via a switch.
- **Select** — pick from the provided options; nothing else allowed.
- **Date** — must be a valid date.

## 2. Product types (templates)

On `/settings/product-items/types` you create product types. The list supports enable/disable, reorder, and delete; edit each on its own page.

On a type's edit page:

- **Name (ja/en) / description / enabled**.
- **Assigned items** — use "Assign item" to pick an item definition and optionally override its **default** (blank uses the item definition's default). Reorder and remove supported.

> Only enabled item definitions can be assigned. If there are none, create them first under "Item definitions".

## How it's used when creating a product

The [product](/docs/masters/product/user) creation screen shows a "Product Type" field. Picking a type expands its assigned items (typed, defaults filled in). Values are saved as the product's spec, and the chosen type is recorded. Items not covered by the type can still be added freely under "Other spec".

> If a value doesn't match its format, saving fails and asks you to fix it (checked both on screen and on the server).

## Troubleshooting

- **A type isn't selectable** — check that it isn't disabled.
- **No items to assign** — create item definitions first.
- **Want to change a key** — keys can't be changed after creation; create a new item instead.
- For the product itself, see the [Product user manual](/docs/masters/product/user).
