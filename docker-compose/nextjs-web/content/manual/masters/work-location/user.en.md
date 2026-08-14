---
title: "Work Location — User Manual"
description: "Operation code MS0D. A registry that manages physical work locations (one machine, one work area) organized into groups such as machine types and areas. Registered work locations can be selected in work-order step plans."
screenshots: [master-work-location-01]
---
Operation code **MS0D**. A registry that manages physical **work locations** — one machine or one work area — organized into **groups** such as machine types and areas. Registered work locations can be selected as the optional "work location" in a step's **work plan** on a [work order](/manual/en/apps/work-order/user).

> This app is currently available **in the development (dev) environment only**. Screens and steps may change before the production release.

## What you can do with this app

- Create **groups** (machine types, areas, etc.) and register **work locations** (one machine, one work area) under them.
- Manage the **types** used to classify groups (you can add your own types besides the built-in "machine" and "area").
- Set a **capacity** per work location (the number of tasks that can be assigned to it at the same time).
- See how much each work location is used by work-order plans via the **plan count** column.

![Work locations](../../assets/screenshots/master-work-location-01.png)

## Understanding the screen

There are no separate list/detail pages — everything happens on a single management screen.

- The top right of the screen has "**Type management**" and "**Add group**" buttons.
- Each group is shown as a card with its code, name, type, plant, and status, plus **edit / delete / add location** actions.
- The work-location table inside a card has the columns **code / name / capacity / plan count / status**, with edit and delete per row.
- When nothing is registered yet, the screen guides you to create a group (machine type, area, etc.) and add physical locations (one machine, one work area) under it.

## Adding a group

Register groups via "Add group".

- **Code** — a code identifying the group (e.g. `NC-LATHE`).
- **Type** — choose machine / area, or a type added in type management.
- **Name (Japanese)** (e.g. NC旋盤) / **Name (English)** (optional).
- **Plant** — the plant this group belongs to.
- **Sort order** / **notes** / **active**.

## Adding a work location

Use "Add location" on a group card to register a location under that group.

- **Code** — a code identifying the work location (e.g. `NC-01`).
- **Capacity** — the number of tasks that can be assigned at the same time.
- **Name (Japanese)** (e.g. NC旋盤 1号機) / **Name (English)** (optional).
- **Sort order** / **active** / **notes**.

## Type management

Use "Type management" at the top right to manage the **types** used to classify groups.

- Add a type per row by entering a **key** (e.g. `line`) and a **display name (Japanese)** / **English**.
- **Machine** and **area** are built-in types and **cannot be deleted**.
- A custom type also cannot be deleted while any group uses it.

## Relation to work-order plans

In the **work plan** of a step on the work-order detail page, each plan row can select an optional "**work location**". The selected location is shown in the plan list and also on the kiosk step-execution screen. The number of these references appears in the **plan count** column.

## Delete rules

- Deleting a group also deletes the work locations under it.
- A work location that is **in use by a work plan** cannot be deleted (an error explains that groups containing locations used by work plans cannot be deleted). Deactivate locations that are no longer in use.

## Glossary

- **Group** — a unit that bundles work locations (machine type, area, etc.). Belongs to a plant.
- **Work location** — a physical place such as one machine or one work area. Selected in work-order plans.
- **Capacity** — the number of tasks that can be assigned to the location at the same time.

This app requires the **master permission**. New users may also want to read the [Start Manual](/manual/en/start).
