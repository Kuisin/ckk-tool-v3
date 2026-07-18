# Trial Estimate — User Manual

Operation code **SA05**. Computes a unit price from cost and is the starting point for price-list registration.

## What you can do here

Work out "what to sell this product for" automatically from **cost** — material, machining, coating, etc. The resulting price is registered into the price list and used in quotes.

- **Material cost** fills in automatically from the material's purchase history (i.e. what you paid before = the reference price).
- As you enter dimensions and machining conditions, the **cost breakdown** and **unit price** appear on the right in real time.
- New here? Pick a customer and material, enter the max diameter and length, and check that numbers appear. See the Glossary in the Start Manual for terms.

## Creating an estimate

1. Click **New** at the top right of the list.
2. Choose the **tool type** (Round bar / Cylinder / OH). Inputs change per tool type.
3. Choose the **customer** and **material**. Selecting a material auto-fills the **reference unit price** from purchase history.
4. Enter dimensions and machining conditions (max diameter, total length, step, neck, coating, lap, LD, machining minutes, etc.).
5. Fill in any **custom fields** added by an administrator.
6. Enter the **base quantity** (used to amortize the shape-out cost).

The **cost breakdown** and **unit price** on the right recompute instantly as you type.

## Overriding the reference price

- By default the reference price is derived from purchase history.
- To set it manually, click **Custom** and enter the value. An estimate using a custom price is recorded as "custom".

## Save, confirm, register

- **Save** stores a draft (DRAFT) and records the price at that point as a snapshot (later changes to the calculation logic will not change this estimate's price).
- On the detail screen, **Confirm** (CONFIRMED) makes it eligible for price-list registration.
- **Register to price list** creates a price-list entry for a customer / product / order type (locks the estimate to REGISTERED).

## List & search

- Filter the list by estimate number, customer, tool type, price, and status.
- Click a row to view the detail (cost breakdown, per-lot price, history).
