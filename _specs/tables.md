## Tables (Database)

> **この文書はデータモデルの設計意図**であり、**実装の正ではない**。
> 実装の正は `shared-db/prisma/schema/*.prisma`（PG スキーマごとに 1 ファイル）で、
> マイグレーションも `shared-db` が持つ。列の型・既定値・索引を確かめるときは
> 必ずスキーマを見ること。
>
> 以下は現在の差分（実装と突き合わせて確認済み）。
>
> **仕様にあるが実装されていない（3）** — 設計だけで作られていない:
> `system_logs` / `ad_sync_logs` / `material_purchase_approvers`
> （DB にも存在しない。使う前に作る必要がある）
>
> ※ `system_logs` のうち **LOGIN の部分だけは `login_attempts` として実装済み**
> （下記 Security 節）。残り（PDF ダウンロード等の操作記録）は未実装のまま。
>
> **実装にあるが本書に未記載（32）** — 後から足した機能の分:
> - `directory.prisma`: `employee_directory` / `ldap_sync_log`
> - `intake.prisma`: （`order_lines` は本書に記載済み）
> - `inventory.prisma`: `storage_locations` / `storage_shelves`
> - `master.prisma`: `currencies` — 100 円基準の換算マスタ（rate_per_100_jpy =
>   100 円で買えるその通貨量。JPY = 100）。shared-db スタックの fx-rates が日次自動更新。
>   書類・製品の `currency` 列（products / quotes / order_acceptances / invoices に
>   追加。既定 'JPY'、FK なし — 既存 price_list_entries.currency と同じ規約）が指す。
>   レートは手動更新の分析用換算（会計処理用ではない）。注文明細はヘッダから読む。
> - `kiosk.prisma`: `kiosk_cards` / `kiosk_device_locations` / `kiosk_device_logs` / `kiosk_devices` / `kiosk_floor_maps` / `kiosk_link_requests` / `kiosk_sessions`
> - `notification.prisma`: `notifications` / `push_subscriptions` / `user_notification_settings`
> - `product-routes.prisma`: `product_process_route_version_steps` / `product_process_route_versions` / `product_process_routes`
> - `production-master.prisma`: `work_location_groups` / `work_locations`
> - `production.prisma`: `work_order_step_actuals` / `work_order_step_plans`（`work_order_order_lines` は本書に記載済み）
> - `purchase.prisma`: `purchase_request_items` / `purchase_requests`
> - `sys.prisma`: `document_attachments` / `document_memo_revisions` / `document_memos` / `file_folder_grants` / `link_blacklist` / `link_index` / `user_home_settings`
>
> 追記する場合は、スキーマからコピーせず**設計意図だけ**を書くこと。

**営業担当（sales_rep_id）は書類ごとのスナップショット** — 顧客が持つ担当候補は
`bp_sales_reps`（CUSTOMER ロール固有・複数可・主担当 1 名）で、書類側は
`sales_rep_id` に**作成時点の 1 名を複写**する（`estimates` / `price_list_entries` /
`quotes` / `order_acceptances` / `delivery_notes` / `invoices`）。
顧客マスタの担当が替わっても過去書類の担当は動かない。既定値の決め方は
`lib/sales-rep.ts` `resolveSalesRepId()` が唯一の定義 — 明示指定が最優先、無ければ
**顧客が変わったときだけ**その顧客の主担当を入れる（顧客据え置きで空 =
利用者が意図的に外した、とみなして戻さない）。注文明細（`order_lines`）と
**出荷書（`delivery_orders`）は列を持たず**、明細の注文明細 → 注文請書ヘッダの
担当を読む（複数の注文請書を束ねた出荷書では複数になり得る — 表示は導出値）。
納品書は出荷書の導出担当が 1 人に定まればそれを、請求書も対象出荷の導出担当が
1 人に定まればそれを引き継ぐ。

### Auth
```
Table users {
  id              uuid [pk]
  group           USER_GROUP
  employee_id     uuid [unique]  // only for employees（nullable: system/guest）
  username        varchar  // AD[uid]
  display_name    varchar  // AD[lastNamePhonetic], AD[firstNamePhonetic] - AD[lastName] AD[lastName]
  email           varchar  // AD[email]
  // プロフィール写真（アプリ内でアップロード。AD からは取得しない）
  // 正方形に切り抜いて 2 サイズ保存: 大 512px / 小 96px（一覧・履歴用）
  avatar_file_id       uuid [ref: > files.id]
  avatar_thumb_file_id uuid [ref: > files.id]
  is_active       boolean
  last_login_at   timestamp
  created_at      timestamp
  updated_at      timestamp
}

Enum USER_GROUP {
  SYSTEM,
  EMPLOYEE,
  GUEST
}

Table roles {
  id              serial [pk]
  is_system       boolean
  rolename        varchar  // only alphabet, number and symbol allowed
  display_name    json  // { ja: '', en: '' }
  description     json  // { ja: '', en: '' }
}

Table user_role_relation {
  user_id         uuid      [not null]
  role_id         numeric   [not null]

  is_active       boolean
  assigned_at     timestamp
  deactivate_at   timestamp

  assigned_by     uuid

  indexes {
    (user_id, role_id) [pk]
  }
}

Table permissions {
  code            varchar [pk]  // invoice, sales...
  display_name    json  // { ja: '', en: '' }
  description     json  // { ja: '', en: '' }
}

Table role_permission_relation {
  role_id         numeric
  permission_code varchar
  action          ACTION
  scope           SCOPE
  // grant のスコープ対象コード（default '{*}'）。
  //   PLANT:  '*' = 所属拠点（user_plants）全部 / plants.code 列挙 = 列挙 ∩ 所属
  //   REGION: '*' = 所属拠点の地域の全拠点（再交差なし）/ regions.code 列挙 = その地域の全拠点
  //   ALL/OWN では無視。解決は packages/authz-core decide()
  scope_values    "text[]" [default: '{*}']

  indexes {
    (role_id, action, permission_code) [pk]
  }
}

// ユーザーの所属拠点（多対多）— PLANT/REGION スコープ解決の基盤。
// 管理 UI: /settings/users/[id]（system:ADMIN）
Table user_plants {
  user_id         uuid [not null, ref: > users.id]
  plant_id        int  [not null, ref: > plants.id]
  assigned_at     timestamp
  assigned_by     uuid [ref: > users.id]

  indexes {
    (user_id, plant_id) [pk]
  }
}

Enum ACTION {
  // CRUD
  READ,
  CREATE,
  UPDATE,
  DELETE

  // Extended
  EXPORT,
  APPROVE,
  ADMIN
}

Enum SCOPE {
  ALL
  REGION
  COUNTRY
  PLANT
  DEPARTMENT
  TEAM
  SUB
  OWN
}

// 有効ロール経由の「全 grant 行」を返す（(user, action, code) は一意でない）。
// 実効アクセスはアプリ側（packages/authz-core decide()）が全行の和集合で解決:
// ALL 行 or system:ADMIN → 無制限 / それ以外 → 拠点集合の和 + OWN。
// users.is_active も JOIN 済み — 無効化ユーザーは即権限ゼロ。
View user_permissions {
  user_id         uuid
  action          ACTION
  permission_code varchar
  scope           SCOPE
  scope_values    "text[]"
}
```

