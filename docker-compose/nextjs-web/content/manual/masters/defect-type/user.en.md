---
title: "Defect Type — User Manual"
description: "Operation code MS09. A small master for registering the categories used when recording defects during manufacturing (…"
screenshots: []
---
Operation code **MS09**. A small master for registering the categories used when recording defects during manufacturing (scratch, chip, dimensional defect, etc.). The types registered here become the choices in the defect record on the step execution screen of a [work order (指示書)](/manual/en/apps/work-order/user).

> This app is currently available **in the development (dev) environment only**. Screens and steps may change before the production release.

## What you can do with this app

- Register defect types (code, name, sort order).
- Because this master holds only a code, a name and a sort order, **there is no detail page**. Editing is done in a modal (small window) on the list.

The **master permission** is required to use this app.

## Viewing the list

- The list columns are **Code / Name / Sort order / Status**. The default sort is by **sort order**.
- Clicking a row opens the **edit modal** (it does not navigate to a detail page).
- Use the search box at the top to filter by **code or name**. You can also filter by **status** (active / inactive).
- Selecting rows enables **bulk activate / bulk deactivate / bulk delete**.

## Creating a new entry

Use "New" at the top right of the list.

- **Code** ... a unique code identifying the defect type (e.g. `SCRATCH`). **It cannot be changed after creation.**
- **Name** (Japanese required, English optional).
- **Sort order** ... an integer of 0 or more. Controls the ordering in the list and in the defect entry on the step execution screen.
- **Active** ... turning it off removes the type from selection lists.

After saving you are returned to the list.

## Editing

- Click a row, or choose **Edit** from the row menu, to open the modal. You can change the name, sort order and active flag (the code cannot be changed).
- The row menu also offers **Deactivate / Activate** and **Delete**.

## Deleting vs. deactivating

- For types no longer in use, **deactivate** is recommended instead of delete (they disappear from selection lists, past records are kept). A type referenced by defect records may not be deletable.

## Glossary

- **Defect type** ... a label for classifying defects, used in defect records on process steps.
- **Sort order** ... the ordering in selection lists; smaller numbers appear first.
