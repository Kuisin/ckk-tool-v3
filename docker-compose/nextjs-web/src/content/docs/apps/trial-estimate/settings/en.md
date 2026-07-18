# Trial Calculation — Settings Manual

Operation code **SY02** (Trial calculation). A dedicated app where administrators configure the calculation logic of the Trial Estimate app. Requires the **`system` permission**. This is currently the only app with a settings/customize screen — the other sales apps (Price List, Quote) have no dedicated settings screen.

## Calculation criteria (free setup)

The unit price is the **sum of criteria**. Each criterion is a JavaScript expression over the input variables.

- The main screen lists the criteria. **Reorder, enable/disable, delete, and add** them here.
- Edit an expression from each row's **Edit** button (dedicated page).
- Roles: **component** adds to the subtotal / **intermediate** is not summed but exposed as `r.<id>` / **final** maps the subtotal to the unit price.
- Expressions can use input fields, custom inputs, `quantity`, `subtotal`, `r.<id>`, and helpers such as `round()`.
- "Reset to default" restores the original logic.

## Applicable tool types

- Each criterion can target specific **tool types** (Round bar / Cylinder / OH).
- **Empty selection = applies to no tool type.** Select all three to apply to all (the default is all selected).

## Custom input fields

- Define extra inputs shown on the estimate form (key, label, type, default).
- The key is usable as a **variable** in criteria expressions. Reserved or duplicate keys are rejected on save.

## Defaults & coefficients

- Set company-wide defaults: machining rate (¥/10 min), spare shape count, correction factor, LD charge, etc.
- Also set the material reference-price policy (max / latest / average, lookback months).

## Custom calculation (JS post-processor)

- Apply an additional JavaScript post-processor to the criteria result (override unit prices, add warnings). Only set trusted code.
