# システム全体点検レポート（2026-09-04）

対象: `origin/dev` @ `ea20a749`（main より 45 コミット先。次回昇格に含まれるマイグレーションは
`20261004090000_final_inspection_step` / `20261005090000_approval_steps_no_quantity`）。
方法: 静的検査（テスト・lint・型・i18n）→ 使い捨て DB + 本番ビルドでの実操作 → 領域別のコード監査（10 領域、
各領域は page → Server Action → lib → Prisma を通しで読んで、疑いは必ず該当行を引いて確認）。

## 1. 結論（要約）

- **自動検査はすべて緑。** web 1,870 テスト / kiosk 496 / authz-core 51、Biome、`tsc --noEmit`、i18n 鍵の 3 言語一致（10,274 鍵）、
  用語集の整合、twin ファイル 11 本のバイト一致、`prisma validate`。
- **実操作も通る。** 使い捨て DB + 本番ビルドで 297 画面（一覧 105 + 詳細/編集 192）を巡回して JS エラー・500・
  MISSING_MESSAGE ゼロ。既存の通し確認 4 本（smoke-flows / 検査表+素材 / 出荷+最終検査 19 項目 / 共有端末の検査承認 12 項目）全 PASS。
  未認証アクセスは全 API が 307→/login（`/api/health` と端末シグネチャ POST のみ意図して開放）。
- **ただしコード監査では設計上の穴が複数見つかった。** 「通常操作」は壊れないが、**端（キャンセル済み明細・締日をまたぐ出荷・
  同時操作・マスタ削除・拠点スコープ付きユーザー）で業務ルールが破られる**箇所が領域横断で残っている。
  重大度 High が約 20 件、Medium が約 50 件。単体テストは純関数に厚く、**Server Action の状態遷移と同時実行にはほぼ無い**のが根本原因。

## 2. 横断的に繰り返されるパターン（先に直すと効く順）

| # | パターン | 現れた場所 | 直し方 |
|---|---|---|---|
| P1 | **書き込み Server Action に行スコープ（`rowInScope` / `*InScope`）が無い** — 読みは絞られているのに、番号を知っていれば他拠点・他人の書類を操作できる | 購買 3 ファイル全部（PO/購買依頼/入荷）、設計依頼書の全変更操作、工程実行の全操作（`steps/[stepId]/actions.ts`）、価格表の値引きルール、`/api/intake/source` | `scripts/check-server-action-gates.mjs` を拡張して OWN/PLANT スコープになり得るコードの変更系に `*InScope` 呼び出しを要求する |
| P2 | **状態遷移が check-then-write（`update({where:{id}})`）で、`status` を述語に含めない** — 同時操作で REJECTED→APPROVED、CANCELLED→APPROVED、二重変換が起きる | 特権申請の承認/却下、ユーザー変更依頼、素材発注書の全遷移、購買依頼→PO 変換、単一回答フォーム、端末リンク | `updateMany({ where: { id, status: <期待値> } })` + `count===1` を共通ヘルパに |
| P3 | **「状態を先に変えてから承認フローを開始」** — フロー開始が失敗すると REQUESTED のまま承認依頼行が無く、UI から戻せない | 注文請書・設計依頼書・素材発注書 | フロー開始→状態変更の順にするか 1 トランザクションに |
| P4 | **在庫計上が状態変更と別トランザクション / 冪等でない** | 指示書完了（`onWorkOrderCompleted`）、素材入荷（`onMaterialReceipt`）、製品在庫予約 | `tx` を渡して同一トランザクション化、`referenceId` で冪等化、`inventory_posted_at` を持つ |
| P5 | **マスタ削除ガードが数表しか見ておらず、Prisma の任意リレーション既定 `ON DELETE SET NULL` で参照が黙って消える** | 製品・取引先・支店・拠点・作業場所グループ・素材・承認グループ | DMMF から SET NULL リレーションを列挙する `lib/master-refs.ts` + テスト。原則「参照ゼロのときだけ削除、他は無効化」 |
| P6 | **日付境界が UTC**（採番だけ JST） | 締日処理の窓・弥生の仕訳日付、見積の期限切れ判定、値引き有効期間、入荷日、承認代理の期間 | `todayJst()` / JST 境界ヘルパを 1 つ作って全部そこへ |
| P7 | **UI で選ばせている値をサーバが再検証しない** | 出荷明細の製品≠注文明細の製品、価格試算↔製品の不一致、仕入先が VENDOR か、抽出結果の数量 0/負、richtext 回答、lookup の label | zod の後段に「参照整合」チェックを入れる |