### Master Data
```
// ===========================
// 地域・拠点
// ===========================

// 地域（拠点のグループ）。SCOPE.REGION の実体。scope_values は code を参照。
// 管理 UI は拠点マスタ配下 /master/plants/regions（専用アプリ・opcode なし）。
Table regions {
  id              serial [pk]
  code            varchar [unique, not null]
  name            json [not null]              // { ja: '', en: '' }
  is_active       boolean [default: true]
  created_at      timestamp
  updated_at      timestamp
}

// 拠点（製造・在庫・出荷の拠点）。SCOPE.PLANT の実体。
Table plants {
  id              uuid [pk]
  code            varchar [unique, not null]   // 拠点コード
  name            json [not null]              // { ja: '', en: '' }
  name_kana       varchar
  country_code    varchar(2)                   // ISO 3166-1 alpha-2（拠点ごとに 1 国）
  region_id       int [ref: > regions.id]      // 所属地域（任意）
  postal_code     varchar
  address         json                         // { ja: '', en: '' }
  phone           varchar
  email           varchar
  contact_person  varchar
  is_active       boolean [default: true]
  notes           text
  created_at      timestamp
  updated_at      timestamp
}

// ===========================
// 素材・製品
// ===========================
//
// 材種コード（メーカー＋メーカー材種＋形状＋種類）:
//   [A-Z][0-9]{2}[ABC-Z][0-9]{4}  例: B01B0001
//   id = manufacturer_code + grade_code + shape_code + kind_code
//
// 素材コード（材種コード＋黒皮・研磨＋直径＋全長＋カスタム）:
//   [材種コード]-[A-C][0-9]{3}-[0-9]{3}  例: B01B0001-A083-330
//   id = material_type_id + '-' + surface_finish_code + diameter_code + '-' + length_variant_code
//   diameter_code = TEXT(diameter_mm * 10, '000')   例: 8.3 → 083（採番表 ver1.2 準拠）
//   length_variant_code = TEXT(length_mm, '000')      例: 330 → 330
//
// 採番表 ver1.2 のフィールド定義・マスタ値を参照。コード形式は上記 MD 規則を使用。

// ─── 材種コード構成要素 ─────────────────────────

// メーカー: 1文字目 [A-Z]（採番表: アクシス=A, AFC=B, GESAC=C, Ceratizit=D）
Table material_manufacturers {
  code            char(1) [pk]
  name            json [not null]         // { ja: '', en: '' }
  is_active       boolean [default: true]
  created_at      timestamp
  updated_at      timestamp
}

// メーカー材種: 2–3文字目 [0-9]{2}（メーカー内で一意。例: AFC 内 01=K10UF, 02=K40UF）
Table material_manufacturer_grades {
  manufacturer_code char(1) [not null, ref: > material_manufacturers.code]
  code            char(2) [not null]      // [0-9]{2}
  name            json [not null]         // { ja: 'K40UF', en: '' }
  is_active       boolean [default: true]
  created_at      timestamp
  updated_at      timestamp

  indexes {
    (manufacturer_code, code) [pk]
  }
}

// 形状: 4文字目 [ABC-Z]（採番表: A=通常, B=OH, C=円筒）
Table material_shapes {
  code            char(1) [pk]            // [ABC-Z]
  name            json [not null]         // { ja: 'OH', en: '' }
  is_active       boolean [default: true]
  created_at      timestamp
  updated_at      timestamp
}

Table material_types {
  id              varchar [pk]            // 材種コード
  manufacturer_code char(1) [not null, ref: > material_manufacturers.code]
  grade_code      char(2) [not null]
  shape_code      char(1) [not null, ref: > material_shapes.code]
  kind_code       char(4) [not null]      // 種類 [0-9]{4}（メーカー×材種×形状内連番）
  name            json [not null]         // { ja: '', en: '' }
  description     json
  is_active       boolean [default: true]
  created_at      timestamp
  updated_at      timestamp

  indexes {
    (manufacturer_code, grade_code, shape_code, kind_code) [unique]
  }
}

Ref: material_types.(manufacturer_code, grade_code) > material_manufacturer_grades.(manufacturer_code, code)

// 材種の既定材料単価マトリクス: (材種 × 直径 × 黒皮/研磨) → 単価。全長には依存しない
// 固定長基準で ¥/1000mm。採番表 Excel「素材(通常)」由来（価格 × 1000 / 全長 で正規化）。
// 仕入実績が無いとき試算（estimates / SA01）の材料原価フォールバックに使う。
Table material_type_prices {
  id                  serial [pk]
  material_type_id    int [not null, ref: > material_types.id]
  diameter_code       char(3) [not null, ref: > material_diameters.code]
  surface_finish_code char(1) [not null, ref: > material_surface_finishes.code]
  unit_price          numeric(12,2) [not null]   // 既定材料単価（¥/1000mm）
  created_at          timestamp
  updated_at          timestamp

  indexes {
    (material_type_id, diameter_code, surface_finish_code) [unique]
  }
}

// ─── 素材コード構成要素 ─────────────────────────

// 黒皮・研磨: 素材コード中間部 1文字目 [A-C]（採番表: A=黒皮, B=研磨, C=研磨済黒皮）
Table material_surface_finishes {
  code            char(1) [pk]            // A | B | C
  name            json [not null]         // { ja: '黒皮', en: '' }
  is_active       boolean [default: true]
  created_at      timestamp
  updated_at      timestamp
}

// 直径: 素材コード中間部 [0-9]{3}（採番表: TEXT(直径mm * 10, '000')）
Table material_diameters {
  code            char(3) [pk]            // [0-9]{3}
  diameter_mm     numeric(8,3) [not null]
  display_name    json                    // { ja: 'φ8.3', en: 'φ8.3' }
  is_active       boolean [default: true]
  created_at      timestamp
  updated_at      timestamp
}

// 全長＋カスタム: 素材コード末尾 [0-9]{3}（採番表: TEXT(全長mm, '000')。カスタムは custom_label）
Table material_length_variants {
  code            char(3) [pk]            // [0-9]{3}
  length_mm       numeric(10,3) [not null]
  custom_label    varchar                 // カスタム識別（任意）
  display_name    json                    // { ja: '330mm', en: '330mm' }
  notes           text
  is_active       boolean [default: true]
  created_at      timestamp
  updated_at      timestamp
}

// 種類（形状別）: 採番表の OH/通常/円筒 種類表。素材コードには含めず FK で保持
// 例: OH 形状 B5=CH, B3=2V30 / 通常 A0=通常
Table material_kinds {
  shape_code      char(1) [not null, ref: > material_shapes.code]
  code            char(2) [not null]      // 採番表: A0, B0–B9 等
  name            json [not null]         // { ja: 'CH', en: '' }
  is_active       boolean [default: true]
  created_at      timestamp
  updated_at      timestamp

  indexes {
    (shape_code, code) [pk]
  }
}

Table materials {
  id              varchar [pk]            // 素材コード
  material_type_id varchar [not null, ref: > material_types.id]
  surface_finish_code char(1) [not null, ref: > material_surface_finishes.code]
  diameter_code   char(3) [not null, ref: > material_diameters.code]
  length_variant_code char(3) [not null, ref: > material_length_variants.code]
  kind_code       char(2) [not null]      // 形状別種類（material_type.shape_code に対応する material_kinds）
  diameter_mm     numeric(8,3) [not null] // 実径 (mm)
  length_mm       numeric(10,3) [not null] // 全長 (mm)
  manufacturer_model varchar              // メーカ型式 例: 103.70.083
  nominal_diameter_mm numeric(8,3)        // 呼び径 (mm)
  name            json [not null]         // { ja: '', en: '' }
  unit            varchar [not null]      // 本, kg, m など
  // 検索・AI 突合用のキーワード（別名・略称・読み・英字表記）。
  // business_partners.match_names と同じ役割。候補は po-extract の
  // /generate/keywords に作らせ、人が採用したものだけが入る。
  match_names     "text[]"    [default: '{}']
  is_active       boolean [default: true]
  notes           text                    // 備考
  created_at      timestamp
  updated_at      timestamp

  indexes {
    (material_type_id, surface_finish_code, diameter_code, length_variant_code) [unique]
  }
}

// 製品コード: PRD-YYYYMM-NNNN
Table products {
  id              varchar [pk]            // 製品コード
  name            json [not null]         // { ja: '', en: '' }
  // 素材は「材種 + 直径 + 全長」で指定する。特定の materials 行には紐付けない
  // （同一材種・直径の複数素材が cut-to-length で充当可能。素材マスタは在庫管理用に存置）。
  material_type_id int [ref: > material_types.id]
  diameter_mm     numeric(8,3)            // 直径 (mm)
  length_mm       numeric(10,3)           // 全長 (mm)
  material_id     varchar [ref: > materials.id]  // 廃止予定（旧: 特定素材参照。現在は未使用）
  unit            varchar [not null, default: '本']
  spec            json                    // 仕様（フリー構造）
  // 検索・AI 突合用のキーワード（別名・略称・読み・英字表記）。注文書の品名が
  // 名称と一致しないときの突合キー（lib/intake matchProduct）でもある。
  match_names     "text[]"    [default: '{}']
  design_file_id  uuid [ref: > design_files.id]
  is_active       boolean [default: true]
  notes           text
  created_at      timestamp
  updated_at      timestamp
}

```

