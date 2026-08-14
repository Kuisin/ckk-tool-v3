---
title: "End User — User Manual"
description: "Operation code MS02. A ledger for registering and managing the companies that actually use the products (the end users)."
screenshots: [master-end-user-list-01]
---
Operation code **MS02**. A ledger for registering and managing the companies that actually use the products (the end users).

## What you can do here

Separate from the [customer](/manual/en/masters/customer/user) who places the order, use this when you want to record the company that **actually uses** the product.

- Registration is **optional**. It is mainly used for large deals where you want to manage the end user properly.
- End users are managed internally as "business partners (BP)"; an end user is a BP that has the **end-user role**.

## Viewing the list

- The list columns are **BP code / Name / Industry / Status**. Click a row to open its detail screen.
- Use the search box to filter by **BP code, name, or industry**. You can also filter by **status** (active / inactive).
- Selecting rows enables **bulk activate / bulk deactivate / bulk delete**.

![End-user list with BP code, name, industry, and status columns, plus the search and filter bar](../../assets/screenshots/master-end-user-list-01.png)

## Creating a new end user

Register from **New** at the top right of the list. The fields are almost the same as a customer.

**Basic info**

- **Name** (Japanese required, English optional) / **Country** / **Kana reading** / **Short name** / **Corporate number** / **Active**.
- **AI match names** — a list of aliases used to match company names during order-document auto-reading.

**Address & contact**

- **Postal code** / **Address** / **Phone** / **FAX** / **Email** / **Website** / **Notes**.

**End-user info**

- **Industry** — e.g. automotive parts.

The **BP code** (`BP-NNNNN`) is assigned automatically on save.

## Detail screen

- Along with the basic-info summary, the **industry**, **notes**, and **end-user memo** are shown.
- Use the menu at the top right to **Edit** / **Deactivate** / **Delete**.

## Glossary

- **End user** — the company that actually uses the product. This can differ from the customer who places the order.
- **Industry** — the company's line of business.
- **BP (business partner)** — the company unit that groups customers, suppliers, end users, etc.

If you are new, please also see the [Start Manual](/manual/en/start).