## 3. 領域別の所見（重大度順・要点のみ。行番号は `ea20a749` 時点）

凡例: **H** = 業務データが壊れる / 権限を越えられる、**M** = 端で誤動作・運用で回避可、**L** = 品質・表示。

### 3.1 販売（SA01–SA06）
- **H** `sales/order-acceptances/actions.ts:636-646` — `REQUESTED` へ更新した後に `startApprovalFlow`。フロー開始が失敗（段ゼロのルール一致、再利用番号の古い PENDING、DB エラー）すると承認依頼行の無い REQUESTED になり、承認も編集もキャンセルも通らない（psql のみ）。設計依頼書 `:580-601` も同型。
- **H** `components/sales/quotes/model.ts:58-68` `resolveUnitPriceFromEntries` — `entry.isActive` / `variant.isActive` / `validFrom〜validUntil` を見ない。見積・注文請書の単価解決・価格差異判定がすべてここを通るため、**期限切れのテスト単価や無効化した価格表で値付けされる**。
- **M** `price-lists/actions.ts:436-453` — 保存のたびに tier を `deleteMany`→再作成。`quote_items.price_list_tier_id` は SET NULL なので、価格表を触るだけで過去見積の「適用価格表」が消える。
- **M** `lib/intake-core.ts:74-75,136-137` — AI 抽出の数量 0/負・単価負がそのまま明細に入り、`acceptanceReadiness` も見ないので確定まで通る。
- **M** 設計依頼書の全変更操作にスコープ無し（P1）／ 価格表の値引きルール `update/delete` が所属検証なし ／ `/api/intake/source/[ym]/[seq]` が行スコープ無しで元注文書 PDF を返す ／ 価格試算↔製品の不一致を検証しない。
- **L** tier に当たらない数量が「価格表なし」と同じ扱いになり承認が止まらない、期限切れ判定が UTC、`TAX_RATE` 固定で税区分無視、`issueQuote` の `validUntil` 未検証、zod → checkPermission の順（未認証にバリデーション文言が出る）。
- 確認できたこと: 採番の原子性、明細確定の二重確定ガード、サーバ側の単価再解決、注文請書キャンセル依頼の二重検証、取込の 1 ファイル = 1 行、`safe-expression` の閉じ込め。

### 3.2 購買（PU01–PU04）
- **H** 購買の書き込み Server Action 全部（PO 9 操作・購買依頼全部・入荷）にスコープ検査が無い（読みにはある）。他拠点の PO を番号で発注・完了・キャンセルできる。
- **H** `purchase-orders/actions.ts:576-643` / `material-receipts/actions.ts:66-83` — 入荷行と `COMPLETED` を確定した**後**に `onMaterialReceipt` を別トランザクションで実行、冪等性なし。途中で落ちると PO は完了・在庫は増えない・再試行は「ORDERED でない」で弾かれる。
- **M** `lib/atp.ts:48-52` — ORDERED 明細の入荷予定を `quantity` 全量で数え、部分入荷済み分を二重計上。
- **M** 遷移が `update({where:{id}})`（P2）、REQUESTED 化とフロー開始が別（P3）、購買依頼→PO 変換の二重実行、素材在庫バケットが単位を見ない + 入荷フォームの単位既定が閲覧者の UI 言語（"pcs"/"本"/"支"）、ORDERED の PO を短納で閉じる手段が無く `receivePurchaseOrderItems` に UI 呼び出しが無い。
- **L** 入荷日 UTC、Decimal(12,3) の float 比較、参照価格が ¥/本 と ¥/1000mm を混ぜる、仕入先が VENDOR か未検証、閲覧者言語の文言を notes に保存、PU04 一覧が無スコープ・無上限。
- 確認できたこと: 承認エンジンの条件付き更新、過入荷ガード、合計のサーバ計算、履歴 JSON、purge トリガー。

