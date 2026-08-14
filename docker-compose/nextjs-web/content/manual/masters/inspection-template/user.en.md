---
title: "Inspection Template — User Manual"
description: "Operation code MS09. Register and manage templates of inspection items used in inspection steps. When a template is attached to a work order, inspections can be recorded along its items."
screenshots: [master-inspection-template-list-01, master-inspection-template-items-01]
---
Operation code **MS09**. Register and manage templates of inspection items used in inspection steps. When a template is attached to a [work order (指示書)](/manual/en/apps/work-order/user), inspections can be recorded along its items.

> This app is currently available **in the development (dev) environment only**. Screens and steps may change before the production release.

## What you can do with this app

- Register inspection templates (code, name, related process step, inspection scope, recording method).
- Register **inspection items** per template. Each item has an **input type** (yes/no, numeric, single choice, multiple choice) with a **pass criterion** and a **target**. Items are added, edited and deleted inline on the "Inspection items" tab of the detail screen (items have no page of their own).
- Templates are **versioned**. A version in use by work orders or inspection records is locked; revise it via "Create new version".
- Print a **blank sheet PDF** for handwritten recording.

The **master permission** is required to use this app.

![Inspection template list](../../assets/screenshots/master-inspection-template-list-01.png)

## Viewing the list

- The list columns are **Code / Ver / Name / Related process step / Item count / Status**. The **Ver** column shows the latest version (e.g. `v2`), with a "全N" (N total) note when multiple versions exist. Click a row to open the detail screen.
- Use the search box at the top to filter by **code, name or related process step**. You can also filter by **status** (active / inactive).
- Selecting rows enables **bulk activate / bulk deactivate / bulk delete**.

## Creating a new template

Use "New" at the top right of the list.

- **Code** ... letters, digits, hyphens and underscores (e.g. `INSP-DIM-01`). It is unique and **cannot be changed after creation**.
- **Name** (Japanese required, English optional).
- **Related process step** ... the inspection step that uses this template by default (optional). Search the [process step master (工程マスタ)](/manual/en/masters/process-step/user) by code or name.
- **Inspection scope** ... how many products this sheet inspects: **All**, **Percentage (%)**, or **Count**. "All" inspects the whole lot; percentage / count inspect a sample (percentage 0–100%, count 1 or more).
- **Recording method** ... "**Measured values (per product)**" records every item per product, paging through products. "**Pass count only**" records just the inspected count and pass count per item.
- **Active** ... turning it off removes the template from selection lists.

Inspection items are not entered on this form. Add them on the "Inspection items" tab of the detail screen after saving.

## Registering inspection items

On the detail screen, open the **Inspection items** tab and click "Add item". Existing items are edited or deleted via the icons on each row. The item table columns are **Item name / Type / Pass criterion / Target / Required / Sort order**.

![Inspection template detail (inspection items tab)](../../assets/screenshots/master-inspection-template-items-01.png)

Each item has an **item name** (Japanese required, English optional) and an **input type**. The per-type settings are:

- **Numeric** ... a **unit** (e.g. mm) and a **pass range** (lower / upper limit; one side alone is allowed, and the upper limit must not be below the lower limit). The **target value** is the aimed-for value and does not affect pass/fail.
- **Yes/no** ... the **passing answer** (yes / no) and an optional **target answer**.
- **Single choice / multiple choice** ... the **choices** (display names in Japanese and English) and the **passing choices** (if unset, pass/fail is judged manually), plus an optional **target**.

Common settings:

- **Allow manual pass/fail override** ... turning it off leaves only automatic judgment from the pass criterion (items without a criterion are always judged manually). Items with the override disabled show a "no override" badge in the list.
- **Sort order** ... the order on the inspection sheet. When adding, the default is "current maximum + 10".
- **Required / optional** ... whether the value must be entered when recording an inspection.

## Versioning

- Once a template version is used by a work order or an inspection record, that version is **locked** and can no longer be changed (the detail screen shows a lock notice and hides "Edit").
- To change the content, run "**Create new version**" from the menu. A new version (v2, v3, …) is created with the items copied; existing work orders and inspection records stay on the old version.
- The **Versions** tab lists all versions (version / item count / usage (in use / unused) / status / updated at). The version being viewed is marked accordingly.

## Blank sheet PDF

The "**Blank sheet**" button on the detail screen outputs a PDF laying out the template's inspection items for handwritten recording.

## Detail screen

- The summary at the top shows the code, version (e.g. `v2 (latest)`), name, related process step, inspection scope, recording method, item count and status.
- The tabs are **Template info** (name, related step) / **Inspection items** (the item sub-table) / **Versions** (the version list) / **History** (change log; item additions, changes and deletions are recorded here too).
- The top right offers **Edit** (hidden while locked) and **Blank sheet**; the menu offers **Create new version** / **Deactivate** / **Delete**.

## Deleting vs. deactivating

- A version referenced by work orders or inspection records cannot be deleted. For templates no longer in use, **deactivate** is recommended instead of delete.
- Deleting a template deletes its inspection items together with it.

## Glossary

- **Inspection template (検査表テンプレート)** ... a reusable set of inspection items, attached to work orders for inspection records.
- **Version** ... the revision unit of a template. Versions in use are locked; revisions are made as new versions.
- **Inspection scope** ... how many products the sheet inspects (all / percentage / count sampling).
- **Recording method** ... measured values per product, or pass counts only.
- **Pass criterion** ... the condition for automatic pass judgment (numeric pass range, passing yes/no answer, passing choices).
- **Target** ... the aimed-for value or answer. It does not affect pass/fail.
