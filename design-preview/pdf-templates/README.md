# pdf-templates/

HTML + vanilla CSS templates sent to Gotenberg for PDF generation (see `app/api/pdf/`). Drop `.html` files here to preview them in an A4 iframe before wiring them into the Next.js route handlers.

All templates share a single stylesheet, `base.css`, and contain only the markup unique to each document. The preview inlines `base.css` automatically; when sending to Gotenberg, upload `base.css` alongside the template so the `<link rel="stylesheet" href="base.css">` resolves.

## Rules

- Plain HTML + vanilla CSS only — no framework dependencies.
- Shared styling lives in `base.css`; templates link it and reuse its classes instead of re-declaring CSS.
- A4 size: 210 mm × 297 mm (794 px × 1123 px at 96 dpi), `margin: 5mm` (set via `@page` in `base.css`).
- Font: `Noto Sans JP` → `Hiragino Kaku Gothic ProN` → `Yu Gothic` → `sans-serif`.
- Flat / minimal look: monochrome, no background fills, no rounded corners, no shadows. Tables use a ruled header (`border-bottom`) rather than a dark fill.

## Shared classes (`base.css`)

| Class | Purpose |
|-------|---------|
| `.header` / `.doc-title` / `.doc-number` / `.issuer` | Title + issuer header. Wrap title + number in `.header-left`. |
| `.meta-row` / `.recipient-block` / `.recipient-name` / `.recipient-meta` / `.doc-info` | Recipient + document-info block. |
| `.strip` (`+ .between` / `.row` / `.center`) | Flat bordered band for notices, summaries, status. Use `.label`, `.amount`, `.cell-label`, `.cell-value` inside. |
| `.badge` (`+ .internal` / `.outsource` / `.pending` / `.registered` / `.approved`) | Flat inline badge; modifiers add status color. |
| `.card-grid` (`+ .cols-2` / `.cols-3`) + `.card` / `.card h4` / `.kv` (`.k` / `.v`) | Info / detail blocks. |
| `.section-title` | Left-ruled section heading. |
| `.chip-list` / `.chip` | Tag chips. |
| `.items-table` (`.right` / `.center` cells) | Line-item table. |
| `.totals` (`tr.grand-total`) | Right-aligned totals block. |
| `.notes` / `.notes-label` | Free-text notes box. |
| `.field-lines` (`.fl-label` / `.fl-line`) | Blank fields to fill in by hand. |
| `.footer` | Fixed page footer. |
| `.sub` | Small gray inline sub-text (e.g. product codes). |
| `.invoice-items` + `.invoice-group-head-inner` | Invoice: one table; group row shows 受注書 \| 納品書; `.invoice-group-head-end` has 納品日 + 小計 on the right. |

## Templates

| File | Document | Route handler | Number format |
|------|----------|---------------|---------------|
| `quote.html` | 見積書 | `app/api/pdf/quote/route.ts` | `QOT-YYYYMM-NNNNN` |
| `order-acceptance.html` | 注文受諾書 | *(internal — no PDF route yet)* | `ORD-YYYYMM-NNNNN` |
| `sales-order.html` | 受注書 | `app/api/pdf/sales-order/route.ts` | `ORD-YYYYMM-NNNNN-NN` |
| `work-order.html` | 指示書 | `app/api/pdf/work-order/route.ts` | Sequential int |
| `shipping-order.html` | 出荷書 | `app/api/pdf/shipping-order/route.ts` | *(uuid ref)* |
| `delivery-note.html` | 納品書 | `app/api/pdf/delivery-note/route.ts` | `DRN-YYYYMM-NNNNN` |
| `invoice.html` | 請求書 | `app/api/pdf/invoice/route.ts` | `INV-YYYYMM-NNNNN` |

## Notes

- `delivery-note.html`: preview defaults to **ユーザー直送** (`DIRECT_TO_USER`) — recipient is 受注先; a 直送先 card shows the end-user destination. Swap the `.badge` to `通常納品` and update the strip text for bundled delivery. For the no-price variant, hide the `.items-table` and show the `.strip.center` notice instead.
- `work-order.html` includes a process-step table, inspection-template chips, and a digital approval record (approvals are recorded in-system, not signed by hand).
- `shipping-order.html`: used for `DISPATCH` shipments as **ユーザー直送** — recipient is the end user; 納品書 is sent separately to 受注先. Swap the `.badge` text to `保管` for the `STOCK_STORAGE` type.
- `invoice.html`: single `.invoice-items` table; `.invoice-group-head-inner` puts 受注書・納品書・納品日 on one line per group.
