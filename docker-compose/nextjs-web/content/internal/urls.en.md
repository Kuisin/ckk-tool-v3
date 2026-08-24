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
| `https://app.ckk-tool.co.jp` | **Production** | Business management system (reachable from outside the office) |
| `https://ckk.kai-lab.net` | **Production** | Same app, for the internal network |
| `https://ckk-dev.kai-lab.net` | Staging | Staging — check new features here |
| `https://dev.kai-lab.net` | Staging | Same as above (older address) |

## Kiosk (shared shop-floor tablets)

| URL | Environment | What it is |
| --- | --- | --- |
| `https://ckk-kiosk.kai-lab.net` | **Production** | Step execution, work-order scanning |
| `https://ckk-kiosk-dev.kai-lab.net` | Staging | Staging |

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
| `https://dock.kai-lab.net` | Portainer — Docker container management |
| `https://monitor.kai-lab.net` | Grafana — logs and monitoring |
| `https://chat.kai-lab.net` | Open WebUI — internal AI chat |

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
- `.kai-lab.net` is for the internal network; `.ckk-tool.co.jp` is reachable from
  outside. Pick the one that suits the situation.
- Staging data may be rebuilt without notice. **Do not enter anything there that
  you expect to keep.**
