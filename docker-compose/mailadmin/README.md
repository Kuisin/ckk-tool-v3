# mailadmin — mail-account management WebUI + DB → Sakura sync

Self-hosted WebUI to manage the `ckk-tool.co.jp` mail accounts in a **database**,
then **sync** them to the **Sakura** control panel (`secure.sakura.ad.jp`) with
headless Playwright. Replaces the previous Excel-driven scripts in
[`kuisin/ckk-tool-compose`](https://github.com/Kuisin/ckk-tool-compose)
(`_automation/bpo_sakura`) — those scripts are vendored under `app/sakura/` and
reused, now driven by the DB instead of `email-list.xlsx`.

Deployed on `docker-mac-pro` at `~/stacks/mailadmin`.

- **WebUI/LAN:** <http://192.168.50.15:8090>
- **`mailadmin-db`:** internal Postgres storing `mail_accounts`.

## What it does

1. **Manage accounts in the UI** — add/edit/delete mailboxes (username, password,
   email, quota GB, active). Stored in Postgres (`mail_accounts`).
2. **Sync to Sakura** — the *今すぐ同期* button logs into the Sakura control panel
   (`SAKURA_ID`/`SAKURA_PW`, no 2FA) and reconciles:
   - creates/updates users (password + quota), removes users not in the DB
     (except `postmaster`),
   - creates mail **aliases** for accounts where the email's local part differs
     from the username, removing aliases not on the list.
   Live progress streams to the UI; full detail is in `docker logs mailadmin`.

Only **active** accounts are pushed. Deactivating (un-checking 有効) removes the
user/alias on the next sync.

## Setup

```bash
cp .env.example .env       # DB_PASSWORD, and SAKURA_ID / SAKURA_PW for sync
docker compose up -d --build
```

Add accounts in the UI, then click **今すぐ同期**. (Migrate the old
`email-list.xlsx` by entering the rows, or ask to add an import endpoint.)

> **Security:** this stores mailbox passwords and holds the Sakura control-panel
> login. Keep it LAN-only / behind Cloudflare Access; do not expose openly.