### Logic
```
// ===========================
// 試算（§1 / SA01 見積試算）EST-YYYYMM-NNNNN
// ===========================

// 工具種（丸棒/円筒/OH付）別の原価計算スナップショット。文書番号
// EST-YYYYMM-NNNNN は複合キー (year_month, seq) から導出する。
// 任意で製品にリンク（1製品に複数試算可）— 確定した試算は価格表作成時に
// バリアントの基準単価ソースとして選択できる（初回使用で REGISTERED）。
Table estimates {
  year_month      char(6) [not null]
  seq             int [not null]
  name            varchar [not null]
  tool_type       varchar [not null]  // 工具種（管理者定義 — trial_pricing.tool_types。組み込み: ROUND_BAR/CYLINDER/OH）
  status          ESTIMATE_STATUS [not null, default: 'DRAFT']
  customer_bp_id  uuid [ref: > business_partners.id]
  product_id      int [ref: > products.id]     // 対象製品（任意。1製品に複数試算可）
  // 材料は「材種 × 直径 × 黒皮/研磨」で指定する（特定 materials 行には紐付けない）
  material_type_id     int [ref: > material_types.id]
  diameter_code        char(3) [ref: > material_diameters.code]
  surface_finish_code  char(1) [ref: > material_surface_finishes.code]
  // 参照価格（仕入実績 / 材種既定単価 由来, ¥/1000mm）
  reference_unit_price numeric(12,2)
  reference_date  date
  reference_overridden boolean [not null, default: false]
  input           json [not null]              // 計算入力スナップショット（TrialInput）
  result          json                         // 算出結果スナップショット（TrialResult）
  registered_at   timestamp                    // 価格表で初回使用された日時
  notes           text
  created_by      uuid [ref: > users.id]
  created_at      timestamp
  updated_at      timestamp

  indexes {
    (year_month, seq) [pk]
  }
}

Enum ESTIMATE_STATUS {
  DRAFT           // 下書き
  CONFIRMED       // 確定（価格表の基準単価ソースに選択可能）
  REGISTERED      // 価格表で使用済み（ロック — 再試算は複製で）
}

// ===========================
// 価格表（§1）PRC-YYYYMM-NNNNN
// ===========================

// 価格表エントリ: 顧客 + 製品 = 1 エントリ（UNIQUE・作成後不変）。
// 表示番号 PRC-YYYYMM-NNNNN は複合キー (year_month, seq) から導出。
// 注文種別ごとの価格（基準単価・有効期間・試算リンク・tiers・値引き）は
// price_list_variants に持つ。
Table price_list_entries {
  year_month      char(6) [not null]
  seq             int [not null]
  customer_bp_id  uuid [not null, ref: > business_partners.id]
  product_id      int [not null, ref: > products.id]
  currency        varchar [not null, default: 'JPY']
  is_active       boolean [default: true]
  created_by      uuid [ref: > users.id]
  created_at      timestamp
  updated_at      timestamp

  indexes {
    (year_month, seq) [pk]
    (customer_bp_id, product_id) [unique]  // 識別キー（作成後不変）
  }
}

// 注文種別バリアント: 1 エントリ内の種別ごとの価格。基準単価は試算の
// 見積単価（選択時）または手動設定。有効期間はバリアント単位
// （テスト/サンプルは終了日必須）。
Table price_list_variants {
  id              uuid [pk]
  entry_year_month char(6) [not null]
  entry_seq       int [not null]
  order_type      ORDER_TYPE [not null]
  base_unit_price numeric(12,2) [not null, default: 0]
  valid_from      date [not null]
  valid_until     date                         // null = 無期限
  estimate_year_month char(6)                  // 試算元（手動設定時は null）
  estimate_seq    int
  is_active       boolean [not null, default: true]
  created_at      timestamp
  updated_at      timestamp

  indexes {
    (entry_year_month, entry_seq, order_type) [unique]
  }
}

// 数量段階: 本数範囲 → 倍率。単価 = round(基準単価 × multiplier)、
// price_override で行ごとに手動上書き可（null = 自動計算）。
Table price_list_tiers {
  id              uuid [pk]
  variant_id      uuid [not null, ref: > price_list_variants.id]
  min_quantity    int [not null, default: 1]
  max_quantity    int                          // null = 上限なし
  multiplier      numeric(8,3) [not null, default: 1]
  price_override  numeric(12,2)                // 手動上書き単価
  sort_order      int [not null, default: 0]

  indexes {
    (variant_id, min_quantity)
  }
}

// 値引きルール: 期間 × 数量条件 → 値引き（バリアントごとの専用リスト）。
// RATE = 単価に対する率(%) / AMOUNT = 1本あたりの値引き額(¥)。
Table price_list_discounts {
  id              uuid [pk]
  variant_id      uuid [not null, ref: > price_list_variants.id]
  label           varchar [not null]
  discount_type   PRICE_DISCOUNT_TYPE [not null]
  value           numeric(12,2) [not null]
  min_quantity    int [not null, default: 1]
  max_quantity    int
  valid_from      date [not null]
  valid_until     date
  is_active       boolean [not null, default: true]
  created_at      timestamp
}

Enum PRICE_DISCOUNT_TYPE {
  RATE            // 率 (%)
  AMOUNT          // 額 (¥/本)
}

Enum ORDER_TYPE {
  PRODUCTION      // 本番
  TEST            // テスト
  SAMPLE          // サンプル（金額0）
  OTHER           // その他
}

// ===========================
// 見積書（§1）QOT-YYYYMM-NNNNN
// ===========================

Table quotes {
  id              uuid [pk]
  quote_number    varchar [unique, not null]
  customer_bp_id  uuid [not null, ref: > business_partners.id]
  customer_branch_bp_id uuid [ref: > business_partners.id]
  status          QUOTE_STATUS [not null, default: 'DRAFT']
  valid_until     date
  notes           text
  pdf_file_id     uuid [ref: > files.id]
  created_by      uuid [ref: > users.id]
  created_at      timestamp
  updated_at      timestamp
}

Enum QUOTE_STATUS {
  DRAFT
  ISSUED
  ACCEPTED
  REJECTED
  EXPIRED
}

Table quote_items {
  id              uuid [pk]
  quote_id        uuid [not null, ref: > quotes.id]
  product_id      varchar [not null, ref: > products.id]
  order_type      ORDER_TYPE [not null]
  quantity        int [not null]
  unit_price      numeric(12,2) [not null]      // 価格表から自動解決
  price_list_tier_id uuid [ref: > price_list_tiers.id]  // 自動生成元の段階（手動入力時は null）
  discount_amount numeric(12,2) [not null, default: 0]  // カスタム値引き額（任意）
  amount          numeric(12,2) [not null]      // unit_price * quantity - discount_amount
  delivery_date   date
  notes           text
  sort_order      int [not null, default: 0]
}

// ===========================
// 注文請書（§2）ORD-YYYYMM-NNNNN
// ===========================

Table order_acceptances {
  id              uuid [pk]
  order_number    varchar [unique, not null]
  quote_id        uuid [ref: > quotes.id]
  customer_bp_id  uuid [not null, ref: > business_partners.id]
  customer_branch_bp_id uuid [ref: > business_partners.id]
  ship_to_bp_id   uuid [ref: > business_partners.id]  // 出荷先（顧客本体と別法人・支店でもよい。null = 顧客へ）
  assigned_plant_id int [ref: > plants.id]            // 担当拠点（この注文を処理する拠点）
  shipping_work_location_id int [ref: > work_locations.id]  // 出荷作業場所（作業場所マスタ MS0D）
  customer_order_ref varchar               // 顧客注文書番号（FAX受取）
  status          ORDER_ACCEPTANCE_STATUS [not null, default: 'PENDING']
  total_amount    numeric(12,2)            // 注文明細から自動計算
  order_doc_file_id uuid [ref: > files.id] // 受領した注文書 PDF
  notes           text
  created_by      uuid [ref: > users.id]
  created_at      timestamp
  updated_at      timestamp
}

Enum ORDER_ACCEPTANCE_STATUS {
  PENDING         // 照合中
  PRICE_DIFF      // 価格差異あり → 再調整中
  CONFIRMED       // 確定
}

// ===========================
// 注文明細（§3）ORD-YYYYMM-NNNNN-NN
// ===========================

// 注文明細 = 注文請書（order_acceptances）の明細行そのもの。
// 別テーブルではない — 旧 sales_orders は order_lines に統合済み。
// 注文請書 1 行 = 注文明細 1 行で固定（明細自体は分割も統合もしない —
// 生産側の分割・統合は 指示書への割当 work_order_order_lines が担う）。
// 確定前は branch / amount が null で status = DRAFT、確定時に sort_order 順で
// branch 1..N を採番し金額を凍結する。以後 branch は不変。
Table order_lines {
  id              uuid [pk]
  acceptance_year_month char(6) [not null]
  acceptance_seq  int [not null]
  branch          int                      // 枝番。確定時に採番（未確定は null）
  sort_order      int [not null, default: 0]

  // 明細内容（抽出直後は product_text のみ。突合後に product_id）
  product_id      int [ref: > products.id]
  product_text    varchar
  order_type      ORDER_TYPE [not null]
  quantity        int [not null]
  unit_price      numeric(12,2)
  amount          numeric(12,2)            // 確定時に quantity * unit_price
  delivery_date   date
  notes           text

  // 実行（旧 sales_orders 由来）
  status          ORDER_LINE_STATUS [not null, default: 'DRAFT']
  lot_number      int                      // 通し連番（指示書番号と共用。統合ロットでは複数明細が共有するため unique ではない）
  is_locked       boolean [not null, default: false]  // 承認依頼中のロック
  end_user_bp_id  uuid [ref: > business_partners.id]  // 行ごとに異なり得る
  confirmed_at    timestamp
  cancelled_at    timestamp
  created_at      timestamp
  updated_at      timestamp

  // 顧客・注文書番号・見積キー・作成者はヘッダ（order_acceptances）から読む。
  // 行に複写すると乖離するため持たない。

  indexes {
    (acceptance_year_month, acceptance_seq, branch) [unique]
  }
}

Ref: order_lines.(acceptance_year_month, acceptance_seq) > order_acceptances.(year_month, seq)

// 確定済み（DRAFT 以外）は公開番号と金額が揃っていること —
// CHECK order_lines_confirmed_complete で DB 側にも置いている。

Enum ORDER_LINE_STATUS {
  DRAFT
  CONFIRMED
  IN_PRODUCTION
  PARTIAL_SHIPPED
  SHIPPED
  CANCELLED
}

// ===========================
// 指示書（§3〜§7）通し連番
// ===========================

// 注文明細との紐付けは work_order_order_lines（m:n の割当）— 1 明細を複数
// 指示書に分けて部分手配（分割）でき、同一製品の複数明細を 1 指示書 =
// 1 ロットで作る（統合）こともできる。割当ゼロ = 在庫向けの独立指示書。
Table work_orders {
  id              uuid [pk]
  work_order_number int [unique, not null]  // 通し連番 = ロット番号（業務キー）
  year_month      char(6) [not null]        // 書類番号 WOR-YYYYMM-NNNNN（表示用）
  seq             int [not null]            // (year_month, seq) unique
  product_id      int [not null, ref: > products.id]  // 常に保持（明細から複写 or 直接指定）
  type            WORK_ORDER_TYPE [not null]
  planned_quantity int [not null]           // ≥ Σ割当（不良予備分の上乗せは自由）
  material_id     varchar [ref: > materials.id]
  storage_location_id int [ref: > storage_locations.id]  // 完成品の保管場所（MS0E）
  status          WORK_ORDER_STATUS [not null, default: 'DRAFT']
  approval_status WORK_ORDER_APPROVAL_STATUS [not null, default: 'NONE']
  source_work_order_id uuid [ref: > work_orders.id]  // コピー元（バージョン警告用）
  approved_at     timestamp
  started_at      timestamp
  completed_at    timestamp
  notes           text
  created_by      uuid [ref: > users.id]
  created_at      timestamp
  updated_at      timestamp
}

// 指示書 ↔ 注文明細の割当（m:n）。quantity = その指示書がその明細のために
// 充当する数量。不変条件（アプリ側 lib/work-order-alloc-core.ts が唯一の
// 判定元）: 明細ごと Σquantity ≤ 受注数量 / 指示書ごと planned_quantity ≥
// Σquantity / 割当明細は同一製品 / FROM_STOCK は割当 1 件のみ。
Table work_order_order_lines {
  work_order_id   uuid [not null, ref: > work_orders.id]
  order_line_id   uuid [not null, ref: > order_lines.id]
  quantity        int [not null]
  sort_order      int [not null, default: 0]
  created_at      timestamp

  indexes {
    (work_order_id, order_line_id) [pk]
  }
}

Enum WORK_ORDER_TYPE {
  FROM_STOCK      // 在庫分
  MANUFACTURE     // 製造分
}

Enum WORK_ORDER_STATUS {
  DRAFT
  PENDING_APPROVAL
  APPROVED
  IN_PROGRESS
  COMPLETED
  CANCELLED
}

// 段数非依存 — 何段目まで進んでいるかは approval_requests.step_no が持つ。
Enum WORK_ORDER_APPROVAL_STATUS {
  NONE
  PENDING         // 承認フロー進行中
  APPROVED
  REJECTED
}

// 検査工程ステップに紐付く検査表テンプレート（複数可）。
// 旧 work_order_inspection_templates（指示書単位）から工程単位へ移行済み —
// 検査工程が複数ある指示書で、どの検査表がどの工程のものかを一意にするため。
Table work_order_step_inspection_templates {
  work_order_step_id     uuid [not null, ref: > work_order_steps.id]
  inspection_template_id int  [not null, ref: > inspection_templates.id]
  indexes {
    (work_order_step_id, inspection_template_id) [pk]
  }
}

// ===========================
// 工程マスタ（カタログ）
// ===========================

Table process_step_catalog {
  id              serial [pk]
  code            varchar [unique, not null]  // e.g. CYLINDER_MACHINING
  name            json [not null]             // { ja: '円筒加工', en: '' }
  category        PROCESS_CATEGORY [not null]
  execution_location PROCESS_EXECUTION [not null]
  is_sync_capable boolean [not null, default: false]
  is_inspection   boolean [not null, default: false]  // 検査工程か
  is_approval_step boolean [not null, default: false] // 検査承認工程か
  approval_min_rank varchar                            // 承認必要役職（係長以上等）
  sort_order      int [not null, default: 0]
  is_active       boolean [not null, default: true]
  notes           text
}

Enum PROCESS_CATEGORY {
  MATERIAL_PREP   // 材料準備
  MACHINING       // 加工
  COATING         // コーティング
  INSPECTION      // 検査
  APPROVAL        // 検査承認
  SHIPPING        // 出荷
}

Enum PROCESS_EXECUTION {
  INTERNAL        // 社内のみ
  INTERNAL_OR_OUTSOURCE  // 社内・外注
}

// 工程使用依存（ワークフローに含めてよい条件）
Table process_step_use_dependencies {
  step_id         int [not null, ref: > process_step_catalog.id]
  depends_on_step_id int [not null, ref: > process_step_catalog.id]
  relation        DEPENDENCY_RELATION [not null, default: 'AND']
  is_negation     boolean [not null, default: false]  // ! 排他条件
  notes           text
  indexes {
    (step_id, depends_on_step_id) [pk]
  }
}

// 工程実行依存（この工程を開始してよい条件 = 前工程完了）
Table process_step_exec_dependencies {
  step_id         int [not null, ref: > process_step_catalog.id]
  depends_on_step_id int [not null, ref: > process_step_catalog.id]
  relation        DEPENDENCY_RELATION [not null, default: 'AND']
  notes           text
  indexes {
    (step_id, depends_on_step_id) [pk]
  }
}

Enum DEPENDENCY_RELATION {
  AND
  OR
}

// ===========================
// 指示書工程ステップ（§7）
// ===========================

Table work_order_steps {
  id              uuid [pk]
  work_order_id   uuid [not null, ref: > work_orders.id]
  process_step_id int [not null, ref: > process_step_catalog.id]
  sort_order      int [not null]           // テンプレート順（参考。実行は依存解決で決定）
  execution_location STEP_EXECUTION [not null]
  plant_id      uuid [ref: > plants.id]          // 社内実行時の拠点
  supplier_bp_id  uuid [ref: > business_partners.id]  // 外注時
  outsource_requested_at date
  outsource_expected_at  date
  outsource_received_at  date
  status          STEP_STATUS [not null, default: 'PENDING']
  // 工程間の数量受け渡し・不良振り分け
  input_quantity            int   // 前工程からの受入数
  output_success_quantity   int   // 次工程へ渡す良品数
  output_defect_semi_finished int // 半製品在庫へ
  output_defect_scrap       int   // 廃棄
  output_defect_rework      int   // 手直し・追加工程へ
  session_locked_by uuid [ref: > users.id]       // セッションロック（同時実行防止）
  session_locked_at timestamp
  started_at      timestamp
  started_by      uuid [ref: > users.id]
  completed_at    timestamp
  completed_by    uuid [ref: > users.id]
  cancelled_at    timestamp
  cancelled_by    uuid [ref: > users.id]
  cancel_reason   text
  notes           text
}

Enum STEP_EXECUTION {
  INTERNAL
  OUTSOURCE
}

Enum STEP_STATUS {
  PENDING
  IN_PROGRESS
  COMPLETED
  CANCELLED
}

// 工程ステップの分岐・合流（DAG）。あるステップ完了後に数量を別ステップ系列へ流す。
// 受注内のロット分割・合流（不良の手直し分岐、半製品の再投入など）に対応。
Table work_order_step_links {
  id              uuid [pk]
  work_order_id   uuid [not null, ref: > work_orders.id]
  source_step_id  uuid [not null, ref: > work_order_steps.id]  // 分岐元（完了後に分岐）
  target_step_id  uuid [not null, ref: > work_order_steps.id]  // 合流先
  routed_quantity int [not null, default: 0]                   // この経路を流れる数量
  notes           text
  created_at      timestamp

  indexes {
    (source_step_id, target_step_id) [unique]
  }
}

// ===========================
// 承認（§6）
// ===========================

// 承認グループ = 承認者の集合。「何段目か」は持たない — それは
// approval_flow_steps が書類種別ごとに決める。
Table approval_groups {
  id              serial [pk]
  name            json [not null]         // { ja: '', en: '' }
  is_active       boolean [not null, default: true]
}

// 常任 = valid_from / valid_until とも NULL。
// 期間限定 = 両方に日時（片側だけは CHECK で禁止）。実効判定の唯一の定義は
// lib/approval-membership.ts isMemberEffective()。代理（approval_delegates）
// とは別概念 — 代理は「本来の承認者の代わりに押す」。
Table approval_group_members {
  group_id        int [not null, ref: > approval_groups.id]
  user_id         uuid [not null, ref: > users.id]
  is_active       boolean [not null, default: true]
  valid_from      timestamp
  valid_until     timestamp
  note            text
  indexes {
    (group_id, user_id) [pk]
  }
}

// ===========================
// 承認フロー定義（書類種別ごとに 1 本）
// ===========================
//
// target_type は approval_requests.target_type と同じ値（= テーブル名）。
// 新しい enum を作らないのは既存の多態規約（audit と同じ）に合わせるため。
// 値の範囲は DB 側の CHECK 制約と TS 側の APPROVAL_TARGET_TYPES で守る。
// 管理 UI: 承認設定（MS0B, /master/approval-settings）。

Table approval_flows {
  target_type     varchar [pk]  // work_orders / order_acceptances /
                                // material_purchase_orders / purchase_requests /
                                // work_order_flow_changes /
                                // order_acceptance_cancel_requests（注文請書キャンセル
                                //   — 確定済みの請書はごとキャンセルを依頼して承認を通す。
                                //   明細単位のキャンセル操作は廃止）
  updated_by      uuid [ref: > users.id]
  updated_at      timestamp
}

// step_no は 1..N の連番（詰めて保存）。並べ替えは全削除 + 再作成
// （進行中の依頼はこの行を参照していない — flow_snapshot を持つため）。
Table approval_flow_steps {
  id              serial [pk]
  target_type     varchar [not null, ref: > approval_flows.target_type]
  step_no         int [not null]
  name            json [not null]         // { ja: '', en: '' } 例「第一承認」
  group_id        int [not null, ref: > approval_groups.id]  // 削除は Restrict
  mode            APPROVAL_MODE [not null, default: 'ANY']

  indexes {
    (target_type, step_no) [unique]
  }
}

Enum APPROVAL_MODE {
  ANY   // いずれか 1 名の承認でこの段は通過
  ALL   // 対象メンバー全員の承認が必要
}

// 期間限定代理設定
Table approval_delegates {
  id              uuid [pk]
  group_id        int [not null, ref: > approval_groups.id]
  delegator_id    uuid [not null, ref: > users.id]
  delegate_id     uuid [not null, ref: > users.id]
  valid_from      timestamp [not null]
  valid_until     timestamp [not null]
  reason          text
  created_by      uuid [ref: > users.id]
  created_at      timestamp
}

// 1 行 = 1 段の承認依頼。対象は多態（target_type = テーブル名 /
// target_id = 業務キー — audit と同じ規約）。進行中は
// (target_type, target_id) につき常に 1 行だけ PENDING（部分 unique index）。
//
// ★ 多態参照は FK ではないので、書類を消しても子行は残る。これを DB 側で
//   強制するために各書類テーブルに AFTER DELETE トリガー
//   purge_children_after_delete（関数 app.purge_document_children）を置き、
//   承認依頼・メモ・メモ改訂・添付をまとめて消している
//   （20260911090000_document_children_cascade）。Prisma スキーマには現れない
//   ので、書類テーブルを追加したらトリガーも足すこと。監査ログ（audit_logs）は
//   意図的に対象外 — 書類を消しても監査記録は残す。
//
// flow_snapshot は依頼時点のフロー全段のコピー
// [{ stepNo, name, groupId, groupName, mode }]。これを持つことで
// (a) 進行中の書類が後からのフロー編集に影響されず、(b) Stepper が 1 行
// 読むだけで全体を描ける。同じ配列がフロー中の全依頼行に載るのは承知の
// うえの非正規化。
Table approval_requests {
  id              uuid [pk]
  target_type     varchar [not null]
  target_id       varchar [not null]
  step_no         int [not null]          // 1..N
  step_count      int [not null]          // 依頼時点の総段数
  group_id        int [ref: > approval_groups.id]  // 依頼時点の承認グループ
  mode            APPROVAL_MODE [not null, default: 'ANY']
  flow_snapshot   json [not null]
  status          APPROVAL_REQUEST_STATUS [not null, default: 'PENDING']
  requested_by    uuid [ref: > users.id]
  requested_at    timestamp
  notes           text

  indexes {
    (target_type, target_id)
    status
  }
}

// 依頼時点で「この段で承認しうる人」のスナップショット。
// ALL では必須チェックリスト（全枠が acted_at で埋まると段が閉じる）、
// ANY では表示・通知用。acted_by は代理が押した場合の実行者。
Table approval_request_approvers {
  approval_request_id uuid [not null, ref: > approval_requests.id]
  user_id         uuid [not null, ref: > users.id]
  acted_at        timestamp
  acted_by        uuid [ref: > users.id]

  indexes {
    (approval_request_id, user_id) [pk]
  }
}

Enum APPROVAL_REQUEST_STATUS {
  PENDING
  APPROVED
  REJECTED
}

Table approval_records {
  id              uuid [pk]
  approval_request_id uuid [not null, ref: > approval_requests.id]
  approver_id     uuid [not null, ref: > users.id]
  delegate_for_id uuid [ref: > users.id]  // 代理の場合の原承認者
  action          APPROVAL_ACTION [not null]
  comment         text
  acted_at        timestamp [not null]
}

Enum APPROVAL_ACTION {
  APPROVED
  REJECTED
}

// ===========================
// 検査表（§7）
// ===========================

Table inspection_templates {
  id              uuid [pk]
  code            varchar [unique, not null]
  name            json [not null]                    // { ja: '', en: '' }
  related_process_step_id int [ref: > process_step_catalog.id]
  is_active       boolean [not null, default: true]
  created_at      timestamp
  updated_at      timestamp
}

Table inspection_template_items {
  id              uuid [pk]
  template_id     uuid [not null, ref: > inspection_templates.id]
  item_name       json [not null]         // { ja: '', en: '' }
  unit            varchar
  tolerance_min   numeric
  tolerance_max   numeric
  is_required     boolean [not null, default: true]
  sort_order      int [not null, default: 0]
}

Table inspection_records {
  id              uuid [pk]
  work_order_step_id uuid [not null, ref: > work_order_steps.id]
  template_id     uuid [not null, ref: > inspection_templates.id]
  status          INSPECTION_STATUS [not null, default: 'PENDING']
  recorded_by     uuid [ref: > users.id]
  approved_by     uuid [ref: > users.id]
  recorded_at     timestamp
  approved_at     timestamp
  notes           text
}

Enum INSPECTION_STATUS {
  PENDING
  PASS
  FAIL
  APPROVED
}

Table inspection_record_items {
  id              uuid [pk]
  inspection_record_id uuid [not null, ref: > inspection_records.id]
  template_item_id uuid [not null, ref: > inspection_template_items.id]
  measured_value  varchar
  is_pass         boolean
  notes           text
}

// 不良記録（各工程ステップで任意記録）
Table defect_types {
  id              serial [pk]
  code            varchar [unique, not null]
  name            json [not null]         // { ja: '', en: '' }
  is_active       boolean [not null, default: true]
  sort_order      int [not null, default: 0]
}

Table defect_records {
  id              uuid [pk]
  work_order_step_id uuid [not null, ref: > work_order_steps.id]
  defect_type_id  int [not null, ref: > defect_types.id]
  description     text [not null]
  recorded_by     uuid [ref: > users.id]
  recorded_at     timestamp [not null]
}

// ===========================
// 在庫（§4・§5・§7）
// ===========================

Table product_inventory {
  id              uuid [pk]
  product_id      varchar [not null, ref: > products.id]
  plant_id      uuid [ref: > plants.id]   // 保管拠点
  lot_number      int [ref: > work_orders.work_order_number]
  quantity        int [not null, default: 0]
  reserved_quantity int [not null, default: 0]
  location        varchar
  notes           text
  updated_at      timestamp
}

Table material_inventory {
  id              uuid [pk]
  material_id     varchar [not null, ref: > materials.id]
  plant_id      uuid [ref: > plants.id]   // 保管拠点
  quantity        numeric(12,3) [not null, default: 0]
  reserved_quantity numeric(12,3) [not null, default: 0]
  unit            varchar [not null]
  location        varchar
  notes           text
  updated_at      timestamp
}

// 在庫引当・予約（全工程完了まで予約状態を維持）
Table inventory_reservations {
  id              uuid [pk]
  inventory_type  INVENTORY_TYPE [not null]
  inventory_id    uuid [not null]
  order_line_id   uuid [ref: > order_lines.id]
  work_order_id   uuid [ref: > work_orders.id]
  quantity        numeric(12,3) [not null]
  status          RESERVATION_STATUS [not null, default: 'RESERVED']
  reserved_at     timestamp
  confirmed_at    timestamp
  released_at     timestamp
}

Enum INVENTORY_TYPE {
  PRODUCT
  MATERIAL
}

Enum RESERVATION_STATUS {
  RESERVED        // 予約中（製造中）
  CONFIRMED       // 確定（全工程完了時）
  RELEASED        // 解除（出荷・キャンセル）
}

Table inventory_transactions {
  id              uuid [pk]
  inventory_type  INVENTORY_TYPE [not null]
  inventory_id    uuid [not null]
  transaction_type TRANSACTION_TYPE [not null]
  quantity        numeric(12,3) [not null]
  reference_type  varchar                   // work_order, delivery_order, material_receipt...
  reference_id    uuid
  notes           text
  created_by      uuid [ref: > users.id]
  created_at      timestamp
}

Enum TRANSACTION_TYPE {
  IN              // 入庫
  OUT             // 出庫
  RESERVE         // 予約
  RELEASE         // 予約解除
  ADJUST          // 棚卸調整
}

// ===========================
// 素材発注（購買・承認フロー）
// ===========================

Enum PURCHASE_STATUS {
  DRAFT           // 作成中（編集可）
  REQUESTED       // 承認依頼中
  APPROVED        // 承認済（発注可）
  ORDERED         // 発注済（入荷予定として在庫予約）
  COMPLETED       // 入荷完了（在庫増）
  CANCELLED
}

// 素材発注書。承認フロー（依頼→承認→発注→入荷）。
Table material_purchase_orders {
  id              uuid [pk]
  po_number       varchar [unique, not null]
  supplier_bp_id  uuid [not null, ref: > business_partners.id]
  status          PURCHASE_STATUS [not null, default: 'DRAFT']
  total_amount    numeric(12,2) [not null, default: 0]
  currency        varchar [not null, default: 'JPY']
  purchase_date   date
  requested_at    timestamp
  requested_by    uuid [ref: > users.id]
  approved_at     timestamp
  approved_by     uuid [ref: > users.id]
  ordered_at      timestamp
  ordered_by      uuid [ref: > users.id]
  completed_at    timestamp
  completed_by    uuid [ref: > users.id]
  cancelled_at    timestamp
  cancelled_by    uuid [ref: > users.id]
  cancel_reason   text
  history         json                     // 状態遷移履歴 [{ action, user, at, notes }]
  notes           text
  created_by      uuid [ref: > users.id]
  created_at      timestamp
  updated_at      timestamp
}

Table material_purchase_order_items {
  id              uuid [pk]
  purchase_order_id uuid [not null, ref: > material_purchase_orders.id]
  material_id     varchar [not null, ref: > materials.id]
  plant_id      uuid [ref: > plants.id]   // 入荷先拠点
  quantity        numeric(12,3) [not null]
  unit            varchar [not null]
  unit_price      numeric(12,2) [not null]
  amount          numeric(12,2) [not null]
  currency        varchar [not null, default: 'JPY']
  expected_at     date
  notes           text
  sort_order      int [not null, default: 0]
}

// 発注承認者（承認グループ or 個人）
// ⚠️ 未実装 — 設計のみ（素材発注の承認者）。Prisma スキーマにも DB にも存在しない。
Table material_purchase_approvers {
  id              uuid [pk]
  purchase_order_id uuid [not null, ref: > material_purchase_orders.id]
  approval_group_id int [ref: > approval_groups.id]
  approver_user_id  uuid [ref: > users.id]
  created_at      timestamp

  indexes {
    (purchase_order_id, approval_group_id, approver_user_id) [unique]
  }
}

// 素材入荷（発注の入荷 or 外部調達の直接入荷）
Table material_receipts {
  id              uuid [pk]
  material_id     varchar [not null, ref: > materials.id]
  supplier_bp_id  uuid [ref: > business_partners.id]
  purchase_order_item_id uuid [ref: > material_purchase_order_items.id]  // 発注明細との紐付け（任意）
  plant_id      uuid [ref: > plants.id]   // 入荷先拠点
  quantity        numeric(12,3) [not null]
  unit            varchar [not null]
  received_at     date [not null]
  notes           text
  created_by      uuid [ref: > users.id]
  created_at      timestamp
}

// ===========================
// 出荷・納品（§8）
// ===========================

// 出荷書（delivery order / DO）。注文明細との紐付けは**明細行**の
// order_line_id — 出荷書 ↔ 注文明細は m:n（1 出荷書に複数明細、
// 1 明細も複数出荷書へ分割出荷できる）。営業担当は持たない（注文請書
// ヘッダから導出）。
Table delivery_orders {
  id              uuid [pk]
  work_order_id   uuid [ref: > work_orders.id]
  from_plant_id uuid [ref: > plants.id]   // 出荷元拠点
  type            DELIVERY_ORDER_TYPE [not null]
  status          DELIVERY_ORDER_STATUS [not null, default: 'DRAFT']
  shipped_at      timestamp
  notes           text
  created_by      uuid [ref: > users.id]
  created_at      timestamp
  updated_at      timestamp
}

Enum DELIVERY_ORDER_TYPE {
  STOCK_STORAGE   // 在庫保管（予備製作分・請求フロー外）
  DISPATCH        // 発送
}

Enum DELIVERY_ORDER_STATUS {
  DRAFT
  CONFIRMED
  SHIPPED
}

Table delivery_order_items {
  id              uuid [pk]
  delivery_order_id uuid [not null, ref: > delivery_orders.id]
  product_id      varchar [not null, ref: > products.id]
  lot_number      int
  quantity        int [not null]
  notes           text
  sort_order      int [not null, default: 0]
}

// 納品書: DRN-YYYYMM-NNNNN
Table delivery_notes {
  id              uuid [pk]
  delivery_number varchar [unique, not null]
  delivery_order_id uuid [not null, ref: > delivery_orders.id]
  delivery_method DELIVERY_METHOD [not null]
  recipient_bp_id uuid [not null, ref: > business_partners.id]
  recipient_branch_bp_id uuid [ref: > business_partners.id]
  end_user_bp_id  uuid [ref: > business_partners.id]  // ユーザー直送時
  include_price   boolean [not null, default: true]  // 配送完了書に価格記載
  pdf_file_id     uuid [ref: > files.id]
  status          DELIVERY_STATUS [not null, default: 'DRAFT']
  delivered_at    timestamp
  notes           text
  created_by      uuid [ref: > users.id]
  created_at      timestamp
  updated_at      timestamp
}

Enum DELIVERY_METHOD {
  DIRECT_TO_USER  // ユーザー直送（完了書に価格なし、納品書別送）
  NORMAL          // 通常納品（受注先へ納品書同梱）
}

Enum DELIVERY_STATUS {
  DRAFT
  ISSUED
  DELIVERED
}

Table delivery_note_items {
  id              uuid [pk]
  delivery_note_id uuid [not null, ref: > delivery_notes.id]
  product_id      varchar [not null, ref: > products.id]
  quantity        int [not null]
  unit_price      numeric(12,2)
  amount          numeric(12,2)
  notes           text
  sort_order      int [not null, default: 0]
}

// ===========================
// 請求（§9）
// ===========================

// 請求書: INV-YYYYMM-NNNNN
Table invoices {
  id              uuid [pk]
  invoice_number  varchar [unique, not null]
  customer_bp_id  uuid [not null, ref: > business_partners.id]
  customer_branch_bp_id uuid [ref: > business_partners.id]
  billing_period_from date [not null]
  billing_period_to   date [not null]
  subtotal        numeric(12,2) [not null]
  tax_amount      numeric(12,2) [not null]
  total_amount    numeric(12,2) [not null]
  status          INVOICE_STATUS [not null, default: 'DRAFT']
  issued_at       timestamp
  due_date        date
  sent_at         timestamp
  pdf_file_id     uuid [ref: > files.id]
  yayoi_exported_at timestamp
  notes           text
  created_by      uuid [ref: > users.id]
  created_at      timestamp
  updated_at      timestamp
}

Enum INVOICE_STATUS {
  DRAFT
  ISSUED
  SENT
  PAID
}

Table invoice_items {
  id              uuid [pk]
  invoice_id      uuid [not null, ref: > invoices.id]
  delivery_order_id uuid [ref: > delivery_orders.id]
  delivery_note_id  uuid [ref: > delivery_notes.id]
  description     json [not null]         // { ja: '', en: '' }
  quantity        int [not null]
  unit_price      numeric(12,2) [not null]
  amount          numeric(12,2) [not null]
  sort_order      int [not null, default: 0]
}

Table billing_closings {
  id              uuid [pk]
  customer_bp_id  uuid [not null, ref: > business_partners.id]
  closing_date    date [not null]
  status          CLOSING_STATUS [not null, default: 'PENDING']
  total_amount    numeric(12,2)
  processed_at    timestamp
  processed_by    uuid [ref: > users.id]
  notes           text
  created_at      timestamp
}

Enum CLOSING_STATUS {
  PENDING
  PROCESSED
  EXPORTED        // 弥生会計エクスポート済み
}

// ===========================
// 設計依頼（§10）
// ===========================

// 承認フローを持つ（購買依頼 purchase_requests と同型の row-workflow）。
// 承認依頼・記録は approval_requests / approval_records へ正規化し、
// ここには遷移列（at/by）+ history だけを置く。
Table design_requests {
  id              uuid [pk]
  request_number  varchar [unique, not null]
  trigger         DESIGN_TRIGGER [not null]
  // 見積時は複合キー（quotes は uuid PK ではない）
  quote_year_month char(6)
  quote_seq       int
  order_line_id   uuid [ref: > order_lines.id]      // 受注時
  // アプリ側では必須（依頼区分の自動判定に要る）。DB は nullable のまま —
  // 製品未指定の既存行があるので NOT NULL にすると移行が落ちる。
  product_id      int [ref: > products.id]
  description     text
  // 依頼区分。「その製品に design_files があるか」で自動判定した値を**保存**する
  // （導出しない — 区分は承認ルートを決めるので、他の依頼の完了で値が動くと
  //  承認済みのルートと食い違う）。kind_overridden は人が上書きしたかどうか。
  kind            DESIGN_KIND [not null, default: 'NEW']
  kind_overridden boolean [not null, default: false]
  base_design_file_id uuid [ref: > design_files.id]  // 改訂の元図面
  change_reason   text        // 改訂のとき必須
  desired_at      date        // 希望納期
  priority        DESIGN_PRIORITY [not null, default: 'NORMAL']
  status          DESIGN_STATUS [not null, default: 'DRAFT']
  // 図面をつくる製造担当。§10 の「依頼通知を製造担当へ」の宛先はこの 1 列で
  // 決まる（承認完了時に「着手してください」を送る）。
  assignee_id     uuid [ref: > users.id]
  requested_at    timestamp
  requested_by    uuid [ref: > users.id]
  approved_at     timestamp
  approved_by     uuid [ref: > users.id]
  started_at      timestamp
  completed_at    timestamp
  completed_by    uuid [ref: > users.id]
  cancelled_at    timestamp
  cancelled_by    uuid [ref: > users.id]
  cancel_reason   text
  history         json    // 状態遷移履歴 [{ action, user, at, notes }]
  created_by      uuid [ref: > users.id]
  created_at      timestamp
  updated_at      timestamp
}

Ref: design_requests.(quote_year_month, quote_seq) > quotes.(year_month, seq)

Enum DESIGN_TRIGGER {
  QUOTE           // 見積時（§1 と並行）
  SALES_ORDER     // 受注時（§3 と並行）
  STANDALONE      // 単独 — 見積にも受注にも紐づかない（新製品の検討・事前相談・
                  //        社内改善）。参照元は両方 null になる
}

// 2 つの軸が重なっている:
//   承認軸  DRAFT → REQUESTED →（承認）→ PENDING /（差し戻し）→ REJECTED
//   作業軸  PENDING →（着手）→ IN_PROGRESS →（完了）→ COMPLETED
// PENDING は承認フロー導入前からある値で、「未着手」= 承認済・着手待ち。
// COMPLETED → IN_PROGRESS の差し戻しは**作業の巻き戻し**なので REJECTED には
// 落とさず、承認記録にも触らない。
Enum DESIGN_KIND {
  NEW             // 新規（その製品に過去の設計書が無い）
  REVISION        // 改訂（既存の版がある）
}

Enum DESIGN_PRIORITY {
  NORMAL
  HIGH            // 急ぎ
}

Enum DESIGN_STATUS {
  DRAFT
  REQUESTED
  PENDING
  IN_PROGRESS
  COMPLETED
  REJECTED
  CANCELLED
}

// 製品の「最新図面」はここが正 — products 側に design_file_id 列は無い。
// 版採番と両側の is_latest クリアは completeDesign の 1 tx が唯一の管理者。
Table design_files {
  id              uuid [pk]
  design_request_id uuid [ref: > design_requests.id]
  product_id      int [ref: > products.id]
  file_id         uuid [not null, ref: > files.id]
  version         int [not null, default: 1]
  is_latest       boolean [not null, default: true]
  notes           text
  created_by      uuid [ref: > users.id]
  created_at      timestamp
}

// ===========================
// 見積試算（SA01）— 実体は Logic §1 の estimates テーブル
// ===========================
//
// 工具種（丸棒/円筒/OH付）別の見積試算。原価チェーン（材料原価+段加工+首下+加工
// 単価+コート+ラップ+LD+検査）→ 補正値を適用して見積単価を算出。
// 材料は「材種 × 直径 × 黒皮/研磨」で指定する（特定 materials 行には紐付けない）。
// 材料原価の参照価格は、当該構成に一致する全素材の仕入実績
// （material_purchase_order_items）→ 無ければ材種既定単価 material_type_prices
// （¥/1000mm）の順で解決する。参照価格の算出方法（最高/最新/平均・参照月数）は
// system_settings。参照テーブル（センタレス/段加工/首下/円筒/コート/掛け率/割引）は
// 採番表 Excel 由来で trial_pricing_* マスタ（または import）へ移行する。
//
// テーブルは §1 の `estimates`（EST-YYYYMM-NNNNN）に統合済み — 独立した
// trial_estimates / trial_estimate_lots は存在しない（ロットは input/result
// JSON 内に保持）。任意の product_id で製品にリンクし（1製品に複数試算可）、
// 確定後は価格表（顧客×製品）作成時の基準単価ソースとして選択できる。

// 工具種は管理者定義（system_settings trial_pricing.tool_types — SY02 工具種管理
// で追加/削除。未使用の工具種のみ削除可）。estimates.tool_type は varchar で保持。
// 組み込み 3 種（削除不可）: ROUND_BAR（丸棒） / CYLINDER（円筒） / OH（OH付）。
// 旧 TRIAL_TOOL_TYPE enum は varchar へ移行済み。

// 汎用アプリ設定ストア（1テーブルで任意のコード設定を保持）。key は名前空間
// 付き `<namespace>.<field>`。アクセスは lib/app-config.ts（generic）+ アプリ別
// 型付きアダプタ（例: lib/system-settings.ts = 試算）。システム設定アプリ
// （SY01, /settings → アプリ設定）から編集する。
// 試算キー: trial_pricing.material_price_basis / .lookback_months /
//   .machining_rate_per_10min / .spare_shape_count / .correction_factor /
//   .ld_charge_per_10min / .custom_script_enabled(bool) /
//   .custom_script(string = 管理者が書く JS。calcTrialPricing の後処理フック。
//   lib/trial-pricing-script.ts。system 権限のみ編集可)。
Table system_settings {
  key             varchar [pk]    // 例: trial_pricing.custom_script
  value           json [not null]
  description     text
  updated_by      uuid [ref: > users.id]
  updated_at      timestamp
}
```

