# rbac-matrix — ロール・権限リファレンス（Excel）の生成

`_docs/rbac-role-matrix.xlsx` を **dev DB の実データ** から作り直すツール。

以前この Excel はセッション限りのスクリプトで作られていたため、シードを変えても
誰も作り直せず、操作コードもロール構成も古いまま残っていた。生成物ではなく
**生成手段** をリポジトリに置くのが目的。

## 使い方

```bash
cd shared-db
./scripts/remote-db.sh python3 ../tools/rbac-matrix/build_rbac_xlsx.py
```

`remote-db.sh` が SSH トンネルを開いて `DATABASE_URL` を差し替えるので、
ワークステーションから dev DB（ホストポート非公開）を読める。LAN から直接
届く環境なら `DATABASE_URL=... python3 tools/rbac-matrix/build_rbac_xlsx.py` でよい。

必要なもの: `psql`（PATH 上。Homebrew の libpq でよい）と Python の `openpyxl`。
DB へは psql の CSV 出力経由で読むので Python 側の DB ドライバは要らない。

## 何を読んで何を書くか

読む（正はこの 2 つ）:

- `app.roles` / `app.permissions` / `app.role_permission_relation` / `app.users` — DB の実データ
- `docker-compose/nextjs-web/src/lib/app-list.ts` — アプリ → 権限コード・操作コード

書く: `_docs/rbac-role-matrix.xlsx`（5 シート）

| シート | 内容 |
|---|---|
| はじめに | 記号の意味・スコープ・承認グループの注意・本番投入手順 |
| ロール一覧 | rolename / 表示名 / 説明 / 権限コード数 |
| 権限マトリクス | 権限コード × ロール（RCUDEA + スコープ）。対象アプリの操作コード付き |
| アプリと権限 | 42 アプリ → 必要な権限コード（app-list.ts 由来） |
| 検証ユーザー(dev) | dev_* / demo* ユーザーとロール割当 |

権限そのものを変えるときは SQL シード（`shared-db/sql/rbac-seed.sql` /
`roles-seed.sql`）を直して適用し、そのうえでこのスクリプトを回す。
同じ内容の読み物（社内向け）は DC02 社内ドキュメントの「ロールと権限」
（`docker-compose/nextjs-web/content/internal/rbac/`）。
