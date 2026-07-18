# Start Manual

Welcome to the CKK Business Management System. This page is an introduction for **first-time users**. Technical terms are explained in the Glossary at the end.

## What this system is

An in-house system that unifies quoting, orders, manufacturing, shipping, and billing. You'll start with the three sales apps: **Trial Estimate, Price List, and Quote**.

- **Trial Estimate** — works out "what it costs to make this product" from cost.
- **Price List** — a ledger of selling prices per customer.
- **Quote** — creates the quote you send to a customer; the unit price is filled in automatically from the price list.

These three connect in order: **Trial Estimate → Price List → Quote** (see "4. The sales flow").

## 1. Signing in

1. Open the internal portal URL in your browser.
2. Sign in with the **SSO (company account)** button. Development accounts are available via the link at the bottom of the login screen.
3. Once in, click the round avatar (top right) and check that your name and department are correct.

## 2. Reading the screen

- Click the **logo (top left)** → the app launcher opens.
- **Center search box** — type an app name or an "operation code" (e.g. `SA05`) and press Enter to jump straight to that screen.
- **Bell (top right)** — notifications. **Avatar** — profile, settings, sign out.
- **Home** — available apps grouped by category. Apps you lack permission for are hidden.

## 3. Operation codes (screen numbers)

Every screen has a 4-character code. Remembering them lets you jump from the search box.

- `SA05` Trial Estimate / `SA01` Price List / `SA02` Quote
- `MS01` Customers / `MS02` End Users / `MS0A` Approval Groups

## 4. The sales flow (start here)

1. **Compute a unit price in Trial Estimate (SA05)** — enter product, material, dimensions, and the estimate price is derived from cost.
2. **Confirm and register it into the Price List (SA01)** — "confirm" the estimate, then register it for a customer/product.
3. **Create a Quote (SA02)** — pick a customer and product, and the unit price fills in from the price list. Export a PDF and send it to the customer.

Open the "App User Guides" on the left for the details of each app.

## 5. Getting help

- **Can't find a screen** — you may lack the required permission; ask an administrator.
- **Got a notification** — review it from the bell (top right).
- **Change your own settings** — use **Settings** in the top-right menu to update your notification email or password (see the User Settings Manual).

## Glossary

- **Trial Estimate** — computing a selling price from cost; the groundwork for a quote.
- **Reference price / purchase history** — how much a material was purchased for (past purchasing records). The estimate's material cost is derived from this.
- **Tool type** — the product type: Round bar, Cylinder, or OH. Inputs and formulas differ per type.
- **Lot** — a quantity batch made together. Larger quantities lower the per-piece price.
- **Order type** — Production, Test, Sample (amount 0), or Other. Prices can differ per type for the same product.
- **Setup / shape-out** — pre-machining preparation cost, amortized across the quantity to a per-piece amount.
- **Confirmed / Draft** — Draft (editable) → Confirmed (locked). Confirming makes it eligible for price-list registration.
