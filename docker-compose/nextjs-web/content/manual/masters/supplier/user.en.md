---
title: "Supplier — User Manual"
description: "Operation code MS06. A directory for registering and managing suppliers (仕入先 — companies you buy materials from) and …"
screenshots: []
---
Operation code **MS06**. A directory for registering and managing **suppliers** (仕入先 — companies you buy materials from) and **subcontractors** (外注先 — companies you outsource process steps such as centerless grinding or coating to).

> This app is currently available **in the development (dev) environment only**. Screens and steps may change before the production release.

## What you can do with this app

Along with basic company information, you can register closing day, payment terms, bank account for payments, and standard lead time. Companies registered here become selectable in [purchase orders (素材発注書)](/manual/en/apps/purchase-order/user) and [outsource orders (外注依頼)](/manual/en/apps/outsource-order/user).

- The **vendor type** distinguishes "supplier" (procurement of materials) from "subcontractor" (outsourcing of process steps).
- These companies are managed internally as business partners (BP) that carry the **vendor role**.

The **master permission** is required to use this app.

## Viewing the list

- The list columns are **BP code / Name / Vendor type / Standard lead time / Status**. Click a row to open the detail screen.
- Use the search box at the top to filter by **BP code or name**. You can also filter by **vendor type** (supplier / subcontractor) and **status** (active / inactive).
- Selecting rows enables **bulk activate / bulk deactivate / bulk delete**.

## Creating a new entry

Use "New" at the top right of the list. The **BP code** (`BP-NNNNN`) is assigned automatically on save.

**Basic information**

- **Name** (Japanese required, English optional) / **Country** / **Kana reading** / **Short name** / **Corporate number**.
- **Active** ... turning it off removes the company from selection lists (past data is kept).
- **AI match names** ... a matching list that helps the automatic document reader (AI extraction) resolve company names to this partner. Register spelling variants, one per line.

**Address & contact**

- **Postal code** / **Address** (Japanese, English) / **Phone** / **FAX** / **Email** / **Website** / **Notes**.

**Terms of trade**

- **Vendor type** (required) ... supplier / subcontractor.
- **Legacy system code** ... old supplier code (optional).
- **Closing day** ... 1–31; `31` means "end of month".
- **Payment terms (days)** / **Payment day**.
- **Standard lead time (days)** ... typical days from request to receipt; used as a reference for expected arrival in outsource orders.

**Bank account**

- **Bank name** / **Branch name** / **Account type** (ordinary / current) / **Account number**.

## Detail screen

- The summary at the top shows the basic information; the **Overview** tab shows terms of trade, bank account and notes; the **History** tab shows the change log (who changed what and when).
- The menu at the top right offers **Edit** / **Deactivate** / **Delete**.

## Deleting vs. deactivating

- A partner cannot be deleted while other data still references it. For companies you no longer trade with, use **deactivate** instead of delete (they disappear from selection lists, past data is kept).

## Glossary

- **Supplier (仕入先)** ... a company you procure materials and supplies from (vendor type = supplier).
- **Subcontractor (外注先)** ... a company you outsource part of the manufacturing process to (vendor type = subcontractor).
- **Standard lead time** ... typical number of days from request to receipt.
- **BP (business partner)** ... the company unit that manages customers, vendors and end users together.

New here? See the [Start Manual](/manual/en/start) as well.