### 3.3 生産（PD02/PD04/PD05/PD06）
- **H** `lib/inventory.ts` `onWorkOrderCompleted` — MANUFACTURE 完了時に `orderLineId in linkedLineIds` の PRODUCT 予約まで CONFIRMED に倒すため、同一明細を FROM_STOCK + MANUFACTURE に分割して MANUFACTURE が先に完了すると、**FROM_STOCK 側が消費できず新ロットに二重入庫**。
- **H** `lib/workflow.ts:609-619` — 指示書の `COMPLETED` 化が在庫計上と別トランザクションで先。計上が落ちると「完了・在庫ゼロ・巻き戻し不可（在庫計上済み扱い）」。
- **H** `steps/[stepId]/actions.ts:52-57` — 工程の開始/完了/巻き戻し/分岐/検査/計画/実績すべて `checkPermission` のみでスコープ無し。
- **H** `work-orders/actions.ts:873-890` `copyWorkOrder` — 分岐系列・キャンセル工程まで複写し `stepLinks` は複写しない。
- **M** 分岐追加の数量判定がトランザクション外の読みで競合可・COMPLETED の指示書にも追加できる ／ `abortStepExecution` にロック検査が無い ／ 検査記録の必須項目をサーバが強制しない（空でも PASS） ／ 下書き編集で作業計画が消える（Cascade） ／ APPROVED の指示書にキャンセル経路が無く、キャンセルしても予約解放・`lot_number` 解除をしない ／ 巻き戻しが `defectReasons`・検査記録を残す ／ 前工程進行中に開始すると受入数がクライアント値になる ／ 製品在庫予約が冪等でない。
- **L** 設計図の使用中判定が行単位（版単位でない）、`ALLOCATABLE_LINE_STATUSES` に DRAFT、合流の循環を暗黙本流まで見ない。
- 確認できたこと: 開始/完了クレームの原子性、良品のサーバ導出、`branchableQuantity`/`validateRouting` の整合、版採番の advisory lock、ルート版の FOR UPDATE、フロー変更承認の適用後検証。

### 3.4 出荷・請求（SH01–SH03 / BL01–BL02）
- **H** `billing/closings/data.ts:244-261` + `lib/closing.ts:37-40` — 締日より後の出荷が**どの月の窓にも入らず永久に未請求**（窓 = 暦月 1 日〜締日。翌月の走行は翌暦月しか見ない）。さらに手動で月初に締めると同月の残りが `skipped`。
- **H** `delivery-orders/actions.ts:1054-1056` — キャンセル済み明細を出荷・請求できる（`CANCELLED` は `continue` でガードを飛ばすだけで在庫 OUT と請求は進む）。
- **H** `delivery-orders/actions.ts:615-626` — 出荷明細の製品が注文明細の製品と一致するか未検証（別製品を出荷し A の単価で請求）。
- **M** 確定済 DO 2 件で受注残を超えられ、負けた側の納品書は発行済で取り消し経路が無い ／ 締め・仕訳の日付境界が UTC ／ 弥生 CSV に状態ガードも二重出力ガードも無く、締日処理が `EXPORTED` に到達しない ／ オートランが当月しか走らない ／ 出荷が他明細の予約を無視 ／ 過出荷ガードが READ COMMITTED 競合 ／ 出荷前に納品済にできる。
- **L** 請求書の元納品書がレースで価格なし側になり得る、税区分を書類にスナップショットしない、受取先言語 PDF が見出しだけ翻訳、円未満の丸め方針なし、`出荷済み/納品済み` の用語集違反。
- 確認できたこと: 全遷移の条件付き更新、STOCK_STORAGE の請求除外、在庫 OUT の同一 tx、`lineShipStatus`、`combinabilityError`、CSV の貸借一致・RFC4180、DRAFT の PDF 拒否。

### 3.5 マスタ（MS01–MS0E）
- **H** 製品削除ガードが価格表・見積項目しか数えない（`products/actions.ts:330-339`）— 確定済み注文明細・設計図・設計依頼・価格試算の `product_id` が SET NULL で消える。
- **H** 取引先削除で `design_files/product_process_routes.customer_bp_id` が null = **顧客専用図面・ルートが汎用になり他顧客へ配られる**。`billing_bp_id` / `ship_to` / `end_user` / `portal_grants` も未確認。
- **H** 支店削除（見積のみ確認）、拠点削除（在庫・工程・端末・受注拠点が SET NULL）、作業場所グループ削除（許可作業場所 CASCADE・計画/実績 SET NULL）。
- **M** 素材削除で `work_orders.material_id` SET NULL ／ 承認代理の期間がサーバローカル解釈で 9 時間ずれ ／ フローが無効・空グループを指せて依頼が永久 PENDING ／ 承認グループ削除で検査表の承認者制限が「誰でも」に ／ 検査表インポートが `layoutStyle`/`sampleNaming` を落とし zod 精査を通らない ／ 直径・全長の精度未強制 ／ 実行依存の循環を保存できる。
- **L** 支店コードの read-then-write、無効化した直径/全長部品の再利用、spec キーの trim 不一致、`localized()` に生文字列を渡すと 1 文字目だけ返す。
- 確認できたこと: 全操作の権限分割、P2002 の友好化、ロールのソフト削除、依存行の原子的置換、検査表の版ロック、`flow_snapshot` による隔離、`isMemberEffective` ⇄ where の一致。

