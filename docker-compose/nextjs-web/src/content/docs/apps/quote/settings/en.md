# Quote — Settings Manual

The quote has no dedicated settings screen. This covers related configuration and operating rules.

## Automatic price resolution

- Line-item unit prices resolve automatically from the **Price List (SA01)** (customer × product × order type × quantity).
- If no price list exists, or the quantity matches no tier, the unit price stays empty. Enter it manually or set up the price list first.
- The underlying cost logic is managed in **Trial calculation (SY02)**.

## Numbering

- Quote numbers use the **QOT-YYYYMM-NNNNN** format and reset monthly (auto-numbered).

## PDF

- The quote PDF is generated from a system template. Ask IT to change the logo or layout.
- Multilingual fields (e.g. product names) render assuming both Japanese and English are populated.

## Permissions

- Creating/editing quotes requires the `quote` permission. Sales members work on their own quotes (scope OWN), sales assistants read only, and the sales manager has full access plus approval.
