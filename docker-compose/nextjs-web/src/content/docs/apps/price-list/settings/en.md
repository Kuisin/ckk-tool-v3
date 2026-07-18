# Price List — Settings Manual

The price list has no dedicated settings screen of its own. This covers the operating rules and related configuration.

## How the unit price is decided

- Price-list prices are, as a rule, registered from the cost calculation in **Trial Estimate (SA05)**.
- The cost-calculation logic (criteria, coefficients, material reference-price policy) is managed in **Trial calculation (SY02)**. See the "Trial Estimate — Settings Manual".

## Order types

A price list can hold a unit price per order type:

- **PRODUCTION** / **TEST** / **SAMPLE** (amount 0) / **OTHER**.
- The same customer + product with a different order type is a separate entry.

## Validity & quantity tiers

- **Validity**: valid_from (required) / valid_until (empty = open-ended). Managed per entry.
- **Quantity tiers**: quantity range → unit price. All tiers share the entry's validity and currency.

## Permissions

- Creating/editing price lists requires the `price_list` permission. Sales members work on their own price lists (scope OWN), sales assistants read only, and the sales manager has full access to all.
