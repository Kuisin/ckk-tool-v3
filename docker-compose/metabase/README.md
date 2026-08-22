# metabase — BI / analytics

[Metabase](https://www.metabase.com/) for dashboards and analytics. Deployed on
`docker-mac-pro` at `~/stacks/metabase`.

- **LAN:** <http://192.168.50.15:3003>
- **App DB:** dedicated Postgres (`metabase-db`) — preferred over embedded H2.

## Setup

```bash
cp .env.example .env
# MB_DB_PASS=<random>
# MB_ENCRYPTION_SECRET_KEY=$(openssl rand -base64 32)   # do NOT change later
docker compose up -d
docker compose logs -f metabase     # first boot runs migrations (~1-2 min)
```

Open the UI and complete the first-run wizard (admin account, etc.). Then add data
sources under **Admin → Databases** (e.g. the application Postgres once it exists).

## Connecting data sources on this host

Metabase reaches a database container by name **only if they share a Docker
network**. To connect it to another stack's DB, attach Metabase to that stack's
network (external) and use the DB's service name + port. For host-level or remote
databases, use the host IP / hostname.

> **Security:** keep on the LAN, or front with nginx + Cloudflare Access like the
> other apps if you publish it.

## データソース

| db | 名前 | 接続ロール | スキーマ | 用途 |
|----|------|-----------|----------|------|
| 2 | King of Time (労務) | `kot_ro` | `kot`, `directory` | 勤怠・労務 |
| 5 | CKK 業務 | `metabase_ro` | `app`（限定） | 受注・生産・請求・在庫 |

`metabase_ro` は `app` スキーマに read-only（`shared-db/sql/grants.sql` +
`docker-compose/shared-db/init/01-roles.sh`）。労務 DB の `kot_ro` とは分離。

**機微データのマスキング** — BI に不要で漏れると危険な認証・セッション・端末鍵・
PIN・プッシュ秘密は `grants.sql` の metabase_ro ブロックで隠している（DB 権限で
強制）。まるごと剥奪: `kiosk_sessions` / `kiosk_link_requests` /
`push_subscriptions`。列単位で剥奪: `users.password_hash`、`kiosk_cards.pin*`、
`kiosk_devices.device_token_hash`/`device_public_key`/`fingerprint`/`last_ip_address`。
権限の無いテーブルは再同期で Metabase から自動的に落ちる。列は pg_catalog 経由で
一覧には残るため、`visibility_type='sensitive'` を metabase-db 側で立てて UI から
隠す（クエリしても DB 権限で拒否されるので値は出ない）。列を増やしたら grants.sql
の許可列リストを見直すこと。

## 表示名の日本語化（テーブル・列ラベル）

生の DB 名の自動整形（`Hr Records` / `Order Acceptances` 等）ではなく意味の
分かる日本語ラベルに揃える。適用先はいずれも Metabase の**アプリケーション
DB（`metabase-db`）**への直接 UPDATE（冪等）。管理者 API キーがあれば REST
でもよいが、SQL の方が一括で速く確実。

- **労務（db 2）**: `sql/metadata-ja.sql` — `kot.*` / `directory.*` にラベル。
  かつて併存した `public.*` 互換ビューは**廃止済み**（下記）。
- **業務（db 5）**: `sql/gen-business-ja.py` が対応表を持ち、出力
  `sql/metabase-business-ja.sql`（108 表・全列）を適用する。フリーフォーム
  JSON 列（監査差分・試算結果など）は展開を切って項目一覧を汚さない。列を
  追加したら**生成元の .py を直して**再生成する:

```bash
# 労務ラベル
ssh 192.168.50.15 "docker exec -i metabase-db psql -U metabase -d metabase -v ON_ERROR_STOP=1" \
  < docker-compose/metabase/sql/metadata-ja.sql
# 業務ラベル（生成 → 適用）
python3 docker-compose/metabase/sql/gen-business-ja.py > docker-compose/metabase/sql/metabase-business-ja.sql
ssh 192.168.50.15 "docker exec -i metabase-db psql -U metabase -d metabase -v ON_ERROR_STOP=1" \
  < docker-compose/metabase/sql/metabase-business-ja.sql
ssh 192.168.50.15 "cd ~/stacks/metabase && docker compose restart metabase"   # キャッシュ破棄
```

## analytics ビュー層（db 5 が参照する名前解決済みビュー）

生の `app` 108 テーブルは ID 列だらけで、関連レコードの「名前」が多段 FK の先に
あって BI から読めない（特に `order_lines → order_acceptances → sales_rep` は
**複合キー**で Metabase から辿れない。Metabase は複合 FK を扱えず、FK の名前置換も
1 段だけ。加えてマスタ名は `jsonb {ja,en}` で表示値に使えない）。そこで
`shared-db/sql/analytics-views.sql` が **`analytics` スキーマ**に業務エンティティごとの
名前解決済みビュー（`v_order_lines` / `v_work_orders` / `v_invoices` / … 約 40 本）を
作り、顧客・営業担当・製品などを平文列で公開する。Metabase db 5 と MCP はこれを参照する。

- すべて `WITH (security_invoker = true)` — ビューは問い合わせたロールの権限で走るので、
  `grants.sql` の metabase_ro マスキング（password_hash 等）がビュー越しでも効く。
- 金額系ビューは末尾に**通貨換算列**を持つ: `currency`（書類の通貨、既定 JPY）と
  `*_jpy` / `*_usd`（`app.currencies` の対円レートで換算。`v_currencies` で
  参照できる。分析用換算 — 会計処理用ではない）。
- レートは同スタックの **`fx-rates`** コンテナが**毎日 07:15 JST に自動更新**
  （起動時にも 1 回 — 再起動 = 即時リフレッシュ）。ソースは open.er-api.com
  （キー不要の無料エンドポイント。Rates By Exchange Rate API —
  https://www.exchangerate-api.com）。JPY 基準レートから `rate_to_jpy = 1/X` を
  計算し、DB に登録済みの有効通貨だけ更新する（通貨の追加/削除はマスタが正）。
  書き込みは専用ロール `fx_rates`（`rate_to_jpy`/`updated_at` の UPDATE のみ —
  grants.sql）。ログは `docker logs fx-rates`。
- db 5 の schema-filter は `app,analytics`（生テーブルと解決済みビューの両方が見える）。
- 列ラベルは下記 `gen-business-ja.py` の analytics パスで日本語化。
- 適用（`analytics-views.sql` を先に、その後 `grants.sql`。どちらも冪等）:

```bash
ssh 192.168.50.15 "docker exec -i shared-db psql -U postgres -d ckk -v ON_ERROR_STOP=1" < shared-db/sql/analytics-views.sql
ssh 192.168.50.15 "docker exec -i shared-db psql -U postgres -d ckk -v ON_ERROR_STOP=1" < shared-db/sql/grants.sql
```

## 業務ダッシュボード（db 5）

`build-business-dashboards.py` がコレクション「CKK 業務」に **受注・売上 /
生産進捗 / 請求 / 在庫** の 4 ダッシュボード + 25 カードを作る。カードは
native SQL（`metabase_ro`、search_path=app,analytics）で、列別名・状態 enum を
日本語化してある。名前で冪等なので、直したら再実行すれば作り直さず更新する。

**フォルダ構成（維持すること）** — ダッシュボードはコレクション直下、質問
（カード）は各コレクション配下の **`_カード`** サブコレクションに置く（労務側
も同じ構成）。ビルダーは親と `_カード` の両方から名前でカードを探し、見つかった
場所のまま更新する — カードを移動することはない。新規カードは `_カード` へ作る:

```bash
# MB_URL は正規ホストを使う（Metabase は http/LAN の GET を site-url へ 301 する）。
# ビルダーは Cloudflare Access を通るよう通常の User-Agent を送る。
MB_URL=https://bi.ckk-tool.co.jp MB_API_KEY=mb_<admin> MB_DB_ID=5 MB_COLLECTION_ID=6 \
  python3 docker-compose/metabase/build-business-dashboards.py
```

## 労務互換ビューの廃止（2026-08）

労務ダッシュボードは元々 `public.*` の pass-through 互換ビュー経由だったが、
全カード（構造化クエリ）と AI ラボ MCP を `kot.*` / `directory.*` 直参照へ
付け替え、`public.*` の 8 ビューを撤去した（`shared-db/sql/metabase-compat.sql`
が idempotent な DROP に変わっている）。bare 名で書かれた native カードは
`kot_ro` の search_path で解決されるため影響なし。
