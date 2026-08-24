---
title: "System URLs"
description: "Every system used internally — the business app, kiosk, admin tools, database browsers and monitoring — with the URL and which environment (production / staging) it points at."
---

The URLs for the systems used internally. **The same screen has a different URL in
production and staging** — staging data is entirely separate from production, so
check the URL before you touch anything.

> Since 2026-08-24 production and staging are fully separated, database and file
> storage included. Nothing created in staging can appear in production, or vice versa.

## Business app

| URL | Environment | What it is |
| --- | --- | --- |
| `https://ckk.kai-lab.net` | **Production** | Business management system — **use this one for now** |
| `https://ckk-dev.kai-lab.net` | Staging | Staging — check new features here |
| `https://dev.kai-lab.net` | Staging | Same as above (older address) |
| `https://app.ckk-tool.co.jp` | **Production** | Future address (staged — see below) |
| `https://app-dev.ckk-tool.co.jp` | Staging | Future address (staged — see below) |

> **The `ckk-tool.co.jp` addresses are staged, not live yet.** The pages load, but
> the SSO callback still points at `kai-lab.net`, so logging in sends you back to
> `ckk.kai-lab.net`. They become the real addresses once Authentik's allowed
> callback list is updated. Until then, **use the `kai-lab.net` addresses.**

## Kiosk (shared shop-floor tablets)

| URL | Environment | What it is |
| --- | --- | --- |
| `https://kiosk.ckk-tool.co.jp` | **Production** | Step execution, work-order scanning |
| `https://kiosk-dev.ckk-tool.co.jp` | Staging | Staging |
| `https://ckk-kiosk.kai-lab.net` | **Production** | Old address (still works for now) |
| `https://ckk-kiosk-dev.kai-lab.net` | Staging | Old address (still works for now) |

> **Point the tablets at the new URL.** The device app has the URL fixed in it,
> and device-trust tokens are per-domain, so each tablet must be **enrolled again**
> on the new address (re-link it in SY09 端末管理). The old addresses stay up until
> that is done.

## Admin & analytics

| URL | Environment | What it is |
| --- | --- | --- |
| `https://admin.ckk-tool.co.jp` | **Production** | admintools (mail, backup/restore, …) |
| `https://admin-dev.ckk-tool.co.jp` | Staging | admintools (staging) |
| `https://bi.ckk-tool.co.jp` | **Production** | Metabase — attendance and business dashboards |
| `https://db.ckk-tool.co.jp` | **Production** | Prisma Studio — production DB browser (**read-only**) |
| `https://db-dev.ckk-tool.co.jp` | Staging | Prisma Studio — staging DB browser (**read-only**) |

## Platform & operations (IT staff only)

| URL | What it is |
| --- | --- |
| `https://deploy.ckk-tool.co.jp` | Coolify — application deployments |
| `https://dock.ckk-tool.co.jp` | Portainer — Docker container management |
| `https://monitor.ckk-tool.co.jp` | Grafana — logs and monitoring |
| `https://chat.ckk-tool.co.jp` | Open WebUI — internal AI chat |

The old `.kai-lab.net` addresses for `dock` / `monitor` / `chat` still work for now.

## Documentation

| URL | What it is |
| --- | --- |
| `https://app.ckk-tool.co.jp/manual` | User manual (**no login required**) |
| `https://app.ckk-tool.co.jp/internal-docs` | Internal docs (this page — login required) |

## Notes

- **`db` and `db-dev` expose the database contents directly** — customers, unit
  prices, costs, attendance. They are read-only (writes are refused by the
  database), but they should not be reachable by anyone who merely knows the URL.
  The same applies to `dock`, `deploy` and `monitor`.
- CKK systems are **being consolidated under `ckk-tool.co.jp`**. The kiosk and the
  platform tools have moved. The business app has its `ckk-tool.co.jp` addresses
  prepared, but **keep using `kai-lab.net` until the SSO switch is done**.
  Old addresses stay up until each move is finished.
- Staging data may be rebuilt without notice. **Do not enter anything there that
  you expect to keep.**
