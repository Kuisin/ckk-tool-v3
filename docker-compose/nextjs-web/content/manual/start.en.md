---
title: "Start Manual"
description: "Welcome to the CKK Business Management System. This page is an introduction for first-time users. Technical terms are…"
screenshots: [login-01, launcher-01, home-01]
---
Welcome to the CKK Business Management System. This page is an introduction for **first-time users**. Technical terms are explained in the Glossary at the end.

## What this system is

An in-house system that unifies quoting, orders, manufacturing, shipping, and billing. You'll start with the three sales apps: **Trial Estimate, Price List, and Quote**.

- **Trial Estimate** — works out "what it costs to make this product" from cost.
- **Price List** — a ledger of selling prices per customer.
- **Quote** — creates the quote you send to a customer; the unit price is filled in automatically from the price list.

These three connect in order: **Trial Estimate → Price List → Quote** (see "4. The sales flow").

## 1. Signing in

1. Open the internal portal URL in your browser.
2. Sign in with the **SSO (company account)** button. Development accounts are available from the input fields that appear when you press the "Sign in with a development account" button at the bottom of the login screen.
3. Once in, click the round avatar (top right) and check that your name and department are correct.

![Login screen](./assets/screenshots/login-01.png)

## 2. Reading the screen

- Click the **logo (top left)** → the app launcher opens.
- **Center search box** — type an app name or an "operation code" (e.g. `SA01`) and press Enter to jump straight to that screen.
- **Bell (top right)** — notifications. **Avatar** — Profile, Notification Settings, Home Screen Settings, Sign out.
- **Home** — available apps grouped by category. Apps you lack permission for are hidden, and the set of published apps also differs per environment (production / development).

![App launcher](./assets/screenshots/launcher-01.png)

![Home screen](./assets/screenshots/home-01.png)

## 3. Operation codes (screen numbers)

Every screen has a 4-character code. Remembering them lets you jump from the search box.

- `SA01` Trial Estimate / `SA02` Price List / `SA03` Quote
- `MS01` Customers / `MS02` End Users / `MS0B` Approval Groups

## 4. The sales flow (start here)

1. **Compute a unit price in Trial Estimate (SA01)** — enter product, material, dimensions, and the estimate price is derived from cost. ([Trial Estimate manual](/manual/en/apps/trial-estimate/user))
2. **Create a Price List (SA02)** — choose a customer and product; a confirmed estimate linked to the product can be picked as the base-price source. ([Price List manual](/manual/en/apps/price-list/user))
3. **Create a Quote (SA03)** — pick a customer and product, and the unit price fills in from the price list. Export a PDF and send it to the customer. ([Quote manual](/manual/en/apps/quote/user))

Open the category guides on the left (Sales Apps, Purchasing Apps, and so on) for the details of each app.

## 5. Getting help

- **Can't find a screen** — you may lack the required permission; ask an administrator.
- **Got a notification** — review it from the bell (top right).
- **Change your own settings** — use **Profile** in the top-right avatar menu to update your notification email or password, and **Home Screen Settings** for favorite apps and display mode (see the [User Settings Manual](/manual/en/user-settings)).

## Glossary

- **Trial Estimate** — computing a selling price from cost; the groundwork for a quote.
- **Reference price / purchase history** — how much a material was purchased for (past purchasing records). The estimate's material cost is derived from this.
- **Tool type** — the product type. By default there are three (Round bar, Cylinder, OH); administrators can add more. Inputs and formulas differ per type.
- **Lot** — a quantity batch made together. Larger quantities lower the per-piece price.
- **Order type** — Production, Test, Sample (amount 0), or Other. Prices can differ per type for the same product.
- **Setup / shape-out** — pre-machining preparation cost, amortized across the quantity to a per-piece amount.
- **Confirmed / Draft** — Draft (editable) → Confirmed (locked). A confirmed estimate can be picked when creating a price list.
