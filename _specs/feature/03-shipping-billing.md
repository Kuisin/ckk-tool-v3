# Shipping / Delivery / Billing

## §8 出荷・納品

### 機能概要

出荷書・納品書の作成。在庫保管 or 発送の分岐。ユーザー直送 or 通常納品。

### 画面

| パス | 内容 |
|------|------|
| `/shipping/delivery-orders` | 出荷書一覧 |
| `/shipping/delivery-orders/new` | 出荷書新規作成 |
| `/shipping/delivery-orders/[id]` | 出荷書詳細 |
| `/shipping/delivery-orders/[id]/edit` | 出荷書編集 |
| `/shipping/delivery-notes` | 納品書一覧 |
| `/shipping/delivery-notes/new` | 納品書新規作成 |
| `/shipping/delivery-notes/[id]` | 納品書詳細 |
| `/shipping/delivery-notes/[id]/edit` | 納品書編集 |

### 主要機能

- 出荷書作成: 在庫分・製造完了分の品目・数量・出荷先
- 出荷タイプ: `STOCK_STORAGE`（在庫保管）/ `DISPATCH`（発送）
- 在庫保管: 予備製作分。請求フロー外。在庫台帳を確定更新
- 発送記録: 会計連携（§9）のトリガ
- 納品書採番: `DRN-YYYYMM-NNNNN`（`lib/numbering.ts`）
- 納品書 PDF 生成: `app/api/pdf/delivery-note/route.ts` → Gotenberg
- 配送方法分岐:
  - `DIRECT_TO_USER`: 完了書に価格記載なし、納品書は受注先経由で別送
  - `NORMAL`: 受注先へ発送、納品書同梱
- `include_price` フラグ: 納品書に価格を記載するか制御
- 出荷書 PDF 生成: `app/api/pdf/delivery-order/route.ts`

### 業務ルール

- 出荷対象: §4 在庫分または §7 全工程完了分
- 在庫台帳の出荷確定更新は発送時（在庫保管は別処理）
- 在庫保管分は請求フロー（§9）の対象外

### 過不足納品

受注 100 本に対して 98 本しか出来なかった / 端数で 102 本になった、をそのまま
納品できるようにする仕組み。以前は受注数量が出荷の上限で、下回る出荷は必ず
「一部出荷」（= 残りが後から出てくる）扱いだったので、現場は受注数量を書き
換えるか、決して埋まらない残数を抱え続けるしかなかった。

**3 つの主体がそれぞれ別のことを決める。どれか 1 つでも欠けると過不足出荷に
ならない。**

| 決める人 | 置き場 | 決めること |
|---|---|---|
| 生産 | 指示書 `allow_quantity_variance`（PD12/PD22） | このロットを過不足のまま出してよいか（**唯一の可否スイッチ**） |
| 商流 | 取引先マスタ `delivery_tolerance_*`（MS01・顧客ロール） | どこまでのずれなら受け取るか（% or 数量 × 不足側 / 超過側） |
| 商流 | 取引先マスタ `variance_approval_within` / `_outside` | ずれたとき決裁を挟むか（**範囲の内と外で別々**） |
| 出荷 | 出荷書 `closes_order_lines`（SH01） | この出荷で注文明細を締めるか（不足分をもう出荷しない宣言） |
| 出荷 | 出荷書 `billing_price_mode`（SH01） | 請求単価を受注時のまま使うか、実納品数で価格表を引き直すか |

- **判定は `lib/delivery-variance-core.ts` が唯一の定義元**（純ロジック・試験あり）。
  画面もサーバーも必ずここを通す。DB 側から数字を集めるのは
  `lib/delivery-variance.ts`。
- **数える相手は「その注文明細の累計納品数」**（他の出荷書のぶんを含む）で、
  出荷書 1 通の数量ではない。50 + 48 と分けて出したとき 2 通目だけを見て
  「52 本不足」と言っても、顧客との約束とは関係が無い。
- **範囲の外は「禁止」ではなく「既定で決裁が要る」。** 禁止したいときは指示書の
  許可を出さない。`variance_approval_outside` を降ろすと範囲外も素通りする
  （範囲の設定が意味を失う設定なので既定にしない）。
- **不足と一部出荷は数量では見分けが付かない。** 締めるかどうかは
  `closes_order_lines` の宣言だけが決め、それが無ければ従来どおり
  `PARTIAL_SHIPPED` のまま残る。超過は宣言を待たずに `SHIPPED`（出す残りが無い）。
- **承認は出荷書そのものに付く**（`approval_requests.target_type = 'delivery_orders'`）。
  確定を押した時点で必要と判定されたときだけ依頼が出て、出荷書は下書きのまま
  `approval_status = PENDING` で待つ。承認設定（MS0B）に段が 1 つも無ければ
  素通し（`work_order_flow_changes` と同じ規約）。