### 3.6 システム（SY01–SY0H）
- **H** `lib/kiosk-admin.ts:281,361` — `KioskDeviceRow.settingsCode` が全端末分クライアントに渡る（SY09 は `kiosk:READ`）。特権操作 `kiosk_secret.reveal_settings_code` と VIEW 監査を素通り。使っている部品は無いので列を落とすだけ。
- **M** 特権操作の監査行に `grantId`/`bypass` が無い（`elevationAuditNote` を使うのは reveal 系 4 つだけ；カード発行 7 操作・端末 8 操作・カード PDF は無記録）／ 特権申請・ユーザー変更依頼の承認/却下が TOCTOU（P2）／ SY0D の `outcome`/`own` クエリが未検証で Prisma 例外 → 画面 500 ／ SY01・SY09 に埋め込んだログイン履歴が IP・指紋を `user_admin`/`kiosk` で見せる（SY0D は昇格必須）／ `useElevation` が zod 前で走り、入力ミスで時計が動く ／ SY02 の保存が 9 キー全書きで lost update ／ 通知ダイジェストの部分クレームで二重送信 + 件名が ja 固定 ／ SY06 アップロードに明示サイズ上限なし（24MB で黙って切れる）／ `NaN` の tick で毎 ms 走る。
- **L** 端末無効化に承認が要る（登録簿の方針と逆）、設定コードが `Math.random()`、リンクコードの競合、zh が特権文言で落ちる、ディスプレイ保存で英名が消える。
- 確認できたこと: `useElevation` の 1 UPDATE、14 日 CHECK の鏡、peek/use の使い分け、方式 B の適用時再検証と最後の管理者ガード、AES-GCM 秘密箱と平文経路の単一性、取込トークンの timing-safe、ファイル API の traversal 防止。

### 3.7 一般（CM01–CM03）・通知・プロフィール・i18n
- **H** `general/documents/actions.ts:334` — 公開承認 PENDING 中に本文を保存すると `DRAFT` に戻るが承認依頼は残り、承認すると**レビューされていない最新版が公開**される。
- **H** `forms/actions.ts:759-796` — 単一回答フォームの重複判定が tx 外の `findFirst` のみ。同時送信で 2 件になり、片方に到達できない。
- **M** richtext 回答をサーバが `parseRichText` しない（空も必須を通る）／ 関連レコード一覧が `take` 後にフィルタして古い一致を落とす ／ `hasAnyApproval` が前回ラウンドの承認を数えて再編集を閉じる ／ 文書の下書き本文が閲覧者の RSC ペイロードに載る ／ `createFormatters` のキャッシュキーに全 prefs が入っていない（潜在的クロスユーザー）／ 分岐で飛ばした節の回答が保存・集計される。
- **L** lookup の label をクライアントから信用、`2026-02-31` を受け付ける、行コメントの `line`/`threadId` 未検証、`tr()+文字列` の連結 6 箇所、インポートが `checkWindows` を通らない、共有スコープが `take` 後、HIDDEN 回答者が承認通知に出る。
- 確認できたこと: share の union・fail-closed、公開フォームの状態再計算、承認の会員検証、メモの ProseMirror 検証、通知の所有者スコープ、アバターの SVG 拒否 + ヘッダ検査、3 言語 7,321 鍵一致。

