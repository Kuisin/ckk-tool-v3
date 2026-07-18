# Customer — User Manual

Operation code **MS01**. A ledger for registering and managing the customers who place orders with you. Quotes and price lists are created by choosing a customer registered here.

## What you can do here

Manage "which companies you do business with" in one place. Besides basic company info, you can register **trade terms** such as the closing day and payment conditions.

- Once a customer is registered, it becomes selectable in the [Price List](/docs/apps/price-list/user) and [Quote](/docs/apps/quote/user).
- You can register **branches** under a company (up to 2 levels: head office → branch).
- You can register multiple **contacts** per company.

Customers are managed internally as "business partners (BP)"; a customer is a BP that has the **customer role**.

## Viewing the list

- The list shows registered customers. Click a row to open its detail screen.
- Use the search box at the top to filter by **company name or code**.
- You can also filter by **status** (active / inactive).

## Creating a new customer

Register from **New** at the top right of the list. The main fields are:

**Basic info**

- **Name** (Japanese required, English optional).
- **Country** / **Kana reading** / **Short name** / **Corporate number**.
- **Active** — turn off to hide it from selection lists (past data is kept).
- **AI match names** — a matching list that lets the order-document auto-reader (AI extraction) resolve a company name to this customer. Register spelling variants (㈱／株式会社, full-width／half-width, old names) separated by Enter.

**Address & contact**

- **Postal code** / **Address** (Japanese/English) / **Phone** / **FAX** / **Email** / **Website** / **Notes**.

**Trade terms**

- **Billing party** — set when billing goes to a different company (if unset, this customer is billed directly).
- **Closing day** — a day from 1 to 31. `31` means "end of month".
- **Payment terms (days)** / **Payment day** / **Credit limit**.
- **Tax type** — taxable / exempt / reduced rate.
- **Invoice delivery method** — email / FAX / post / portal.
- **Consignment partner** — check if this partner is a consignment-sales target.

The **BP code** (`BP-NNNNN`) is assigned automatically on save. No manual entry is needed.

## Detail screen

The detail screen is split into tabs.

- **Overview** — trade terms and the contact list. Contacts can be added and edited here.
- **Branches** — the branches under this customer. Register with "Add branch".
- **Quote/order history** — the quote and order history related to this customer.
- **History** — the record of changes (when and who updated it).

Use the menu at the top right to **Edit** / **Deactivate** / **Delete**.

## Registering branches

- Register from the "Branches" tab → "Add branch" on the detail screen.
- A branch takes the same basic info as a customer. When creating one, you can also register a **primary contact name** at the same time (optional).
- The branch code is auto-numbered as `parent code-NN` (e.g. `BP-00001-01`).

## Glossary

- **BP (business partner)** — the company unit that groups customers, suppliers, end users, etc. A customer is a BP with the "customer role".
- **Branch** — a location under a head office. Up to 2 levels can be registered.
- **Closing day / payment terms** — the day billing is consolidated, and the number of days until payment.
- **Consignment partner** — a partner that is a consignment-sales target.
- **AI match names** — a list of aliases used to match company names during order-document auto-reading.

If you are new, please also see the [Start Manual](/docs/start).
