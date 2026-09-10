# 外部 API（`/api/v1`）

社外のシステムが業務データを機械的に読むための口。**この文書は設計意図**であり、
実装の正は `coolify/apps/nextjs-web/src/app/api/v1/` と `src/lib/api-*.ts`。

いまは**読み取りだけ**。書き込みは §8 の規則を先に決めてあり、あとから足しても
読み取りの形が変わらないようにしてある。

---

## 1. なぜアプリの中に置くのか

業務規則は `src/lib/*` にある（`numbering.ts` / `workflow-core.ts` /
`order-acceptance-price-core.ts` / `work-order-alloc-core.ts` / `inventory.ts`）。
別サービスにすると、規則を写して**黙って食い違う**か、DB を直に読んで規則を
迂回するかのどちらかになる。だから同じアプリの中に置き、同じ関数を通す。

キオスク（`nextjs-kiosk`）が twin file で規則を複製しているのは、あちらが
**別のアプリとして独立に動く必要がある**（現場のタブレットが Web の障害で
止まってはいけない）ため。外部 API にその要求は無い。

## 2. 認証 — 主体は `app.users` の行

`app.api_clients` の 1 行が `app.users` の 1 行（`group = SYSTEM`）に 1:1 で
対応する。**主体がユーザーそのものなので、`user_permissions` →
`decide()` → `Access`（拠点スコープ）→ `audit_logs.user_id` が全部そのまま効く。**
認可の仕組みを 2 つ目に増やさない。

取引先ポータル（`portal_accounts`）とは**逆の判断**である点に注意。あちらの主体は
社外の人で、`app.users` では表現できない（社員ではない）から別立てにした。
こちらは機械だが「社内の権限体系の中の 1 主体」として表現できるので、増やさない。

### 2.1 それでも Auth.js には**絶対に**相乗りしない

`lib/portal-auth.ts` の冒頭が書いている通り、`sessionUserId()` が非 null を返すと
`auth.config.ts` の `authorized` / `requireAppRead` / `shareAccessFor` /
`audit.ts getCurrentActorId` が**全部「社員がログインしている」と解釈する**。

API は Cookie を一切設定せず `auth()` を一度も呼ばないので、この 4 つは
**1 行も触らずに fail-closed になる**。認証は `lib/api-auth.ts` の Bearer
トークンだけが行う。

### 2.2 トークン

```
Authorization: Bearer <43 文字の base64url>
```

`randomBytes(32).toString("base64url")`（256bit）。DB は **sha256 のみ**
（`api_client_tokens.token_hash`）。生値は発行時の応答に 1 度だけ現れ、
どこにも保存されない — `portal_document_links` / `portal_sessions` と同じ規約。

**1 クライアントにつき有効なトークンは 2 本まで。** 差し替え時に無停止で
入れ替えるため。3 本目は発行アクションが拒否する。

### 2.3 拒否は**全部同じ 401**

未提示 / 形式不正 / 未知 / 失効済み / 期限切れ / クライアント無効 / 期限切れ /
IP 範囲外 / 背後のユーザーが利用停止 — **どれも同じ本文の 401** を返す。

理由を出し分けると「そのトークンは存在するのか」が外から読めてしまう。
とくに **IP 範囲外を 403 にしない** — 403 は「トークンは正しい」を確定させる。
真の理由は `api_access_logs.deny_reason` にだけ残る。

タイミングだけは完全には塞げない（存在する方が 1 行ぶん多く働く）。
緩和は「1 クエリで済ませる」「認証段階で権限もスコープも引かない」
「送信元 IP ごとに失敗を数えて締める」の 3 つで、塞ぎ切ったとは書かない。

### 2.4 `timingSafeEqual` はここでは**使わない**

`lib/shared-token.ts` の `tokenMatches` は、メモリ上の**固定の秘密**と突き合わせる
ためのもの（`INTAKE_INBOUND_TOKEN` など）。あそこで素の `===` を使うと、
1 バイトずつ探る神託になる。

