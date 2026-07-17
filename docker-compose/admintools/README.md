# admintools — mail-account management WebUI + DB → Sakura sync

Self-hosted WebUI to manage the `ckk-tool.co.jp` mail accounts in a **database**,
then **sync** them to the **Sakura** control panel (`secure.sakura.ad.jp`) with
headless Playwright. Replaces the previous Excel-driven scripts in
[`kuisin/ckk-tool-compose`](https://github.com/Kuisin/ckk-tool-compose)
(`_automation/bpo_sakura`) — those scripts are vendored under `app/sakura/` and
reused, now driven by the DB instead of `email-list.xlsx`.

Deployed on `docker-mac-pro` at `~/stacks/admintools`.

- **WebUI/LAN:** <http://192.168.50.15:8090>
- **`admintools-db`:** internal Postgres storing `mail_accounts`.

## What it does

1. **Manage accounts in the UI** — add/edit/delete mailboxes (username, password,
   email, quota GB, active). Stored in Postgres (`mail_accounts`).
2. **Sync to Sakura** — the *今すぐ同期* button logs into the Sakura control panel
   (`SAKURA_ID`/`SAKURA_PW`, no 2FA) and reconciles:
   - creates/updates users (password + quota), removes users not in the DB
     (except `postmaster`),
   - creates mail **aliases** for accounts where the email's local part differs
     from the username, removing aliases not on the list.
   Live progress streams to the UI; full detail is in `docker logs admintools`.

Only **active** accounts are pushed. Deactivating (un-checking 有効) removes the
user/alias on the next sync.

3. **バックアップ / 復元**（`/backup`）— shared-db（`ckk`）と SeaweedFS ストレージ、
   さらに Coolify 上のアプリ版数を、バックアップ時点へ復元する管理ツール。UI は
   db-backup スタックの `restore-agent`（Docker ソケットを持つ非公開サービス）を
   トークン付きで呼ぶだけで、この web アプリ自身はソケット・バックアップ実体に
   触れない。**復元の直前に at-point フルバックアップを自動取得**（緊急時のみ
   スキップ可）、確認フレーズ必須、監査ログは `restore-log.jsonl` に残る。
   有効化: `.env` に `RESTORE_AGENT_URL` / `RESTORE_AGENT_TOKEN`（restore-agent と
   同じトークン）。詳細・エージェント側の設定は `docker-compose/db-backup/README.md`。

## Deploy (Coolify-managed, dev + prod, behind Cloudflare Access)

admintools mirrors `nextjs-web`: **two Coolify apps** (git-push auto-deploy +
rollback), both `build_pack: dockerfile`, `base_directory: /docker-compose/admintools`:

| App | Branch | Host | Public (Cloudflare **Access**) |
|-----|--------|------|-------------------------------|
| `admintools-dev`  | `dev`  | `:8090` | `admin-dev.ckk-tool.co.jp` |
| `admintools-main` | `main` | `:8091` | `admin.ckk-tool.co.jp` |

Both share the one `admintools` DB schema. Coolify `fqdn` is cleared (Coolify's
proxy is unused); public access is via the Cloudflare Tunnel → the `admin-dev` /
`admin` socat relays in the `nextjs-web` stack → the host ports. **No built-in
auth** — both hostnames are gated by a **Cloudflare Access** allow-list; never
remove it.

- **Deploy / rollback:** `docker-compose/coolify/deploy.sh admin-dev [<git-sha>]`
  (dev) / `... admin-main [<git-sha>]` (prod). Push to the branch auto-deploys.
- **Env vars are managed in Coolify** (Application → Environment Variables), not
  in a `.env`/`env_file`. Required keys: `DATABASE_URL`
  (`postgresql+psycopg://admintools:<pw>@shared-db:5432/ckk`), `ADMINTOOLS_API_KEY`,
  `SAKURA_ID`, `SAKURA_PW`, `DEFAULT_DOMAIN`, `KOT_DB_URL`, the `LDAP_*` set (same
  values as `vpn-ldap/ldap.env`), and `RESTORE_AGENT_URL` /
  `RESTORE_AGENT_TOKEN` (for the 復元 tool; token must match the db-backup
  `restore-agent`). Reachability to `shared-db`, `vpn-ldap`, `restore-agent`,
  `gotenberg`, `seaweedfs` is by container name over the **`coolify`** network
  (those services are attached to it).

The `docker-compose.yml` here is retained for reference / local runs; the live
deploy no longer uses it. Add accounts in the UI, then click **今すぐ同期**.

> **Security:** this stores mailbox passwords, holds the Sakura control-panel
> login, and includes the DB/storage **restore** tool. Keep it LAN-only / behind
> Cloudflare Access; never assign a public FQDN or expose it openly.
