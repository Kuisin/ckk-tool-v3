---
title: "Outsource Order — User Manual"
description: "Operation code PU04. A cross-cutting list of outsourced process steps (centerless grinding, coating, etc.) across all work orders."
screenshots: [outsource-order-list-01]
---
Operation code **PU04**. A cross-cutting list of outsourced process steps (centerless grinding, coating, etc.) across all work orders.

> This app is currently available **in the development (dev) environment only**. Screens and steps may change before the production release.

## What you can do here

A list of only those steps of [work orders (指示書, PD02)](/manual/en/apps/work-order/user) whose execution location is **outsourced**. You can see at a glance which processing is currently out at which subcontractor and when it is expected back.

- This app is **read-only**. There is no separate outsource-order (外注依頼) document — the outsourced steps of work orders are shown directly.
- Entering or changing the request date, expected-arrival date, and arrival date is done on the **step execution screen** (the corresponding step in the work order detail). Clicking a row in the list takes you straight to that screen.
- Viewing requires the outsource-order permission.

![Outsource order list with work order number, product, process name, subcontractor, request date, expected arrival, and status columns plus the subcontractor and status filters](../../assets/screenshots/outsource-order-list-01.png)

## Reading the list

- Columns: work order number (click to open the work order detail) / product / process name / subcontractor / request date / expected arrival / arrival date / status.
- **Status** is the progress of the step: not started / in progress / completed / cancelled.
- Besides the search box (work order number, product, process, subcontractor), you can filter by **subcontractor** and **status**. The subcontractor options are built automatically from those appearing in the list.

## Getting an outsourced step to appear here

You cannot add one from this app. Choose **outsource** as the execution location of a work order step and assign a subcontractor — the step then appears in this list. Subcontractor companies are managed in the [supplier master](/manual/en/masters/supplier/user).

## FAQ

**The list is empty** — No work order has an outsourced step yet. Steps appear here once outsource is selected on a work order step.

**I want to fix a date** — Dates cannot be edited on this screen. Click the row to open the step execution screen and change the request / expected-arrival / arrival dates there.

**Do I order materials here?** — No. Material ordering is done with the [material purchase order (素材発注書, PU02)](/manual/en/apps/purchase-order/user). This app lists outsourced manufacturing steps only.