### Business Partner Master
```
// ===========================
// 外部関係者マスタ（BP）
// S/4HANA BP モデルに準拠: 1 法人エンティティ + 複数ロール割当
// 顧客（CUSTOMER）・仕入先/外注先（VENDOR）・需要家（END_USER）を統合管理
// ===========================

Enum BP_ROLE {
  CUSTOMER     // 受注元（注文を出す企業）
  VENDOR       // 仕入先・外注先
  END_USER     // 需要家（最終ユーザー企業）
}

Enum VENDOR_TYPE {
  SUPPLIER     // 仕入先（素材・資材調達）
  OUTSOURCE    // 外注先（製造工程の一部委託）
}

Enum TAX_TYPE {
  TAXABLE      // 課税
  EXEMPT       // 非課税
  REDUCED      // 軽減税率
}

Enum INVOICE_METHOD {
  EMAIL
  FAX
  POST
  PORTAL
}

// ─── 法人共通マスタ ────────────────────────────
// 1 レコード = 1 法人（または支店）
// ロールは bp_role_assignments で管理（1 法人が複数ロールを持てる）
// 支店は parent_id で親法人を参照（2 階層まで）
Table business_partners {
  id              uuid        [pk]
  bp_code         varchar     [unique]          // 採番コード（例: BP-00001）
  name            json        [not null]        // { ja: '', en: '' }
  name_kana       varchar                       // 読み仮名
  short_name      varchar                       // 略称
  parent_id       uuid                          // 親法人（支店の場合）
  country_code    varchar(2)                    // ISO 3166-1 alpha-2（JP, CN ...）
  postal_code     varchar
  address         json                          // { ja: '', en: '' }
  phone           varchar
  fax             varchar
  email           varchar
  website         varchar
  tax_number      varchar                       // 法人番号等
  match_names     "text[]"    [default: '{}']   // AI抽出の社名照合リスト（表記ゆれ・旧社名）
  is_active       boolean     [default: true]
  notes           text
  created_by      uuid
  created_at      timestamp
  updated_at      timestamp

  indexes {
    parent_id
  }
}

// ─── ロール割当 ────────────────────────────────
// 同一 BP に複数ロール付与可能（例: CUSTOMER + END_USER、VENDOR 単独など）
Table bp_role_assignments {
  id              uuid        [pk]
  bp_id           uuid        [not null, ref: > business_partners.id]
  role            BP_ROLE     [not null]
  is_active       boolean     [default: true]
  assigned_at     timestamp
  deactivated_at  timestamp

  indexes {
    (bp_id, role) [unique]
  }
}

// ─── 受注元（顧客）固有属性 ───────────────────
// CUSTOMER ロールを持つ BP にのみ存在
Table bp_customer_attrs {
  bp_id               uuid            [pk, ref: - business_partners.id]
  customer_code       varchar         [unique]          // 旧システム互換コード（任意）
  billing_bp_id       uuid [ref: > business_partners.id] // 請求先が別法人の場合（nullable）
  closing_day         smallint                          // 締日（1–31、31 = 月末）
  payment_terms_days  int                               // 支払サイト（日数）
  payment_day         smallint                          // 支払日
  credit_limit        numeric(15,2)
  tax_type            TAX_TYPE        [default: 'TAXABLE']
  invoice_method      INVOICE_METHOD  [default: 'EMAIL']
  is_consignment      boolean         [default: false]  // 委託先フラグ
  notes               text
}

// ─── 営業担当（CKK 側の担当者）───────────────────
// CUSTOMER ロール固有。1 顧客に複数登録でき、書類（見積書・注文請書・
// 出荷書・納品書・請求書・価格表・試算）の営業担当はこの一覧から選ぶ。
// is_primary の 1 名が新規書類の既定値（部分 unique index で顧客あたり 1 名）。
// 顧客側の担当者（bp_contacts）とは別物 — こちらは自社の営業。
Table bp_sales_reps {
  bp_id           uuid    [not null, ref: > business_partners.id]
  user_id         uuid    [not null, ref: > users.id]
  is_primary      boolean [default: false]
  sort_order      int     [default: 0]
  created_at      timestamp

  indexes {
    (bp_id, user_id) [pk]
  }
}

// ─── 仕入先・外注先固有属性 ───────────────────
// VENDOR ロールを持つ BP にのみ存在
// vendor_type で仕入先（素材調達）と外注先（工程委託）を区別
Table bp_vendor_attrs {
  bp_id                 uuid            [pk, ref: - business_partners.id]
  vendor_code           varchar         [unique]
  vendor_type           VENDOR_TYPE     [not null]
  closing_day           smallint
  payment_terms_days    int
  payment_day           smallint
  bank_name             varchar
  bank_branch           varchar
  bank_account_type     varchar                         // 普通, 当座 等
  bank_account_number   varchar
  lead_time_days        int                             // 標準リードタイム（外注先）
  notes                 text
}

// ─── 需要家固有属性 ───────────────────────────
// END_USER ロールを持つ BP にのみ存在（任意登録・大口顧客のみ）
Table bp_end_user_attrs {
  bp_id           uuid        [pk, ref: - business_partners.id]
  industry        varchar
  notes           text
}

// ─── 担当者 ───────────────────────────────────
// 法人ごとに複数担当者を管理（受注元・外注先・需要家 共通）
Table bp_contacts {
  id              uuid        [pk]
  bp_id           uuid        [not null, ref: > business_partners.id]
  name            varchar     [not null]
  name_kana       varchar
  department      varchar
  title           varchar
  email           varchar
  phone           varchar
  is_primary      boolean     [default: false]   // 主担当フラグ
  is_active       boolean     [default: true]
  created_at      timestamp
  updated_at      timestamp

  indexes {
    bp_id
  }
}
```

