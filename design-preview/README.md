# design-preview

Lightweight Vite + React gallery for previewing generated UI designs and PDF document templates.

## Quick start

```bash
cd design-preview
pnpm install
pnpm dev          # → http://localhost:5173
```

## Architecture (UI designs)

UI designs render inside a **mock browser** (chrome + URL bar) in the shell app (`index.html`). The page content is an **iframe** (`frame.html`) — a separate document so portals, `position: fixed`, and viewport width behave like a real browser tab.

```
Shell (index.html)          Frame (frame.html)
├── Toolbar + file tree     ├── MantineProvider (theme from URL ?scheme=)
├── Browser chrome          └── Selected design component
└── <iframe src="frame.html?design=...">
```

Query params on the iframe URL:

| Param | Values | Purpose |
|-------|--------|---------|
| `design` | module path | e.g. `../designs/layout/layout.tsx` |
| `viewport` | `desktop` \| `mobile` | desktop mock is max 1280px wide; mobile is 390px |
| `scheme` | `light` \| `dark` | synced from shell color toggle |
| `mode` | `page` \| `component` | layout vs isolated component |
| `t` | number | cache-buster for manual re-render |

## Modes

### UI Designs (default)

1. Generate a component with your LLM of choice.
2. Save it as a `.tsx` file in `designs/` (default export, or named export matching the filename).
3. Vite HMR picks it up — select it from the file tree to preview it.

Display modes (all inside the mock browser iframe):

- **Page** (default) — full page inside the iframe. Layout files (`layout/layout.tsx`) include sample dashboard content between header and footer.
- **Component** — prefix the filename with `comp_` (e.g. `comp_AppLauncher.tsx`). Renders inside the iframe in component mode (centered card, or popover-width wrapper for `comp_AppLauncher`).

**Full UI (header, popovers, AppShell)** — preview `layout/layout.tsx`, then use the app launcher grid icon in the header. Popovers stay inside the mock window because they portal to the iframe document, not the shell.

**Isolated launcher grid** — preview `layout/comp_AppLauncher.tsx` to see the grid at production popover width (544px).

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

In the preview iframe, `useSearchParams` reads the **frame** document’s query string (`window.location` inside the iframe).
