# Inspection Templates — User Manual

Operation code **MS08**. Register and manage templates of inspection items used in inspection steps. When a template is attached to a [work order (指示書)](/docs/apps/work-order/user), inspections can be recorded along its items.

> This app is currently available **in the development (dev) environment only**. Screens and steps may change before the production release.

## What you can do with this app

- Register inspection templates (code, name, related process step).
- Register **inspection items** per template (item name, unit, tolerance, required/optional, sort order). Items are added, edited and deleted inline on the "Inspection items" tab of the detail screen (items have no page of their own).

The **master permission** is required to use this app.

## Viewing the list

- The list columns are **Code / Name / Related process step / Item count / Status**. Click a row to open the detail screen.
- Use the search box at the top to filter by **code, name or related process step**. You can also filter by **status** (active / inactive).
- Selecting rows enables **bulk activate / bulk deactivate / bulk delete**.

## Creating a new template

Use "New" at the top right of the list.

- **Code** ... letters, digits, hyphens and underscores (e.g. `INSP-DIM-01`). It is unique and **cannot be changed after creation**.
- **Name** (Japanese required, English optional).
- **Related process step** ... the inspection step that uses this template by default (optional). Search the [process step master (工程マスタ)](/docs/masters/process-step/user) by code or name.
- **Active** ... turning it off removes the template from selection lists.

Inspection items are not entered on this form. Add them on the "Inspection items" tab of the detail screen after saving.

## Registering inspection items

On the detail screen, open the **Inspection items** tab and click "Add item". Existing items are edited or deleted via the icons on each row.

- **Item name** (Japanese required, English optional).
- **Unit** (e.g. mm).
- **Tolerance** ... lower and upper limit. You can also set only one side (at least / at most). The upper limit must not be below the lower limit.
- **Required / optional** ... whether the value must be entered when recording an inspection.
- **Sort order** ... the order on the inspection sheet. When adding, the default is "current maximum + 10".

## Detail screen

- The summary at the top shows the code, name, related process step, item count and status.
- The tabs are **Template info** (name, related step) / **Inspection items** (the item sub-table) / **History** (change log; item additions, changes and deletions are recorded here too).
- The menu at the top right offers **Edit** / **Deactivate** / **Delete**.

## Deleting vs. deactivating

- Deleting a template deletes its inspection items together with it. For templates no longer in use, **deactivate** is recommended instead of delete.

## Glossary

- **Inspection template (検査表テンプレート)** ... a reusable set of inspection items, attached to work orders for inspection records.
- **Tolerance** ... the range (lower–upper limit) within which a measured value passes.
- **Related process step** ... the inspection step that uses this template by default.