### Other
```
// ===========================
// 学習した照合名（AI 突合）
// ===========================
//
// 取込の突合が外れると人が画面で正しい取引先・製品を選ぶ。その判断は
// 1 回きりで捨てられていて、同じ書式の注文書が来るたびに同じ直しをしていた。
// ここに貯めて次から自動で当てる。
//
// **1 表記 = 1 マスタ**（unique(target_type, alias_key)）。別のマスタへ結び
// 直すと行が移る（最後の訂正が勝つ）ので曖昧さが残らず、突合側は当たった
// 時点で自動確定してよい。突合の順序は 学習済み → 推測（表記ゆれの段階的
// 突合）— 人が決めたものを機械が上書きしない。
//
// マスタ側の match_names（人が先回りして登録する別名）とは役割が違う:
//   match_names   = 「こう書かれるはず」と予想して登録する
//   match_aliases = 「こう書かれていた」を実績から貯める
//
// target_type はテーブル名（audit_logs と同じ多態規約）。FK は張れないので
// マスタを消しても行は残る — 突合時に存在しない target_id は無視する。
Table match_aliases {
  id              serial [pk]
  target_type     varchar [not null]   // business_partners | products
  target_id       varchar [not null]   // マスタ行の内部 id（文字列）
  alias           varchar [not null]   // 書類に印字されていた表記（そのまま）
  alias_key       varchar [not null]   // 突合用の正規化キー（アプリ側で作る）
  hit_count       int [not null, default: 0]  // この表記で自動確定した回数
  last_seen_at    timestamp
  created_by      uuid [ref: > users.id]
  created_at      timestamp
  updated_at      timestamp

  indexes {
    (target_type, alias_key) [unique]
    (target_type, target_id)
  }
}

// ===========================
// ファイルストレージ（SeaweedFS）
// ===========================

Table files {
  id              uuid [pk]
  storage_key     varchar [not null]      // SeaweedFS オブジェクトキー
  filename        varchar [not null]
  mime_type       varchar [not null]
  size_bytes      bigint
  uploaded_by     uuid [ref: > users.id]
  created_at      timestamp
}

// ===========================
// 採番管理
// ===========================

// 採番フォーマット:
//   EST-YYYYMM-NNNNN（試算）
//   QOT-YYYYMM-NNNNN（見積書）
//   ORD-YYYYMM-NNNNN（注文受取書）
//   ORD-YYYYMM-NNNNN-NN（注文明細）
//   DRN-YYYYMM-NNNNN（納品書）
//   INV-YYYYMM-NNNNN（請求書）
//   WOR-YYYYMM-NNNNN（指示書の書類番号 — 表示用。キーは WORK_ORDER_DOC）
//   ロット番号（= work_orders.work_order_number）: 通し連番 (int) —
//     在庫ロット・QR・承認/メモ/監査の業務キーはこちらのまま
Table numbering_sequences {
  key             varchar [pk]            // ESTIMATE, QUOTE, ORDER_ACCEPT, DELIVERY, INVOICE
  prefix          varchar [not null]      // EST, QOT, ORD, DRN, INV
  last_year_month varchar                 // YYYYMM（月次リセット用）
  last_sequence   int [not null, default: 0]
  updated_at      timestamp
}

// ===========================
// フィーチャーフラグ
// ===========================

Table feature_flags {
  key             varchar [pk]
  is_enabled      boolean [not null, default: false]
  description     text
  updated_by      uuid [ref: > users.id]
  updated_at      timestamp
}
```

