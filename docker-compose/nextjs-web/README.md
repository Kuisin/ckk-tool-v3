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

## Docker deployment (docker-mac-pro)

Containerized with a multi-stage `Dockerfile` (pnpm + Next `output: "standalone"`)
and orchestrated by `docker-compose.yml`. Runs on `docker-mac-pro` under the Dockge
stacks dir (`~/stacks/nextjs-web`).

- `web` — host **`:3001`** → container `:3000` (LAN access; `:3000` is open-webui).

pnpm is pinned via `package.json#packageManager` (`pnpm@10.18.0`) so corepack
honors `ignoredBuiltDependencies` (pnpm 11 hard-fails on the ignored `sharp` build).

```bash
cp .env.example .env            # set NEXT_PUBLIC_APP_VERSION
docker compose up -d --build web
curl -I http://localhost:3001/
```

### Access beyond the LAN

This stack only publishes the app on the LAN (`:3001`) and creates the
`nextjs-web_default` network. The fronting stacks attach to that network and reach
the app at `http://web:3000`:

- **`cloudflared` stack** — public access at **https://dev.kai-lab.net** (Cloudflare Tunnel).
- **`nginx-proxy` stack** — LAN TLS for `dev.kai-lab.net` (split-horizon).

Start them after this stack is up.
