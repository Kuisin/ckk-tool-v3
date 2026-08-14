---
title: "Trial Calculation — Settings Manual"
description: "Operation code SY02 (Trial calculation). A dedicated app where administrators configure the calculation logic of the Trial Estimate app. Requires the system permission. The main screen is a hub of five sections: calculation criteria, tool type management, material reference-price policy, custom input fields, and lookup tables."
screenshots: [trial-pricing-hub-01, trial-pricing-criteria-01, trial-pricing-tool-types-01]
---
Operation code **SY02** (Trial calculation). A dedicated app where administrators configure the calculation logic of the Trial Estimate app. Requires the **`system` permission**.

## Main screen (hub)

The main screen shows five cards; selecting a section opens its edit page.

- **Calculation criteria** — list and edit the criteria that make up the unit price.
- **Tool type management** — add/remove tool types and set each type's applicable criteria and unit-price criterion.
- **Material reference-price policy** — how purchase history resolves to a price: method, lookback period, default material price.
- **Custom input fields** — estimate-form inputs and global fixed coefficients.
- **Lookup tables** — tables referenced from expressions, such as diameter × length matrices.

![Trial calculation main screen (hub)](../../assets/screenshots/trial-pricing-hub-01.png)

## Calculation criteria

The unit price is the **sum of criteria**. Each criterion is a JavaScript expression over the input variables.

Opening "Calculation criteria" shows the criteria list on the left and the selected criterion's editor on the right (mobile shows the list only). The list has two sections — **"Calculation criteria (component / intermediate)"** and **"Unit price (set per tool type)"** — and can be filtered by name or ID.

- **Add criterion** — the "Add criterion" button above the list opens the creation page.
- **Reorder** — "Reorder" opens a modal; move rows with the up/down buttons and press "Save order". Criteria are evaluated top to bottom (sum of component criteria → unit price).
- **Enable/disable and delete** — done on each criterion's edit screen, not on the list (the "Enabled" switch / "Delete" button; deletion cannot be undone).

On a criterion's edit screen you set:

- **Criterion** — ID, name, role, enabled, applicable tool types. Roles: **component** (added to the subtotal) / **intermediate** (not summed; referenced as `r.<id>`) / **final** (maps the subtotal to the unit price).
- **Expression** — input fields, custom inputs, `quantity`, `subtotal`, `r.<id>`, plus helpers such as `round()`, `lookup()`, and `lookupMatrix()`. Available variables can be browsed and inserted from the list beside the editor.
- **Test run** — pick a "Test tool type" and press "Test run" to see a result table on the spot.

![Editing a calculation criterion](../../assets/screenshots/trial-pricing-criteria-01.png)

## Applicable tool types

- Each criterion can target specific **tool types**.
- **Empty selection = applies to no tool type.** Select all to apply to all (the default is all selected).

## Tool type management

- **Add and remove tool types** on the "Tool type management" page. The three built-in types (Round bar / Cylinder / OH) cannot be removed.
- "Add tool type" asks for a **value** (uppercase letters, digits, `_`; e.g. `BALL_END`; immutable after creation) and a **display name**. Criteria targeting "all tool types" apply to a newly added type automatically.
- A custom tool type can be **removed only while no estimate uses it** (the list shows usage as "N criteria · M estimates"). Removing it also drops it from every criterion's applicable types.
- Each tool type's edit screen sets its **applicable criteria** (checked criteria are evaluated for estimates of that type) and its **unit-price criterion** (a final criterion; exactly one is required per tool type). This is another view of the same data as each criterion's "applicable tool types".
- Added tool types become selectable on the estimate form. Their calculation inputs follow the round-bar style (reference-price based).

![Editing a tool type](../../assets/screenshots/trial-pricing-tool-types-01.png)

## Material reference-price policy

Configures how the estimate's material cost resolves its reference price.

- **Method** — highest price (within the period) / latest price / average price (within the period).
- **Lookback period (months)** — how many months of purchase history to consider (1–36).
- **Default material price (¥/1000mm)** — the fallback price used when no reference price is available. 0 means no default. Estimates that used the default show a "default price" indicator.

## Custom input fields

- Each field defines a **key (variable name)**, **label**, **type** (number / on-off / text / select), **scope**, and **default** (for select fields, list the options separated by `,`). Use "Add field" to add more.
- **Scope** — **Estimate input (shown on the form)** appears as an input on the estimate form; **Global constant (fixed coefficient)** is a company-wide fixed value that does not appear on the form.
- The key is usable as a **variable** in criteria expressions. Reserved or duplicate keys are rejected on save.
- The former "Defaults & coefficients" values (correction factor, LD charge, machining rate (¥/10 min), spare shape count) are now fixed global-constant fields here. Their key, type, and scope are locked and they cannot be deleted; only the value and label can be changed.

## Lookup tables

- Define reference tables such as diameter × length matrices and reference them from criteria expressions via `lookup()` / `lookupMatrix()`.
- Create one with "Add table", then set its **name, return type, default (when nothing matches), key columns (exact / at least / at most), and row data**.
- **CSV (Excel-compatible) import and export** are supported.