### 3.8 共有端末・ディスプレイ
- **M** `step-execution.ts:765`（web `workflow.ts:588` も同型）— 完了クレームの `where` にロック述語が無い。一時停止 → 他端末が完了 → その間に本人が再開、で他人の数量で完了し本人の実績行が閉じられる。
- **M** `setup/confirm`（kiosk・display 両方）— 有効化後、`deviceId`（非秘密）を知っていれば最初に POST した者が 30 日/365 日トークンを得る。`reactivate` は固めたが `confirm` は未対応。
- **M** カード一時停止が生きているセッションを切らない（`getSession` がカード状態を再読しない）／ 端末の失効・無効化・リンク解除が WS を切らず `last_activity_at` を更新し続けてオンライン表示のまま ／ 鍵リセットで attest Cookie が無効化されず、`KIOSK_ATTEST_SECRET` 未設定時は WS 秘密を流用。
- **L** PIN 失敗カウンタが read-modify-write、書き込み経路がセッションを端末に束ねない、heartbeat が `machineId` を null 上書き、COMPLETE に指示書状態ガード無し（現状到達不可）、チケット等がメモリ（単一インスタンス前提）。
- 確認できたこと: 開始/再開の原子ロック、在庫計上の単発性、数量規則の web 同一性、認可順序、48h/2 週/ロック/セッション寿命、attestation の単回 nonce、リンクコードの寿命、WS の無 message ハンドラ、表示内容の保存時・配信時 zod、`kiosk_device_id` の監査記録。
- **ツール不具合**: `tools/docs-screenshots/e2e-kiosk-inspection-approval.ts` は本文が 2 回連結されてコミットされており（`dec508f9`）、そのままでは esbuild が「重複宣言」で落ちる。前半 163 行だけで実行すると 12 項目全 PASS。

### 3.9 DB スキーマ・ジョブ・インフラ
- **H** `shared-db/sql/grants.sql:140-141,184-188` — `metabase_ro` への `GRANT SELECT ON ALL TABLES` + `ALTER DEFAULT PRIVILEGES` が既定で、`app.kiosk_unlock_pins`（退出 PIN の平文履歴）と `app.system_settings`（現行退出 PIN・AI トークン封筒）は REVOKE されておらず、`kiosk_devices.settings_code` は**列許可リストに明示**されている。Metabase から SY0G の承認と監査を素通りで秘密が読める。
- **H** `.github/workflows/nextjs-web-ci.yml` — `prisma migrate deploy` を実行するジョブが無い（差分検査のみ）。壊れたマイグレーションは merge 後に `db-migrate-dev` で初めて落ち、全員を止める（`b322e9db` / `5eabb53b` で実際に 2 回）。
- **M** `check-applied-migrations.sh` の `-- allow-rewrite:` 例外が HEAD の内容で判定され、適用済みの `20261001090000_quote_status_simplify` に印が残ったままなので、次に触ると CI を通って P3006 になる ／ `roles-seed.sql` は CLAUDE.md が「ロールの持ち主」と書くが `db-migrate` は実行せず、`form`/`internal_page` の grant を含まないので**手で流すと 6 つの `*_manager` からそれらが消える** ／ 取込の孤児回収が `rename` で更新されない mtime を見るためローリングデプロイ中に二重登録 ／ intake-gateway の IMAP に timeout・HEALTHCHECK が無く半開で無音停止 ／ 添付書き込み→`\Seen` の順で IMAP 断時に重複 ／ 締日オートラン・ダイジェストにプロセス横断ロック無し。
- **L** 同一タイムスタンプのマイグレーション 3 組（順序は字句順で決定的、今は互いに独立）、po-extract の `baseUrl` 無検証（管理者限定の SSRF）と同時実行上限なし（1 GPU に dev/main が集中し 10 分の再キューと衝突）、`random()` 由来の PIN/設定コード、`grants.sql` の DB 名 `ckk` 固定、`kiosk-cron.sql` の廃止コマンド記載。
- 確認できたこと: purge トリガーが承認 9 種・メモ 11 種・添付 5 箇所を完全に覆う、`approval_flows` CHECK が TS の 9 種と一致、仕様が約束する CHECK/部分ユニークが全部ある、merge 後に書き換えられたマイグレーションは無い、`entrypoint.sh` の順序と失敗時のデプロイ停止、pg_cron の GMT 換算、Realtime は LISTEN/NOTIFY（BullMQ/Valkey は**どこにも無い** — techstack.md の記載は予定）、Dockerfile の standalone + PDF テンプレート追跡、promotion-guard の is-ancestor→merge-tree、po-extract のヘッダ検証と `ai_<kind>` マッピング、gateway の `.part`→`os.replace` とファイル名の無害化。