- **請求単価は確定時に `delivery_order_items.unit_price` へ焼き込む。** 以後
  価格表を直しても発行済みの納品書・請求書は動かない（`invoices.tax_rate` と
  同じ考え方）。読み側の唯一の定義元は `billableUnitPrice`
  （`billing/closings/data.ts`）で、締日画面の予定額と発行後の請求額が同じ
  数え方になる。

---

## §9 会計・請求

### 機能概要

締日処理、請求書生成、会計連携（仕訳 CSV エクスポート）。承認は 2 か所
（発行前・入金前）、いずれも MS0B（承認設定）に段が無ければ素通し。

### 画面

| パス | 内容 |
|------|------|
| `/billing/invoices` | 請求書一覧（一括: 発行 / 入金依頼 / 承認・差し戻し） |
| `/billing/invoices/new` | 手動請求 (BL11) — 顧客を選び、未請求出荷から臨時の請求書を作る |
| `/billing/invoices/[id]` | 請求書詳細（承認カード・追加費用パネル込み） |
| `/billing/closings` | 締日処理一覧 |
| `/billing/closings/[id]` | 締日処理詳細 |

### 主要機能

- **締日処理は「指定日（既定=今日）」で一括実行する**（旧・対象月選択は
  廃止）。指定日までに締日が到来し、まだ締めていない顧客すべての未請求出荷
  を集計し、締日が到来している行はそのまま請求書（下書き）まで作る
  （`lib/closing.ts` `runClosingBatch` / `src/components/billing/closings/model.ts`
  `scheduledClosingDates`）。何か月分の走らせ忘れも 1 回の実行で拾う
  （旧「月初 3 日だけ前月も見る」特例は不要になった）。
- **手動請求 (BL11)** — 締日を待たず、選んだ出荷から臨時の請求書（下書き）を
  作る。`billing_closings.kind = MANUAL` の行が 1 本残る（定期実行の行は
  `SCHEDULED`）。明細組み立て・税計算は締日処理と**同じ関数**
  （`lib/invoice-generation.ts`）を通るので、締め方によって請求額が変わらない。
- 請求書採番: `INV-YYYYMM-NNNNN`（`lib/numbering.ts`）
- 請求書 PDF 生成: `app/api/pdf/invoice/route.ts` → Gotenberg
- 会計連携 CSV エクスポート: `app/api/export/accounting/route.ts` → `lib/accounting-export-core.ts`
  （列の並び・文字コード・既定の科目コードは SY0J 会計連携 = `lib/accounting-settings.ts`）
- 仕訳生成: `lib/accounting-export-core.ts`（CSV の組み立てと一体。独立した `lib/journal.ts` は無い）
- 請求書ステータス: `DRAFT → ISSUED → SENT → PAID`
- 締日処理ステータス: `PENDING → PROCESSED → EXPORTED`
- **下書きへの追加費用** — 料金マスタ（MS0G）からだけ選べる。出荷書由来の
  行と違い、人が金額を決めて足すので**発行前に承認が要る**（下の承認節）。
  `invoice_items.charge_item_id` が入り `delivery_order_year_month` が無い行が
  手動費用（`saveInvoiceCharges`、`ChargesPanel` — 指示書・出荷書と共用）。
  編集できるのは下書きのうちだけ。足す/消すたびに承認状態は `NONE` に戻る。
- 一覧の一括操作（`InvoiceTable`）— 発行 / 入金依頼 / 承認・差し戻し。
  1 件ずつ独立に処理し（`processClosings` と同じ規約）、承認が要る請求書も
  対象から外さない（何が止まったかは失敗一覧に出す）。

### 承認（MS0B の承認対象種別）

| 種別 | いつ通るか | 適用 |
|---|---|---|
| `invoices` | **追加費用ありの請求書だけ**、発行前（DRAFT） | 承認は発行を「できるようにする」だけ。発行そのものは利用者が押す（自動発行しない） |
| `invoice_payments` | 入金前（SENT） — 追加費用の有無に関わらず全件 | 承認完了で**そのまま入金済みへ**進める（`work_order_flow_changes` と同じ「承認で適用」） |

どちらも MS0B に段が 1 つも無ければ素通し（既存の規約と同じ）。承認依頼は
`issueInvoice` / `markPaid` を押した時点でサーバーが自動で作る — 「承認を
依頼する」ボタンは無い（`delivery_orders` の過不足納品承認と同じ作法）。

### 業務ルール

- 締日処理トリガ: §8 の発送記録
- 会計連携: 締日処理完了後に CSV エクスポート
- エクスポート済みフラグ: `accounting_exported_at` で管理（二重エクスポート防止）
