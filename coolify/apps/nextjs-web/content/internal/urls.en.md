---
title: "System URLs"
description: "Every system used internally — the business app, shared devices, admin tools, database browsers and monitoring — with the URL and which environment (production / staging) it points at."
---

The URLs for the systems used internally. **The same screen has a different URL in
production and staging** — staging data is entirely separate from production, so
check the URL before you touch anything.

> Since 2026-08-24 production and staging are fully separated, database and file
> storage included. Nothing created in staging can appear in production, or vice versa.

## Business app

| URL | Environment | What it is |
| --- | --- | --- |
| `https://app.ckk-tool.co.jp` | **Production** | Business management system — **use this one day to day** |
| `https://app-dev.ckk-tool.co.jp` | Staging | Staging — check new features here |

> **Single sign-on only completes from the internal network or the VPN.** The
> pages themselves open from anywhere, but the sign-in screen shown halfway
> through lives on the internal network only, so from outside it stops there.
> That is expected, not a fault.

## Shared devices (shop-floor tablets)

| URL | Environment | What it is |
| --- | --- | --- |
| `https://ckk-kiosk.kai-lab.net` | **Production** | Step execution, work-order scanning |
| `https://ckk-kiosk-dev.kai-lab.net` | Staging | Staging |
| `https://kiosk.ckk-tools.loc` | **Production** | Internal-only address (internal CA certificate) |
| `https://kiosk-dev.ckk-tools.loc` | Staging | Internal-only address (internal CA certificate) |

> Shared devices **stay on `kai-lab.net`** — they are not moving to `ckk-tool.co.jp`.
> They are only ever used from shop-floor tablets, and the plan is to make them
> reachable **from the internal network only**. Nothing to change on the tablets.
>
> The two `.ckk-tools.loc` addresses are those internal-only addresses. `.loc` is
> not a public domain, so the certificates are **signed by an internal CA** (a
> certificate authority we run ourselves). Two things are needed: an internal DNS
> record for each name → `192.168.50.15`, and **the internal CA certificate on the
> tablet**. The shared-device app trusts an internal CA installed on the device for
> these two addresses only, and the CA is installed during device setup (the
> provisioning QR).
> A browser without the internal CA can reach them by accepting the warning.

## Admin & analytics

| URL | Environment | What it is |
| --- | --- | --- |
| `https://admin.ckk-tool.co.jp` | **Production** | admintools (mail, backup/restore, …) |
| `https://admin-dev.ckk-tool.co.jp` | Staging | admintools (staging) |
| `https://bi.ckk-tool.co.jp` | **Production** | Metabase — attendance and business dashboards |
| `https://db.ckk-tool.co.jp` | **Production** | Prisma Studio — production DB browser (**read-only**) |
| `https://db-dev.ckk-tool.co.jp` | Staging | Prisma Studio — staging DB browser (**read-only**) |
| `https://app-intl.ckk-tool.co.jp` | — | Weblate — translating the on-screen text (reads the `dev` branch, sends translations back as a PR) |

## Platform & operations (IT staff only)

| URL | What it is |
| --- | --- |
| `https://deploy.ckk-tool.co.jp` | Coolify — application deployments |
| `https://dock.ckk-tool.co.jp` | Portainer — Docker container management |
| `https://monitor.ckk-tool.co.jp` | Grafana — logs and monitoring |
| `https://chat.ckk-tool.co.jp` | Open WebUI — internal AI chat |

The old `.kai-lab.net` addresses for `dock` / `monitor` / `chat` still work for now.

## Documentation and external entry points

| URL | What it is |
| --- | --- |
| `https://app.ckk-tool.co.jp/manual` | User manual (**no login required**) |
| `https://app.ckk-tool.co.jp/admin-manual` | Admin manual (this page — login required) |
| `https://app.ckk-tool.co.jp/portal` | Partner portal (**for outside business partners**; they sign in with a portal account, not an employee login) |

## System settings screens (`/settings`)

Every app in the System category lives under `/settings` in the business app.
Append the path to `https://app.ckk-tool.co.jp` for production or
`https://app-dev.ckk-tool.co.jp` for staging. Opening `/settings` on its own takes
you to the System section of the home screen.

| Path | Operation code | App |
| --- | --- | --- |
| `/settings/users` | SY01 | Users |
| `/settings/trial-pricing-engine` | SY02 | Price estimate engine |
| `/settings/product-items` | SY03 | Product items |
| `/settings/product-types` | SY04 | Product types |
| `/settings/apps` | SY05 | Apps |
| `/settings/files` | SY06 | Files |
| `/settings/activity` | SY07 | Activity log |
| `/settings/kiosk-cards` | SY08 | QR cards |
| `/settings/kiosk-devices` | SY09 | Devices |
| `/settings/kiosk` | SY0A | Shared device settings |
| `/settings/links` | SY0B | Links |
| `/settings/order-intake` | SY0C | Order intake |
| `/settings/login-history` | SY0D | Login history |
| `/settings/ai-provider` | SY0E | AI provider |
| `/settings/notification-email` | SY0F | Notification email |
| `/settings/privileged-access` | SY0G | Privileged access |
| `/settings/portal` | SY0H | Partner portal |
| `/settings/api-clients` | SY0I | API clients |
| `/settings/accounting` | SY0J | Accounting export |

For which permission each app needs, see the "Roles and permissions" page.

## Notes

- **`db` and `db-dev` expose the database contents directly** — customers, unit
  prices, costs, attendance. They are read-only (writes are refused by the
  database), but they should not be reachable by anyone who merely knows the URL.
  The same applies to `dock`, `deploy` and `monitor`.
- **Using a `.ckk-tools.loc` address from a tablet needs the internal CA on the
  device.** Without it the app does not trust the certificate and cannot open it.
- CKK systems **have been consolidated under `ckk-tool.co.jp`**. The business
  app's old `kai-lab.net` addresses no longer work. **Shared devices are the
  exception** — they are for shop-floor tablets only and will become
  internal-network only.
- Staging data may be rebuilt without notice. **Do not enter anything there that
  you expect to keep.**