### Log
```
// -----------------------------
// System Log（統合ログ）
// -----------------------------
// ⚠️ 未実装 — 設計のみ（システム操作ログ）。Prisma スキーマにも DB にも存在しない。
// ただし **LOGIN 相当は login_attempts として実装済み**（下の Security 節）。
// 残りを作るときは、認証イベントを二重に持たないよう login_attempts と
// 役割を分けること。
Table system_logs {
  id              uuid [pk]
  user_id         uuid
  action          varchar      // LOGIN, CREATE_INVOICE, DOWNLOAD_PDF
  resource        varchar      // invoice, auth
  resource_id     varchar      // 任意ID
  status          varchar      // SUCCESS / FAIL
  ip_address      varchar
  user_agent      text
  created_at      timestamp
}

// -----------------------------
// Audit Log（業務監査）
// -----------------------------
Table audit_logs {
  id              serial [pk]
  user_id         uuid
  action          varchar      // CREATE / UPDATE / DELETE
  table_name      varchar      // invoices
  record_id       uuid
  before_data     json
  after_data      json
  // 操作元のキオスク端末（共有タブレット経由のみ。Web からの操作は null）
  kiosk_device_id uuid [ref: > kiosk_devices.id]
  created_at      timestamp
}

// ===========================
// AD Sync Log
// ===========================

Enum SYNC_STATUS {
  RUNNING
  SUCCESS
  PARTIAL
  FAILED
}

// ⚠️ 未実装 — 設計のみ（AD 同期ログ）。Prisma スキーマにも DB にも存在しない。
Table ad_sync_logs {
  id              serial      [pk]
  sync_type       varchar     [not null]           // full, delta, single
  status          SYNC_STATUS [not null]
  total_records   int
  created_count   int
  updated_count   int
  deactivated_count int
  error_message   text
  started_at      timestamp   [not null]
  finished_at     timestamp
}

```

