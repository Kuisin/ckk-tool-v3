# pdf-templates/

Drop `.html` files here to preview them as document PDF templates.

## Purpose

These are HTML + vanilla CSS templates that get sent to Gotenberg for PDF generation
(see `app/api/pdf/`). The design-preview app renders them in an A4 iframe so you can
iterate on layout and typography before wiring them into the Next.js route handlers.

## Requirements

- Plain HTML + vanilla CSS only — no framework dependencies.
- Use `@page` and `@media print` CSS rules for print-specific styling.
- A4 dimensions: 210 mm × 297 mm (794 px × 1123 px at 96 dpi screen equivalent).
- Subfolders are supported and appear as collapsible groups in the file tree.

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

## Design conventions

All templates share a common visual language:

- **Font**: `Noto Sans JP` → `Hiragino Kaku Gothic ProN` → `Yu Gothic` → `sans-serif`
- **Page**: A4, `margin: 15mm 20mm`
- **Header**: document title (left) + issuer block (right)
- **Recipient + doc-info block**: recipient name with underline, doc metadata table
- **Items table**: dark `#2c3e50` header, alternating rows, right-aligned amounts
- **Footer**: fixed to bottom, doc number + page count

### Template-specific notes

- `delivery-note.html` contains two variants in comments:
  - **With price** (`include_price = true`): shows unit price + amount columns (default view)
  - **Without price** (`include_price = false`): hides price columns, shows `.no-price-notice`
- `work-order.html` includes process step table, inspection template chips, and sign-off boxes.
- `shipping-order.html` shows `DISPATCH` by default; swap `.type-badge` class to `.storage` for `STOCK_STORAGE` type.
