---
title: "Order Acceptance — User Manual"
description: "Operation code SA04. AI automatically reads customer purchase orders (PDFs and scanned images), imports them as order…"
screenshots: [order-acceptance-list-01, order-acceptance-detail-01, order-acceptance-detail-02]
---
Operation code **SA04**. AI automatically reads customer purchase orders (PDFs and scanned images), imports them as order acceptances (受注請書), and lets you review, approve, and expand them into sales orders (注文請書) — all on one screen.

> This app is currently available **in the development (dev) environment only**. Screens and steps may change before the production release.

## What you can do with this app

- **AI extraction** (OCR + AI) reads order files automatically and creates a draft order acceptance with the customer and line items pre-filled. Extraction takes **about 30–60 seconds per file**.
- A person reviews and corrects the extracted result, then **requests approval → approve → deploy**, creating one **sales order (注文請書)** per line item in a single step.
- Line unit prices are automatically checked against the [price list](/manual/en/apps/price-list/user), and any **price difference** is flagged.
- Requires the order acceptance permission (order_acceptance). Approving and rejecting additionally require membership in the first approval group (or a delegate).

![Order acceptance intake list](../../assets/screenshots/order-acceptance-list-01.png)

## Three ways to import

- **Watched folder**: files placed in the server's intake folder are imported automatically (a badge at the top of the list shows whether it is enabled).
- **Priority intake**: use the **優先取込** (priority intake) button at the top right of the list to pick files (PDF / PNG / JPG / WebP, multiple allowed); they are extracted one by one on the spot. Progress is shown in a notification at the top right.
- **Manual entry**: create a draft yourself without AI intake, entering the customer and line items directly (a customer and at least one line item are required).

## Status flow

- **取込中** (Importing, IMPORT) — file saved; AI extraction is running or has failed. On failure a red alert with a **再抽出** (re-extract) button appears.
- **下書き** (Draft, DRAFT) — extraction finished. The only status in which the content can be reviewed and edited.
- **承認依頼中** (Approval requested, REQUESTED) — waiting for the first approval group.
- **承認済** (Approved, APPROVED) — **伝票展開** (deploy) can be run.
- **展開済** (Deployed, COMPLETED) — sales orders created. Can be **archived**.
- **アーカイブ** (Archived, ARCHIVED) — finished and stored. No further edits.

## Reviewing and editing the draft

On the detail screen (while in draft) you edit the AI-extracted result directly.

1. **Basic info**: customer (if unidentified, search and select — required before requesting approval), customer PO number, quote number (optional), order date, and notes. A link to the source file lets you open the original for comparison.
2. **Line items**: check product, order type (production / test / sample / other), quantity, unit price, and delivery date. Match any **unidentified product** rows against the product master.
3. Press **保存** (save), then request approval (unsaved edits must be saved before requesting).

![Editing a draft order acceptance (with a price-difference warning)](../../assets/screenshots/order-acceptance-detail-01.png)

## Price check and approval

- Saved line prices are always checked against the price list (customer × product × order type × quantity); mismatching rows get an orange **価格差異** (price difference) badge plus a warning at the top of the page.
- Requesting approval with a price difference opens a confirmation modal; the request is submitted only if you choose **差異を確認して依頼** (acknowledge and request). The acknowledgment is recorded in the history.
- While approval is requested, members of the first approval group (or delegates) can **承認** (approve) or **差し戻し** (reject — reason required; returns the record to draft).

## Deploy (creating sales orders)

- Pressing **伝票展開** (deploy) on an approved order acceptance creates one **sales order (注文請書)** per line item in one batch (numbered as the acceptance number plus branch suffixes -01, -02, …).
- Deployment requires **every line to have an identified product and a unit price**. Incomplete rows are reported with their row numbers.
- The created sales orders can be opened from the "生成された注文請書" links on the detail screen, or via the **注文請書一覧** (sales order list) button at the top right of the list (/production/sales-orders).
- If a quote number was entered, that quote is automatically marked as accepted.
- After deployment, **archive** the record to finish.

![Approved order acceptance (before deployment)](../../assets/screenshots/order-acceptance-detail-02.png)

## List and search

- Columns: number / intake source (watched folder, priority intake, manual) / file name / customer / item count / status / error / imported at.
- Search by number, file name, or customer, and filter by status. Click a row to open the detail screen.
- While any row is still importing, the list auto-refreshes every 30 seconds.

## FAQ

- **Extraction failed** — run **再抽出** (re-extract) from the red alert on the detail screen. If it keeps failing, you can create the record via **manual entry** instead.
- **Customer remains "未特定" (unidentified)** — the AI could not match the customer master. Search for and select the customer in the draft, then save (registering matching name variants in the [customer master](/manual/en/masters/customer/user) also helps).
- **"価格表なし" (no price list) is shown** — it means no price list exists for that customer × product; it is not a price difference. Register a [price list](/manual/en/apps/price-list/user) if needed.