### 3.10 認証・認可・セキュリティ（横断）
- 2026-09 のセキュリティ監査（PR #737–#745）後の残りとして、致命的なものは無し。API 48 本すべての認可を表にした結果、未認証で通るのは意図した 3 本（`/api/health`、端末シグネチャ POST、トークン認証の `/api/intake/inbound`・`/api/preview/resolve`）のみ。
- **M** `(print)/settings/kiosk-cards/print/page.tsx:54` — QR カード印刷は特権操作 `kiosk_card.print`（PDF 経路は `useElevation`）だが、HTML 印刷ページは `kiosk:READ` だけで同じ QR を描く。SY08 一覧の行にも生のカード ID が載る（マスクはクライアント側）。
- **M** `auth.config.ts:11` — セッションは純 JWT（CLAUDE.md の「DB セッション + 短い JWT」と違う）、`maxAge` 未設定 = 30 日、`is_active` はログイン時のみ確認。利用停止しても、権限不要のアプリ（CM01/CM02/CM03/SY06/SY0G）・プロフィール・通知・`sessionUserId()` だけの Server Action は 30 日間使える。
- **M** `api/attachments/[id]` — フォーム回答の添付が `form:READ`（全業務ロールが持つ）だけで取れ、回答本体の共有スコープ検査を通らない。`form:UPDATE` で他人の回答に添付できる。
- **L** 資格情報ログインのレート制限がユーザー名単位・メモリのみ（IP 横断のスプレーが無制限）、未認証 API が 401 でなく 307（`fetch`/`EventSource` が HTML を受ける）、検査記録/検査表 PDF・指示書印刷・取込元 PDF に行スコープ無し、AI ベース URL の遮断が完全一致（`127.0.0.2` 等が通る、管理者限定）、`DEVICE_SIGNALS_SECRET` が `AUTH_SECRET` へ黙って退避、ポータルの LINK_ONLY リンクが GET 描画で消費される（プレビュー取得で燃える）、SSO 自動プロビジョンが `username` で upsert（同名の既存ユーザーを乗っ取る、IdP が社内管理のため許容）。
- 確認できたこと: `decide()` の和集合・fail-closed、`$queryRawUnsafe` 不使用、`useElevation` の 1 UPDATE と自己承認拒否、open redirect の 4 経路の防御、共有トークンの timing-safe、Cookie 属性、ポータルの別主体・404・DTO 許可リスト、traversal・XSS・Content-Disposition の防御、監査行に秘密が載らないこと、Server Action gate CI の allowlist が実際に委譲されていること。

## 4. 改善計画

### 4.1 すぐ直す（データが壊れる / 権限を越える — 1〜2 週間）
1. **スコープ検査の後付け**（P1）: 購買 3 ファイル・設計依頼書・工程実行・値引きルール・`/api/intake/source` に `*InScope` を入れ、`check-server-action-gates.mjs` で以後を強制。
2. **締日処理の窓**を「前回締日の翌日〜今回締日」にし、締日前の手動締めを拒否、月初のオートランは前月も走らせる。JST 境界へ。
3. **出荷の 3 ガード**: キャンセル済み明細は `GUARD` で拒否、明細製品 = 出荷製品を検証、受注残の計算に CONFIRMED/DRAFT の出荷書を含める + 確定済み出荷書の取消経路。
4. **在庫計上を同一トランザクションへ**（指示書完了・素材入荷）、`referenceId` で冪等化。MANUFACTURE 完了は自分の `workOrderId` の予約だけ CONFIRMED にする。
5. **価格解決に有効性を入れる**（`isActive` × `validFrom〜validUntil`）— 見積・注文請書・価格差異の 3 経路が一度に直る。
6. **承認フロー開始と状態変更の順序/一体化**（注文請書・設計依頼書・素材発注書）。
7. **秘密の露出を閉じる**: `KioskDeviceRow.settingsCode` を削除、`grants.sql` で `kiosk_unlock_pins` / `system_settings` を REVOKE し `settings_code` を列許可から外す。
8. **マスタ削除ガード**: SET NULL リレーションを DMMF から列挙する共通ヘルパ + テスト。それまで製品・取引先・支店・拠点・作業場所グループの削除を「参照ゼロのみ」に。
9. **公開承認中の文書編集**を拒否（または依頼を取り下げ）し、承認対象の版番号を依頼に記録。単一回答フォームは `form` 行ロック内で重複判定。

### 4.2 次に直す（同時操作・運用の穴 — 1 か月）
- 状態遷移ヘルパ `transition(id, from, to)`（`updateMany` + count）を作り、特権申請・ユーザー変更依頼・PO・購買依頼変換・端末リンク・工程完了クレーム（ロック述語）へ適用。
- 特権操作の監査に `elevationAuditNote` を必須化（カード 7・端末 8・PDF）。`useElevation` は zod と存在確認の**後**に。
- 共有端末: カード一時停止でセッション失効、SY09 の失効/無効化/リンク解除を `ckk_kiosk` NOTIFY で WS へ伝え接続を切る、`setup/confirm` にリンクコード所持を要求、attest Cookie に指紋を含める。
- 検査記録の必須項目・richtext 回答・lookup の label をサーバで検証。
- CI に「新規 DB で `migrate deploy` + `entrypoint.sh` の SQL 列」を回すジョブを追加、`allow-rewrite` 例外は base に無いときだけ有効に。
- 取込: 孤児回収は `ctime` か claim 直後の `utimes`、gateway は IMAP timeout + HEALTHCHECK + `(uid, sha256)` の重複排除。オートラン/ダイジェスト/取込ポーラーに `pg_try_advisory_lock`。
- `roles-seed.sql` の役割を決める（migration を唯一の持ち主にして「撮影用」と明記するか、`entrypoint.sh` で流して grant を追随させる）。

