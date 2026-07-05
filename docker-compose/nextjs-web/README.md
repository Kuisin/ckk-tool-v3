This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deployment (docker-mac-pro, via Coolify)

The app is built and deployed by **Coolify** from this repo (multi-stage
`Dockerfile`, pnpm + Next `output: "standalone"`; base directory
`docker-compose/nextjs-web`) — see `../coolify/README.md`:

- `nextjs-web-dev` — branch `dev`, host **`:3004`** → `https://ckk-dev.kai-lab.net`
- `nextjs-web-main` — branch `main`, host **`:3005`** → `https://ckk.kai-lab.net`
  (rollback: redeploy any previous build from Coolify's Deployments list)

App env vars (`DATABASE_URL`, `GOTENBERG_URL`, `SEAWEED_FILER_URL`,
`PO_EXTRACT_URL`, `NEXT_PUBLIC_APP_VERSION`) are managed in Coolify, not compose.

pnpm is pinned via `package.json#packageManager` (`pnpm@10.18.0`) so corepack
honors `ignoredBuiltDependencies` (pnpm 11 hard-fails on the ignored `sharp` build).

### This stack (`~/stacks/nextjs-web`) — infra + relays only

`docker-compose.yml` here no longer runs the app; it keeps:

- `gotenberg` / `seaweedfs` — PDF rendering + document storage (also attached to
  the `coolify` network so the Coolify apps reach them by name)
- `web` / `web-main` — socat relays giving cloudflared/nginx the stable targets
  `web:3000` / `web-main:3000` on `nextjs-web_default` regardless of deploys

### Access beyond the LAN

- **`cloudflared` stack** — public access at **https://ckk-dev.kai-lab.net** (dev) and
  **https://ckk.kai-lab.net** (main) via Cloudflare Tunnel.
- **`nginx-proxy` stack** — LAN TLS for the same hostnames (split-horizon; shared
  `ckk.kai-lab.net` SAN cert).

Both attach to `nextjs-web_default` and target the relays, so they need this
stack up, but never care about Coolify redeploys.
