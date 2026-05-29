# design-preview

Lightweight Vite + React gallery for previewing generated UI designs and PDF document templates.

## Quick start

```bash
cd design-preview
pnpm install
pnpm dev          # → http://localhost:5173
```

## Modes

### UI Designs (default)

1. Generate a component with your LLM of choice.
2. Save it as a `.tsx` file in `designs/` (default export, or named export matching the filename).
3. Vite HMR picks it up — select it from the file tree to preview it.

Each design renders in one of two display modes:

- **Browser mock** (default) — the design is shown inside a simulated browser window (chrome + URL bar), as a full page would appear.
- **Component** — prefix the filename with `comp_` (e.g. `comp_PrimaryButton.tsx`) to render the design bare, centered in a card with no browser chrome. Use this for isolated UI components. The expected export name may drop the prefix (`comp_PrimaryButton.tsx` → `export function PrimaryButton`) or keep it.

### PDF Templates

For previewing HTML+CSS document templates (quote, invoice, work order, etc.) that are sent to Gotenberg.

1. Create or copy an HTML template into `pdf-templates/`.
2. Switch to **PDF Templates** in the toolbar toggle.
3. Select a template — it renders in an A4 iframe.
4. Click **Save PDF** to generate a PDF via the local `/api/pdf` endpoint (→ Gotenberg) and download it.
   Requires a running Gotenberg instance (default: `http://localhost:3100`, override with `GOTENBERG_URL`).

See [`pdf-templates/README.md`](./pdf-templates/README.md) for details.

## Stack

| Package | Version | Purpose |
|---|---|---|
| `vite` | ^6 | Dev server + bundler |
| `@mantine/core` | ^9 | Component library |
| `@mantine/hooks` | ^9 | Mantine hooks |
| `@tabler/icons-react` | ^3 | Icons |
| `tailwindcss` | ^4 | Utility CSS |

## Shims

The following Next.js imports are shimmed so designs that reference them still render:

- `next/link` → plain `<a>` tag
- `next/navigation` → no-op hooks (`useRouter`, `usePathname`, `useSearchParams`, `useParams`)
- `next/image` → plain `<img>` tag