### Security（認証イベント）

```
// 認証イベント（成功・失敗の両方）。Web / キオスクの両方が同じ表に書く。
//
// audit_logs に入れられないのは、あちらが actor（user_id）前提の台帳だから。
// ログイン失敗は「actor が確定しない事象」そのもので、そこには表現できない。
// 実装前は失敗が 1 行も残っていなかった（キオスクはカードのカウンタ、Web は
// インメモリのレート制限だけ）。
//
// **生の秘密を残さない**のが設計の芯:
//   - パスワード / PIN は保存しない
//   - kiosk_cards.id は QR の secret そのものなので、実在カードだけ FK で参照し、
//     未知・偽造カードは HMAC の相関キー（card_ref）だけ残す
//   - ユーザー名も実在ユーザーに解決できたときだけ生値（DB の CHECK でも強制）
//
// 個人データを含むので 3 点セットで守る: SY0D は system 権限 /
// metabase_ro からテーブルごと剥奪（grants.sql）/ pg_cron で保持期間を切る
// （security-cron.sql — 成功 180 日・失敗 400 日）。
Table login_attempts {
  id                  bigserial [pk]
  created_at          timestamp
  app                 LOGIN_APP      // WEB | KIOSK
  outcome             LOGIN_OUTCOME  // SUCCESS | FAILURE
  method              varchar        // 認証方式。enum にしない（必ず増えるため）
  reason              varchar        // 失敗理由。値の集合は lib/login-attempt-core.ts が正
  user_id             uuid [ref: > users.id]
  identifier          varchar        // 実在ユーザーに解決できたときだけ生値
  identifier_ref      char(64)       // HMAC(pepper, 入力値)。未知の入力の相関用
  card_id             varchar [ref: > kiosk_cards.id]  // 実在カードのみ
  card_ref            char(64)       // HMAC(pepper, 正規化スキャン値)
  scan_kind           varchar        // CARD / WO / OTHER / MALFORMED / EMPTY（中身は残さない）
  kiosk_device_id     uuid [ref: > kiosk_devices.id]
  user_device_id      uuid [ref: > user_devices.id]
  ip_address          inet           // **正規形で書くこと**（v4-mapped だと CIDR 検索から漏れる）
  ip_chain            varchar        // x-forwarded-for の生チェーン（信頼ホップ数の検算用）
  user_agent          varchar
  signals_fingerprint char(64)       // サーバーが再計算した端末シグネチャ。**認証要素ではない**
  signals_version     smallint
  signals             json           // 正規化済みシグネチャ（版を上げたら再ハッシュできる）
  ownership           DEVICE_OWNERSHIP
  ownership_source    varchar        // なぜそう判定したか（監査用）
}

// Web ブラウザ端末の台帳。1 行 = (ユーザー, シグネチャ)。
// **端末の同定ではない** — 同一キッティングの PC は衝突し、ブラウザ更新で割れる。
// 「この人がいつも使っている端末か」の目安。成功ログインでのみ upsert する
// （失敗で作ると攻撃者の端末が「登録済み端末」として並ぶ）。
Table user_devices {
  id               uuid [pk]
  user_id          uuid [ref: > users.id]
  fingerprint      char(64)
  signals_version  smallint
  label            varchar          // "Chrome / Windows 11"
  ownership        DEVICE_OWNERSHIP
  ownership_source varchar
  signals          json
  user_agent       varchar
  last_ip_address  inet
  login_count      int
  first_seen_at    timestamp
  last_seen_at     timestamp

  indexes {
    (user_id, fingerprint) [unique]
  }
}

Enum LOGIN_APP { WEB, KIOSK }
Enum LOGIN_OUTCOME { SUCCESS, FAILURE }

// 端末の所有区分（**自動判定のみ**。管理者の上書き欄は持たない）。
// 素のブラウザでは所有を検証できないので、判定と一緒に**根拠の強さ**を残す
// （判定規則は lib/device-ownership-core.ts が唯一の定義）:
//   COMPANY_MANAGED  端末鍵の署名 = 暗号的な証拠（トークンのみは状況証拠）
//   COMPANY_NETWORK  送信元 IP が社内 CIDR = 「社内にいる」だけ。所有の証拠ではない
//   UNMANAGED        証拠なし（私用の可能性。断定ではない）
//   UNKNOWN          判定材料なし（IP 不明 / CIDR 未設定）
// **アクセス制御には使わない** — 表示とアラートのみ。
Enum DEVICE_OWNERSHIP {
  COMPANY_MANAGED
  COMPANY_NETWORK
  UNMANAGED
  UNKNOWN
}
```
