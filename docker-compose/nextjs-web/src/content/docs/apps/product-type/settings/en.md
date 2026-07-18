# Product Types — Settings Manual

**Product Types (SY04)** is the config app for the "templates" used when creating a new [product](/docs/masters/product/user). For each type you define a set of **predefined input items**; when creating a product you pick a type and those items appear automatically, validated by their format (text, number, etc.).

> This app requires **system permission**. Changes affect every user's product creation screen.

## Opening it

- Home (System) → **製品種別 (Product Types)**, or type `SY04` in the search box.
- Also reachable from System Settings (`SY01`) → App Settings.

## Terms

- **Type** — a product template. e.g. "Standard", "Coated".
- **Item** — an input field belonging to a type. e.g. "Surface treatment", "Hardness".
- **Field type** — the kind of value an item accepts; used for validation.

## Basics

Edit the list of types, then press **Save** to apply.

1. **Add a type** — "種別を追加" below the list. Enter the name (ja/en) and a description.
2. **Enable/disable** — the "有効" switch. Disabled types do not appear as choices when creating a product.
3. **Reorder** — the up/down buttons; higher rows show first.
4. **Delete** — the trash button.

## Configuring items

Inside a type, press "項目を追加" and set each item:

- **Item name (ja/en)** — the label shown on the product form.
- **Key (identifier)** — the stored data name. Must be a valid identifier starting with a letter or underscore (e.g. `surfaceTreatment`). It must be unique within the type.
- **Field type** — one of the following.
- **Required** — when on, the item cannot be left empty.
- **Default** — a value pre-filled when creating a product (optional).

### Field types (formats) and validation

- **Text** — free input; required means non-empty.
- **Number** — digits only; also checks the min/max range.
- **Boolean** — yes/no via a switch.
- **Select** — pick from the provided options; nothing else allowed.
- **Date** — must be a valid date.

- Choosing **Number** lets you set a min and max.
- Choosing **Select** lets you add options (a value plus a display label). The value is what gets saved; the label is only for display.

## How it's used when creating a product

The [product](/docs/masters/product/user) creation screen shows a "製品種別 (Product Type)" field. Picking a type expands its items (typed, with defaults filled in). Values are saved as the product's spec, and the chosen type is recorded too. Items not covered by the type can still be added freely under "その他の仕様 (Other spec)".

> If a value doesn't match its format, saving fails and asks you to fix it (checked both on screen and on the server).

## Troubleshooting

- **A type isn't selectable** — check that it isn't disabled.
- **Can't save** — check that keys are valid identifiers (start with a letter/underscore) and not duplicated within the type.
- For the product itself, see the [Product user manual](/docs/masters/product/user).
