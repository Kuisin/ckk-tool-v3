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

## Example structure

```
pdf-templates/
├── invoice.html
├── delivery-note.html
├── quote.html
└── work-order.html
```
