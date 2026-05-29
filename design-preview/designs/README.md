# designs/

Drop any `.tsx` file here. It appears automatically in the gallery dropdown — no config needed.

## Requirements for design files

- Must have a **default export** that is a React component.
- Both **Mantine v9** (`@mantine/core`, `@mantine/hooks`) and **Tailwind CSS** are available.
- `@tabler/icons-react` is available.
- `next/link`, `next/navigation`, and `next/image` are shimmed (no Next.js runtime needed).
- CSS Modules (`.module.css`) work out of the box.

## Multi-file designs

If a design needs helper files, put them in a subdirectory:

```
designs/
├── MyPage.tsx          ← appears in dropdown
└── my-page/
    ├── helpers.ts
    └── MyPage.module.css
```

`MyPage.tsx` can import from `./my-page/helpers` as normal.
