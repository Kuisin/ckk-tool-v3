# designs/

Drop any `.tsx` file here (including subfolders). It appears automatically in the file tree — no config needed.

## Requirements for design files

- Must export a React component as either:
  - **`export default function MyPage()`**, or
  - **`export function MyPage()`** (named export matching the filename, e.g. `AppLauncher.tsx` → `export function AppLauncher`)
- Both **Mantine v9** (`@mantine/core`, `@mantine/hooks`) and **Tailwind CSS** are available.
- `@tabler/icons-react` is available.
- Do not use `next/link` or navigation links — designs are static UI previews only.
- `next/navigation` and `next/image` are shimmed if needed (no Next.js runtime).
- CSS Modules (`.module.css`) work out of the box.

## Multi-file designs

If a design needs helper files, put them in a subdirectory:

```
designs/
├── pages/
│   └── ListPage.tsx    ← appears in file tree
└── layout/
    ├── AppLauncher.tsx ← named export OK if name matches file
    └── helpers/
        └── styles.module.css
```