### 4.3 構造的な改善（四半期）
- **Server Action の状態機械テスト**: 書類ごとに `transition` 純関数へ抽出し、遷移表 × 同時実行のテストを置く（購買は 0 本、出荷/締日は 0 本）。フロー e2e（`tools/docs-screenshots/*.ts`）を CI 化し、`e2e-kiosk-inspection-approval.ts` の二重連結を直す。
- **日付の単一ヘルパ**（`todayJst` / JST 境界）と、**書類へのスナップショット**（税区分・税率・通貨）。
- **ATP と請求の設計見直し**: 顧客ごとの「請求済み到達点」カーソル、部分入荷 UI と短納クローズ、`EXPORTED` の実装または仕様からの削除、`payment_day` / `billing_bp_id` の実装。
- **twin ガードの拡張**（`qr.ts` / `crockford.ts` / `ws-auth.ts`）と、両アプリの完了クレーム述語を検査する不変条件テスト。
- **BI の既定を隠す側に**（`ALTER DEFAULT PRIVILEGES` を廃し allow-list か `bi` スキーマ）、秘密を `system_settings` から専用表へ。
- 仕様の追随: `lib/journal.ts`・BullMQ/Valkey・`material_purchase_approvers`・`api/pdf/purchase-order` は未実装のまま仕様に残っている。

## 5. 実施記録
- 静的検査: `pnpm test` / `pnpm lint` / `pnpm typecheck` / `i18n:keys` / `i18n:glossary`（web）、`pnpm test` / lint / `tsc`（kiosk）、authz-core、`prisma validate`。
- 実操作: `tools/docs-screenshots` の使い捨て DB（`docs:seed`）+ `next build` + `next start :3100` / kiosk `:3101`。巡回スクリプトは使い捨て（コミットしていない）。
- コード監査: 領域別 10 本（販売 / 購買 / 生産 / 出荷・請求 / マスタ / システム / 認証・セキュリティ / 一般・通知 / 共有端末・ディスプレイ / DB・ジョブ・インフラ）。各 High は本レポート作成時に該当行を再読して確認した。
- 点検時点ではコードを変更していない。その後の修正は §6。

## 6. 修正の実施（2026-09-04〜05）

点検後、High 全件と Medium の大半を PR に分けて dev へ入れた（すべて CI 通過後に merge commit で取り込み。main への昇格は行っていない）。

