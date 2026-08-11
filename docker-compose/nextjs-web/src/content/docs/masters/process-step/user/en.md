# Process Step Master — User Manual

Operation code **MS07**. The catalog of manufacturing process steps (cylindrical machining, coating, inspection, etc.). The manufacturing workflow of a [work order (指示書)](/docs/apps/work-order/user) is assembled from the steps registered here.

> This app is currently available **in the development (dev) environment only**. Screens and steps may change before the production release.

## What you can do with this app

- Register process steps with a **category** (material prep / machining / coating / inspection / inspection approval / shipping) and an **execution location** (internal only / internal or outsource). Steps marked "internal or outsource" can be outsourced via [outsource orders (外注依頼)](/docs/apps/outsource-order/user).
- Set per-step flags: **sync-capable** (can be performed and recorded in parallel with other steps), **inspection step**, and **inspection approval step** (with a minimum approver rank).
- Define **use dependencies** and **execution dependencies** between steps (see below).

The **master permission** is required to use this app.

## Viewing the list

- The list columns are **Code / Name / Category / Execution location / Sync / Inspection / Approval / Sort order / Status**. The default sort is by **sort order**.
- Use the search box at the top to filter by **code or name**. You can also filter by **category** and **status** (active / inactive).
- Selecting rows enables **bulk activate / bulk deactivate / bulk delete**. Click a row to open the detail screen.

## Creating and editing

Use "New" at the top right of the list. The main fields are:

- **Step code** ... starts with an uppercase letter and uses uppercase letters, digits and underscores (e.g. `CYLINDER_MACHINING`). **It cannot be changed after creation.**
- **Name** (Japanese required, English optional) / **Category** / **Execution location**.
- **Sync-capable** / **Inspection step** / **Inspection approval step** ... turning on the approval step reveals a **minimum approver rank** field (e.g. "section chief or above").
- **Sort order** ... the default ordering in lists and catalogs. The actual execution order is decided by dependency resolution.
- **Active** / **Notes**.

## Defining dependencies

A step can carry two kinds of dependencies, entered row by row. Each row is "target step + relation (AND (all) / OR (any)) + notes"; use dependencies additionally have an **exclusion** switch.

- **Use dependencies** ... conditions under which this step **may be included in a workflow** (the target step exists in the workflow). With **exclusion** turned on, the condition becomes the opposite: the target step must NOT exist.
- **Execution dependencies** ... conditions under which this step **may be started** (the target step is completed). A target step that is not part of the workflow counts as satisfied.

Rules: a step cannot depend on itself, and the same target cannot appear twice. On save, the dependency rows are replaced as a whole (rows without a selected target are not saved).

## Detail screen

- The summary at the top shows the step code, name, category, execution location, step flags and sort order.
- The **Overview** tab shows the notes; the **Dependencies** tab shows the two tables of use / execution dependencies (click a row to jump to that step); the **History** tab shows the change log.
- The menu at the top right offers **Edit** / **Deactivate** / **Delete**.

## Deleting vs. deactivating

- A step cannot be deleted while other steps depend on it, or while an [inspection template (検査表テンプレート)](/docs/masters/inspection-template/user) is related to it. **Deactivate** steps that are no longer used.

## Glossary

- **Process step catalog** ... the list of steps that serve as building blocks of manufacturing workflows.
- **Sync-capable** ... a step that can be performed and recorded in parallel with other steps.
- **Use / execution dependency** ... the condition for "may be included in a workflow" and the condition for "may be started".
- **Exclusion** ... a use-dependency option that requires the target step NOT to exist.
