# Material Numbering — User Manual

Operation code **MS0C**. A screen for managing the building blocks (components) that make up [material type](/docs/masters/material-type/user) codes and [material](/docs/masters/material/user) codes.

> This app is currently available **in the development (dev) environment only**. Screens and steps may change before the production release.

## What you can do with this app

Material type codes are assembled as `[manufacturer][grade 2 digits][shape][kind 4 digits]`, and material codes as `[type]-[finish][diameter×10, 3 digits]-[length, 3 digits]`. This screen lists, adds, and activates/deactivates the 7 component categories, one per tab.

- **Manufacturer (メーカー)** — the material maker (one uppercase letter, e.g. `B` = AFC).
- **Manufacturer grade (メーカー材種)** — a grade within a maker (2 digits per maker, e.g. `01` = K10UF).
- **Shape (形状)** — standard / OH / cylinder etc. (one uppercase letter).
- **Kind (種類)** — kinds per shape (2 alphanumeric characters, e.g. `B5` = CH for the OH shape).
- **Surface finish (黒皮・研磨)** — the material surface category (one uppercase letter, e.g. `A` = mill scale, `B` = ground).
- **Diameter (直径)** — a 3-digit code derived from mm (diameter × 10, e.g. φ8.3 → `083`).
- **Length (全長)** — a 3-digit code of the length in mm (e.g. 330mm → `330`). A custom label can be attached.

## Viewing the list

- Switch categories with the tabs. Each tab shows **code / name / status / updated** (the grade tab adds a **manufacturer** column, the kind tab a **shape** column, and the diameter/length tabs an **mm** column).
- Use the row menu to **activate / deactivate** an entry.

## Adding an entry

Use the "◯◯を追加" (Add …) button at the top right — its label follows the active tab.

- Manufacturer / shape / surface finish — a **code** (one uppercase letter) and a **name** (Japanese required, English optional).
- Manufacturer grade — select the **manufacturer**, then a **code** (2 digits) and **name**.
- Kind — select the **shape**, then a **code** (2 alphanumeric characters) and **name**.
- Diameter — the **diameter (mm)** (0.1–99.9). The code is derived automatically and shown below the input.
- Length — the **length (mm)** (1–999) and an optional **custom label** (e.g. "特注 330L").

Adding fails if the same code already exists.

## Why there is no delete — deactivation

- Codes are **embedded** in material type and material codes, so entries **cannot be deleted** (deactivation only).
- Deactivated entries can no longer be chosen when creating new material types or materials. **Existing codes are not affected.**
- Diameters and lengths are also registered automatically when creating a [material](/docs/masters/material/user) if missing. Adding them here manually is for preparing choices in advance or tidying display names.

## Glossary

- **Material type code (材種コード)** — 8 characters: manufacturer + grade + shape + kind (e.g. `B01B0001`).
- **Material code (素材コード)** — the type code plus finish, diameter, and length (e.g. `B01B0001-A083-330`).
- **Component (構成要素)** — a category value used as a building block of the codes.

This app requires the **master permission**. New users may also want to read the [Start Manual](/docs/start).