こちらは秘密を比較しない。`sha256(生値)` を計算して**ダイジェストで索引を引く**。
索引の探索時間はダイジェストの関数で、sha256 は原像計算困難だから、攻撃者は
ダイジェストを目標へ寄せられない。前方一致の神託が存在しないので
`timingSafeEqual` を足しても何も守らず、「この索引引きは危ないのか」と
次に読む人を誤解させるだけになる。

## 3. 認可

`lib/api-authz.ts` の `requireApiPermission(ctx, code, action)`。中身は
**キオスク側のアダプタと同じ形** — `buildPermissionSet(loadPermissionRows(...))`
+ `loadScopeContext` + `decide` を `@ckk/authz-core` から直接呼ぶ。
`checkPermission()`（= Web 用・セッション前提）は呼ばない。

返る `Access` で行レベルのスコープを掛ける（`ownOrPlantWhere` / `rowInScope`）。
**画面と同じ関数を使う** — ここを別に書くと API と画面で見える範囲がずれる。

権限コードは業務の粒度より粗い。API の資源名に合わせて新しいコードを作らない:

| 資源 | コード |
|---|---|
| 注文請書・注文明細 | `order_acceptance` |
| 指示書・工程 | `work_order` |
| 見積書 | `quote` |
| 出荷書 / 納品書 / 請求書 / 締日処理 | `delivery_order` / `delivery_note` / `invoice` / `billing_closing` |
| 取引先・製品・素材・材種・拠点・保管場所 | `master` |
| 製品在庫・素材在庫・在庫取引 | `inventory` |

### 3.1 共有（`share_grants`）は主体に**当たる**

主体が本物のユーザーなので、`share_grants` の `EVERYONE` 行は API クライアントにも
一致する（`lib/share-grants.ts`）。`form` / `internal_page` の READ を与えると
「全員に共有された文書」が見える。**これは「主体をユーザーにする」判断の代金**で、
仕様である。要らないならその 2 コードを与えない。

### 3.2 承認と特権操作は API から**できない**

承認は人の判断であり、押せるトークンは SY0G を無効化する。特権アクセス
（`kiosk_secret` / `personal_data` ほか）も同じ。v1 では口を作らない。

## 4. 誤りの表し方 — RFC 9457

```json
{ "type": "/problems/forbidden", "title": "Forbidden", "status": 403,
  "code": "forbidden", "detail": "requires quote:CREATE", "instance": "/api/v1/quotes" }
```

- `type` と `code` は**公開契約**。改名しない。呼び出し側は `code` で分岐する。
- **本文は英語で固定し、翻訳しない。** 機械向けの契約に、閲覧者ごとに変わる
  人間向けの文章を混ぜない（`_specs/i18n-glossary.md` §1 の対象外）。
- 401 には `WWW-Authenticate: Bearer` を必ず付ける（RFC 9110 §11.6.1）。

## 5. 一覧の返し方 — keyset のみ

```json
{ "data": [ … ], "page": { "nextCursor": "…", "hasMore": true },
  "syncedAt": "2026-09-10T04:11:52.881Z" }
```

**`OFFSET` は使わない。** 読んでいる最中に行が増えると、`OFFSET` は黙って行を
飛ばす。しかも呼び出し側からは飛んだことが分からない。

カーソルは不透明な文字列で、中身は `(updated_at, id)` の組。
**書類（複合キー）は `(updated_at, year_month, seq)`** — 書類番号は導出値で
列に無い。時刻だけでは同一ミリ秒の行が落ちるので、必ず組で持つ。

`syncedAt` は**同じクエリの中で DB の時計から採る**。呼び出し側の時計から
作らせると、ずれた分の行が永久に失われる。次回は これを `?updatedSince=` に
そのまま渡す。

### 5.1 `updated_at` は DB が維持する

`@updatedAt` は Prisma Client を通る書き込みしか更新しない。psql・
`$executeRaw`・マイグレーションの backfill を通ると更新されず、差分同期が
黙ってその行を飛ばす。だから **`BEFORE UPDATE` トリガーを置いて DB を正にする**
（`@updatedAt` は無害な二重化として残る）。

