# design-preview

Lightweight Vite + React gallery for previewing generated UI designs.

## Quick start

```bash
cd design-preview
pnpm install
pnpm dev          # → http://localhost:5173
```

## Workflow

1. Generate a component with your LLM of choice.
2. Save it as a `.tsx` file in `designs/` (it must have a `default` export).
3. Vite HMR picks it up — select it from the dropdown to preview it.

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