| PR | 内容 | 直した所見 |
|---|---|---|
| #804 | 刻みの NaN ガード・共有端末 e2e の二重連結・cron 手順の記載 | 3.6 F10 / 3.8 ツール / 3.9 L |
| #805 | ATP の部分入荷二重計上・取込クレームの mtime・allow-rewrite の再利用防止 | 3.2 F3 / 3.9 M |
| #806 | 書き込みの行スコープ（工程実行・値引きルール・取込元 PDF・検査 PDF）、`settingsCode` の露出、カード印刷の承認ゲート、`grants.sql` の秘密 REVOKE、SY0D のクエリ検証 | 3.3 F3 / 3.1 F6-F8 / 3.6 F1, F4 / 3.9 H / 3.10 M |
| #807 | 指示書完了の在庫計上を同一 tx に・予約 CONFIRMED の範囲・完了クレームのロック述語（web+kiosk）・abort のロック検査・複製の分岐除外・予約の冪等化 | 3.3 F1, F2, F4, F6, F12 / 3.8 F1 |
| #809 | 価格表の有効性（isActive × 期間）・承認開始→状態変更の順序・抽出値の検証・tier の差分更新 | 3.1 F1-F4 |
| #810 | 出荷ガード（キャンセル済み明細・製品一致・確定済み出荷書の残数・FOR UPDATE）、締日の請求期間を (前回締日, 今回締日] + JST、月初の前月オートラン、弥生 CSV の状態/二重ガード | 3.4 F1-F7, F9, F10 |
| #811 | CI にまっさらな DB への `migrate deploy` + grants + analytics + 差分ゼロ検査、メール取込の IMAP timeout + HEALTHCHECK | 3.9 H, M |
| #812 | 購買の書き込みスコープ・入荷計上の同一 tx と冪等化・遷移の条件付き更新・変換の二重防止・素材単位の一致・入荷日 JST | 3.2 F1, F2, F4-F6, F8 |
| #813 | セッション 12 時間・利用停止を 1 分以内に反映・未認証 API は 401・端末シグネチャ鍵の退避停止・フォーム回答添付の共有スコープ | 3.10 M ×4, L |
| #814 | カード一時停止でセッション失効・`ckk_kiosk` NOTIFY で WS 切断・attest Cookie に指紋・PIN 失敗の原子的加算・heartbeat の null 上書き | 3.8 F3-F6, F8 |
| #815 | 特権申請・ユーザー変更依頼の条件付き更新・`useElevation` を検証後に・特権監査に grantId・設定コードの CSPRNG・リンク競合・文書の承認中編集拒否と版の記録・単一回答の行ロック・richtext 検証 | 3.6 F2, F3, F6, F12, F13 / 3.7 F1-F3 |
| #816 | ダイジェストの部分クレーム・件名の言語・SY02 の差分保存・SY06 の 20 MB 上限・po-extract の baseUrl 検証と同時実行上限 | 3.6 F7-F9 / 3.9 L ×2 |
| #817 | マスタ削除ガードを `lib/master-refs.ts` に集約（SET NULL 参照の網羅テスト付き）・実行依存の循環拒否・空/無効グループのフロー拒否・代理期間の JST | 3.5 F1-F9, F12 |
| #818 | 設計依頼書の変更系に行スコープ | 3.1 F5 |
| #819 | `roles-seed.sql` が後発 grant を消さない・SY01/SY09 埋め込みログイン履歴から IP/指紋を落とす | 3.6 F5 / 3.9 M |
| #820 | 端末無効化を承認なしに・ディスプレイ英名の保持・特権文言の zh | 3.6 F11, F14, F15 |
| #821 | 生産の Medium 後続（分岐追加の tx 内再検証と状態ガード・検査必須項目のサーバ強制・下書き編集で計画を残す・APPROVED のキャンセルと予約解放・巻き戻し時の検査記録・受入数の権威・DRAFT 明細の割当除外・設計図の版単位ロック） | 3.3 F5, F7-F11, F13, F14 |
| #822 | 販売・フォームの Medium 後続（見積の有効期限検証と値引き上限・期限切れの JST・tier 無しの区別・税区分・lookup の再解決・分岐で飛ばした回答の除去・関連レコードの絞り込み・再申請ラウンドの承認判定・文書下書きの非公開） | 3.1 F9, F10, F13, F14 / 3.7 F4-F6, F8, F9 |

**再検証（merge 後の dev）**: #820 時点で lint / tsc / vitest（web 1,940・kiosk 504）/ i18n 鍵一致 / 両アプリのビルド — 緑。#822 まで入った最終の dev でも vitest（web 1,959・kiosk 508）と tsc は緑。使い捨て DB + 本番ビルドで 293 画面の巡回、既存の通し確認 4 本（smoke-flows / 検査表+素材 / 出荷+最終検査 / 共有端末の検査承認）— すべて PASS（smoke-flows は同じ DB で 2 回目に走らせると「列を隠せる」が落ちる — 1 回目で保存した列設定が残るためで、テストの状態依存）。

**未対応（改善計画 §4 に残す）**: 出荷が他明細の予約を無視（3.4 F8）、税区分・税率の書類スナップショット（スキーマ変更が要る）、受取先言語 PDF の明細ラベル、円未満の丸め方針、購買の部分入荷 UI と短納クローズ、共有端末 `setup/confirm` のリンクコード要求、gateway の `(uid, sha256)` 重複排除、締日オートラン/ダイジェストの advisory lock、SSO 自動プロビジョンの `username` upsert、資格情報ログインの IP 単位レート制限。

**運用メモ**: #813 で既存 JWT は最長 12 時間で失効（全員が一度再ログイン）。#814 の `ckk_kiosk` NOTIFY は web と kiosk の両方がデプロイされてから効く。#816 の po-extract は Coolify の再デプロイ後に `/healthz` と抽出 1 件で確認すること。#811 の CI job は PR ごとに約 40 秒。
