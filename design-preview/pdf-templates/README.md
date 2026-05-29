# pdf-templates/

HTML + vanilla CSS templates sent to Gotenberg for PDF generation (see `app/api/pdf/`). Drop `.html` files here to preview them in an A4 iframe before wiring them into the Next.js route handlers. Subfolders appear as collapsible groups in the file tree.

## Rules

- Plain HTML + vanilla CSS only — no framework dependencies.
- Use `@page` and `@media print` for print-specific styling.
- A4 size: 210 mm × 297 mm (794 px × 1123 px at 96 dpi), `margin: 15mm 20mm`.
- Font: `Noto Sans JP` → `Hiragino Kaku Gothic ProN` → `Yu Gothic` → `sans-serif`.
- Layout: title + issuer header, recipient + doc-info block, dark `#2c3e50` items table with right-aligned amounts, fixed footer with doc number + page count.

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

- `delivery-note.html` has two variants in comments: with price (`include_price = true`, default) shows unit price + amount columns; without price hides them and shows `.no-price-notice`.
- `work-order.html` includes a process step table, inspection template chips, and sign-off boxes.
- `shipping-order.html` shows `DISPATCH` by default; swap `.type-badge` to `.storage` for the `STOCK_STORAGE` type.
