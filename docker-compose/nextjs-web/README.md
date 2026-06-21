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
- `cloudflared` — Cloudflare Tunnel connector (profile `cloudflare`) publishing
  **https://dev.kai-lab.net**.

pnpm is pinned via `package.json#packageManager` (`pnpm@10.18.0`) so corepack
honors `ignoredBuiltDependencies` (pnpm 11 hard-fails on the ignored `sharp` build).

```bash
cp .env.example .env            # set NEXT_PUBLIC_APP_VERSION (+ tunnel token, below)
docker compose up -d --build web
curl -I http://localhost:3001/
```

### Public access via Cloudflare Tunnel — `dev.kai-lab.net`

Uses a **remotely-managed connector** (token). No router port-forwarding; the
tunnel reaches the app over the internal compose network at `http://web:3000`.

One-time setup in the Cloudflare **Zero Trust** dashboard (zone `kai-lab.net`):

1. **Networks → Tunnels → Create a tunnel → Cloudflared**, name it `docker-mac-pro`.
2. Copy the connector **token** (the long string after `--token` in the shown
   `cloudflared ... run <TOKEN>` command) into `.env` as `CLOUDFLARE_TUNNEL_TOKEN`.
3. **Public Hostname → Add**: subdomain `dev`, domain `kai-lab.net`, service
   `HTTP` → `web:3000`. (The DNS CNAME is created automatically.)

Then start the connector:

```bash
docker compose --profile cloudflare up -d
docker logs nextjs-cloudflared --tail 20   # expect "Registered tunnel connection"
```

`.env` (and the token) are gitignored; only `.env.example` is committed.