### 5.2 差分同期に載せられない表

| 表 | 理由 | 出し方 |
|---|---|---|
| `work_order_steps` | `updated_at` も `created_at` も無い | 指示書の子資源。親が動いたら出し直す |
| `*_items`（明細） | 時刻列が無い | ヘッダに埋め込む。単独の一覧にしない |
| `inventory_transactions` | `created_at` だけ — **だが不変の台帳なので正しい** | `(created_at, id)` |

### 5.3 削除は差分同期から**見えない**

行の物理削除は `updated_at` を動かさないし、痕跡も残らない。ただし
アプリ内の物理削除は **下書きの出荷書 1 つだけ**（`deleteDeliveryOrder`）で、
それは監査行を書く。他は状態で表す（`order_lines.cancelled_at`、マスタの
`is_active`）。

そこで `GET /api/v1/deletions?sinceEventId=` を `audit_logs` から出す。
`audit_logs.id` は単調増加の BigInt なので、そのままカーソルになる。
**psql から直に消した行は観測できない** — これは仕様として明記する。

## 6. 値の形

| 対象 | 返し方 |
|---|---|
| 識別子 | 書類番号（`ORD-202609-00042`）。画面・印刷 QR と同じ公開識別子 |
| 状態 | DB の enum 値そのまま（`CONFIRMED`）。日本語ラベルは返さない |
| 多言語列 | `{ "ja": "…", "en": "…" }` の生 JSON。`localized()` を通さない |
| 金額 | 数値（文字列にしない）。通貨は別フィールド |
| 日時 | RFC 3339 UTC。表示設定（利用者ごとの書式）は通さない |

ラベルも書式も**閲覧者ごとに変わる**もので、API には閲覧者が居ない。

## 7. 環境と公開

`src/config/dev-features.json` の `api` で閉じる。`main` に出すには PR が要る。
`APP_ENV` に入っていない環境では、この配下は**全部 404**（401 ではない） —
無い機能の存在を知らせない。

`src/proxy.ts` の matcher から `api/v1(?:$|/)` を**アンカー付きで**外す。
素の `api/v1` と書くと将来の `/api/v1beta` まで未認証になる（`api/intake` を
広く書いて `/api/intake/upload` の認証を外した前例と同じ罠）。

## 7.1 資源の登録簿と OpenAPI

口の一覧・必要な権限・並び順は `lib/api-resources.ts` の 1 本が正で、
`GET /api/v1/openapi.json`（要認証）はそこから組み立てる。**手書きの文書を
別に持たない** — 2 つ書けば必ず離れる。`api-resources.test.ts` が
`src/app/api/v1/**` の実ファイルとの一致を機械で確かめるので、口を足して
登録簿に書き忘れる（あるいはその逆）と CI が落ちる。

外部の依存は足していない。zod 4 には `z.toJSONSchema()` があるが、応答の
全フィールドを zod で二重定義すると DTO と離れるので使っていない。文書が
約束するのは**封筒・引数・誤り・どの口に何の権限が要るか**まで。

## 8. 書き込み（未実装・規則だけ先に決める）

1. **ルートハンドラは `prisma.x.create` を呼ばない。** Server Action が呼ぶのと
   同じ `lib/` の関数を呼ぶ。Action の中に直書きされている論理は、先に
   `lib/` へ出す（`purchase-intake.ts` / `-core.ts` の分け方が手本）。
2. **`Idempotency-Key` を必須にする。** 採番は `allocateDocumentKey()` の
   月次リセット連番なので、webhook の再送で `ORD-` が 2 本立つと取り返しがつかない。
   鍵・要求のハッシュ・応答を保存し、同じ鍵の再送には保存した応答を返す。
3. **`If-Match`（または `expectedUpdatedAt`）→ 409。** 数分前に読んだ機械の
   last-write-wins を許さない。
4. 承認・特権操作は口を作らない（§3.2）。
