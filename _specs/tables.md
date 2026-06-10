## Tables (Database)

> **Conventions（全テーブル共通）**
> - すべての `timestamp` 列は `timestamptz`（UTC 保存）。表示はユーザー／拠点タイムゾーンで変換する。
> - `date` 列（締日・納期・有効日等）は起票拠点（`org_unit`）のローカル日付として解釈する。
> - 金額列は通貨コード（ISO 4217）とセットで保持する。1 ドキュメント 1 通貨（明細はヘッダ通貨を継承）。

### Auth
```
Table users {
  id              uuid [pk]
  group           USER_GROUP
  employee_id     uuid [unique]  // only for employees（nullable: system/guest）
  username        varchar  // AD[uid]
  display_name    varchar  // AD[lastNamePhonetic], AD[firstNamePhonetic] - AD[lastName] AD[lastName]
  email           varchar  // AD[email]
  locale          varchar [not null, default: 'ja']   // UI ロケール（ja / en）
  timezone        varchar                              // IANA tz（null = 主所属拠点の tz）
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
  role_id         int       [not null, ref: > roles.id]

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
  role_id         int [not null, ref: > roles.id]
  permission_code varchar
  action          ACTION
  scope           SCOPE
  scope_custom    numeric  // use when allowing outside execution user's attribute

  indexes {
    (role_id, action, permission_code) [pk]
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
  FACTORY
  DEPARTMENT
  TEAM
  SUB
  OWN
}

View user_permissions {
  user_id         uuid [pk]
  action          ACTION
  permission_code varchar
  scope           SCOPE  // only highest scope
  scope_custom    numeric

  indexes {
    (user_id, action, permission_code) [pk]
  }
}
```

### Organization
```
// ===========================
// 組織構造（多拠点・多国対応）
// RBAC SCOPE（REGION / COUNTRY / FACTORY / DEPARTMENT / TEAM）は
// この階層 × ユーザー所属（user_org_assignments）で解決する。
// 業務ドキュメントは org_unit_id（起票拠点 = FACTORY ノード）を必ず保持する。
// ===========================

Table org_units {
  id              serial [pk]
  type            ORG_UNIT_TYPE [not null]
  parent_id       int [ref: > org_units.id]      // 階層: REGION > COUNTRY > FACTORY > DEPARTMENT > TEAM
  code            varchar [unique, not null]      // 例: APAC, JP, JP-HQ-FCT1, JP-HQ-FCT1-MFG
  name            json [not null]                 // { ja: '', en: '' }
  country_code    varchar(2)                      // ISO 3166-1 alpha-2（COUNTRY 以下で必須）
  timezone        varchar                         // IANA tz（FACTORY で必須。例: Asia/Tokyo）
  default_currency varchar(3)                     // ISO 4217（FACTORY で必須。例: JPY）
  accounting_system varchar                       // FACTORY/COUNTRY の会計アダプタ（例: YAYOI_NEXT）
  is_active       boolean [not null, default: true]
  notes           text
  created_at      timestamp
  updated_at      timestamp
}

Enum ORG_UNIT_TYPE {
  REGION          // 地域（APAC, EMEA, AMER ...）
  COUNTRY         // 国
  FACTORY         // 工場・拠点（業務ドキュメントの起票単位）
  DEPARTMENT      // 部門
  TEAM            // チーム
}

// ユーザー所属。主所属はちょうど 1 件（is_primary = true）、兼務は複数可。
// SCOPE 解決: ユーザーの所属ノードから親を辿り、permission の SCOPE 階層と照合する。
Table user_org_assignments {
  id              uuid [pk]
  user_id         uuid [not null, ref: > users.id]
  org_unit_id     int [not null, ref: > org_units.id]
  is_primary      boolean [not null, default: false]
  assigned_at     timestamp
  deactivated_at  timestamp

  indexes {
    (user_id, org_unit_id) [unique]
  }
}
```

### Finance Master
```
// ===========================
// 為替・税率（多通貨・多国対応）
// ===========================

// 為替レート: 基準通貨（グループ機能通貨 = JPY）に対する各通貨のレート。
// 請求書発行時にレートをスナップショットし invoices.exchange_rate に保持する。
Table exchange_rates {
  id              uuid [pk]
  base_currency   varchar(3) [not null, default: 'JPY']
  quote_currency  varchar(3) [not null]
  rate            numeric(18,8) [not null]    // 1 quote_currency = rate × base_currency
  valid_from      date [not null]
  source          varchar                     // MANUAL / 取得元 API 名
  created_by      uuid [ref: > users.id]
  created_at      timestamp

  indexes {
    (base_currency, quote_currency, valid_from) [unique]
  }
}

// 税率: 国 × 税区分 × 適用開始日。請求書発行日時点の税率を解決する。
Table tax_rates {
  id              serial [pk]
  country_code    varchar(2) [not null]       // 課税国（原則 = 起票拠点の国）
  tax_type        TAX_TYPE [not null]
  rate            numeric(6,4) [not null]     // 0.1000 = 10%
  valid_from      date [not null]
  valid_until     date                        // null = 無期限
  notes           text

  indexes {
    (country_code, tax_type, valid_from) [unique]
  }
}
```

### Master Data
```
// ===========================
// 素材・製品
// ===========================

// 材種: [A-Z][0-9]{2}[A-Z][0-9]{4} 例: A01A0001
Table material_types {
  id              varchar [pk]            // 材種コード
  name            json [not null]         // { ja: '', en: '' }
  description     json
  is_active       boolean [default: true]
  created_at      timestamp
  updated_at      timestamp
}

// 素材: [材種コード]-[A-C][0-9]{3}-[0-9]{3} 例: A01A0001-A001-001
Table materials {
  id              varchar [pk]            // 素材コード
  material_type_id varchar [not null, ref: > material_types.id]
  name            json [not null]         // { ja: '', en: '' }
  unit            varchar [not null]      // 本, kg, m など
  material_form   MATERIAL_FORM [not null]
  is_active       boolean [default: true]
  notes           text
  created_at      timestamp
  updated_at      timestamp
}

Enum MATERIAL_FORM {
  POLISHED        // 研磨
  STANDARD_LENGTH // 定尺
  SEMI_FINISHED   // 半製品（外部調達）
  OTHER
}

// 製品コード: PRD-YYYYMM-NNNN
Table products {
  id              varchar [pk]            // 製品コード
  name            json [not null]         // { ja: '', en: '' }
  material_id     varchar [ref: > materials.id]
  unit            varchar [not null, default: '本']
  spec            json                    // 仕様（フリー構造）
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
// 価格表（§1）
// ===========================

// 顧客 + 製品 + 注文種別 + 本数 → 単価。有効日で管理。
Table price_lists {
  id              uuid [pk]
  customer_bp_id  uuid [not null, ref: > business_partners.id]
  product_id      varchar [not null, ref: > products.id]
  order_type      ORDER_TYPE [not null]
  min_quantity    int [not null, default: 1]
  max_quantity    int                          // null = 上限なし
  unit_price      numeric(12,2) [not null]
  currency        varchar [not null, default: 'JPY']
  valid_from      date [not null]
  valid_until     date                         // null = 無期限
  is_active       boolean [default: true]
  created_by      uuid [ref: > users.id]
  created_at      timestamp
  updated_at      timestamp
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
  org_unit_id     int [not null, ref: > org_units.id]   // 起票拠点（FACTORY）
  customer_bp_id  uuid [not null, ref: > business_partners.id]
  customer_branch_bp_id uuid [ref: > business_partners.id]
  currency        varchar(3) [not null, default: 'JPY'] // 1 見積 1 通貨（明細はこれを継承）
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
  price_list_id   uuid [ref: > price_lists.id]  // 自動生成元（手動入力時は null）
  discount_amount numeric(12,2) [not null, default: 0]  // カスタム値引き額（任意）
  amount          numeric(12,2) [not null]      // unit_price * quantity - discount_amount
  delivery_date   date
  notes           text
  sort_order      int [not null, default: 0]
}

// ===========================
// 注文受諾書（§2）ORD-YYYYMM-NNNNN
// ===========================

Table order_acceptances {
  id              uuid [pk]
  order_number    varchar [unique, not null]
  org_unit_id     int [not null, ref: > org_units.id]   // 起票拠点（FACTORY）
  quote_id        uuid [ref: > quotes.id]
  customer_bp_id  uuid [not null, ref: > business_partners.id]
  customer_branch_bp_id uuid [ref: > business_partners.id]
  customer_order_ref varchar               // 顧客注文書番号（FAX受取）
  status          ORDER_ACCEPTANCE_STATUS [not null, default: 'PENDING']
  currency        varchar(3) [not null, default: 'JPY'] // 見積から継承
  total_amount    numeric(12,2)            // 受注書から自動計算
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
// 受注書（§3）ORD-YYYYMM-NNNNN-NN
// ===========================

Table sales_orders {
  id              uuid [pk]
  sales_order_number varchar [unique, not null]
  org_unit_id     int [not null, ref: > org_units.id]   // 起票拠点（FACTORY）
  order_acceptance_id uuid [not null, ref: > order_acceptances.id]
  product_id      varchar [not null, ref: > products.id]
  lot_number      int [unique]             // 通し連番（指示書と共用）
  order_type      ORDER_TYPE [not null]
  quantity        int [not null]
  currency        varchar(3) [not null, default: 'JPY'] // 注文受諾書から継承
  unit_price      numeric(12,2) [not null]
  amount          numeric(12,2) [not null]
  delivery_date   date
  status          SALES_ORDER_STATUS [not null, default: 'DRAFT']
  end_user_bp_id  uuid [ref: > business_partners.id]  // 任意
  is_locked       boolean [not null, default: false]  // 承認依頼中のロック
  notes           text
  created_by      uuid [ref: > users.id]
  created_at      timestamp
  updated_at      timestamp
}

Enum SALES_ORDER_STATUS {
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

Table work_orders {
  id              uuid [pk]
  work_order_number int [unique, not null]  // 通し連番
  org_unit_id     int [not null, ref: > org_units.id]   // 製造拠点（FACTORY）
  sales_order_id  uuid [not null, ref: > sales_orders.id]
  type            WORK_ORDER_TYPE [not null]
  planned_quantity int [not null]
  material_id     varchar [ref: > materials.id]
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

Enum WORK_ORDER_APPROVAL_STATUS {
  NONE
  PENDING_1ST
  APPROVED_1ST
  PENDING_2ND
  APPROVED
  REJECTED
}

// 指示書に紐付く検査表テンプレート（複数可）
Table work_order_inspection_templates {
  work_order_id         uuid [not null, ref: > work_orders.id]
  inspection_template_id uuid [not null, ref: > inspection_templates.id]
  indexes {
    (work_order_id, inspection_template_id) [pk]
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
  supplier_bp_id  uuid [ref: > business_partners.id]  // 外注時
  outsource_requested_at date
  outsource_expected_at  date
  outsource_received_at  date
  status          STEP_STATUS [not null, default: 'PENDING']
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

// ===========================
// 承認（§6）
// ===========================

Table approval_groups {
  id              serial [pk]
  type            APPROVAL_GROUP_TYPE [not null]
  name            json [not null]         // { ja: '', en: '' }
  is_active       boolean [not null, default: true]
}

Enum APPROVAL_GROUP_TYPE {
  FIRST           // 第一承認（生産判断：工場長・部長クラス）
  SECOND          // 第二承認（部門承認：部長クラス）
  WORKFLOW_CHANGE // 製造ワークフロー変更承認
}

Table approval_group_members {
  group_id        int [not null, ref: > approval_groups.id]
  user_id         uuid [not null, ref: > users.id]
  is_active       boolean [not null, default: true]
  indexes {
    (group_id, user_id) [pk]
  }
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

Table approval_requests {
  id              uuid [pk]
  work_order_id   uuid [not null, ref: > work_orders.id]
  step            APPROVAL_STEP [not null]
  status          APPROVAL_REQUEST_STATUS [not null, default: 'PENDING']
  requested_by    uuid [ref: > users.id]
  requested_at    timestamp
  notes           text
}

Enum APPROVAL_STEP {
  FIRST
  SECOND
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
  org_unit_id     int [not null, ref: > org_units.id]   // 保管拠点（FACTORY）
  product_id      varchar [not null, ref: > products.id]
  lot_number      int [ref: > work_orders.work_order_number]
  quantity        int [not null, default: 0]
  reserved_quantity int [not null, default: 0]
  location        varchar                                // 拠点内ロケーション
  notes           text
  updated_at      timestamp
}

Table material_inventory {
  id              uuid [pk]
  org_unit_id     int [not null, ref: > org_units.id]   // 保管拠点（FACTORY）
  material_id     varchar [not null, ref: > materials.id]
  quantity        numeric(12,3) [not null, default: 0]
  reserved_quantity numeric(12,3) [not null, default: 0]
  unit            varchar [not null]
  location        varchar                                // 拠点内ロケーション
  notes           text
  updated_at      timestamp
}

// 在庫引当・予約（全工程完了まで予約状態を維持）
Table inventory_reservations {
  id              uuid [pk]
  inventory_type  INVENTORY_TYPE [not null]
  inventory_id    uuid [not null]
  sales_order_id  uuid [ref: > sales_orders.id]
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
  reference_type  varchar                   // work_order, shipping_order, material_receipt...
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

// 素材入荷（購買・外部調達）
Table material_receipts {
  id              uuid [pk]
  org_unit_id     int [not null, ref: > org_units.id]   // 受入拠点（FACTORY）
  material_id     varchar [not null, ref: > materials.id]
  supplier_bp_id  uuid [ref: > business_partners.id]
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

Table shipping_orders {
  id              uuid [pk]
  org_unit_id     int [not null, ref: > org_units.id]   // 出荷拠点（FACTORY）
  sales_order_id  uuid [not null, ref: > sales_orders.id]
  work_order_id   uuid [ref: > work_orders.id]
  type            SHIPPING_TYPE [not null]
  status          SHIPPING_STATUS [not null, default: 'DRAFT']
  shipped_at      timestamp
  notes           text
  created_by      uuid [ref: > users.id]
  created_at      timestamp
  updated_at      timestamp
}

Enum SHIPPING_TYPE {
  STOCK_STORAGE   // 在庫保管（予備製作分・請求フロー外）
  DISPATCH        // 発送
}

Enum SHIPPING_STATUS {
  DRAFT
  CONFIRMED
  SHIPPED
}

Table shipping_order_items {
  id              uuid [pk]
  shipping_order_id uuid [not null, ref: > shipping_orders.id]
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
  org_unit_id     int [not null, ref: > org_units.id]   // 出荷拠点（FACTORY）
  shipping_order_id uuid [not null, ref: > shipping_orders.id]
  currency        varchar(3) [not null, default: 'JPY'] // 受注書から継承（明細単価・金額の通貨）
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
  org_unit_id     int [not null, ref: > org_units.id]   // 請求元拠点（FACTORY）
  customer_bp_id  uuid [not null, ref: > business_partners.id]
  customer_branch_bp_id uuid [ref: > business_partners.id]
  billing_period_from date [not null]
  billing_period_to   date [not null]
  currency        varchar(3) [not null, default: 'JPY'] // 請求通貨（対象受注書と同一であること）
  subtotal        numeric(12,2) [not null]
  tax_rate        numeric(6,4) [not null]               // 発行時に tax_rates から解決・スナップショット
  tax_amount      numeric(12,2) [not null]
  total_amount    numeric(12,2) [not null]
  exchange_rate   numeric(18,8)                         // 発行日時点の対 JPY レート（currency = JPY なら 1）
  base_total_amount numeric(12,2)                       // JPY 換算額（会計連携・連結用）
  status          INVOICE_STATUS [not null, default: 'DRAFT']
  issued_at       timestamp
  due_date        date
  sent_at         timestamp
  pdf_file_id     uuid [ref: > files.id]
  accounting_exported_at timestamp                      // 会計アダプタ（JP: 弥生会計 Next）エクスポート済み
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
  shipping_order_id uuid [ref: > shipping_orders.id]
  delivery_note_id  uuid [ref: > delivery_notes.id]
  description     json [not null]         // { ja: '', en: '' }
  quantity        int [not null]
  unit_price      numeric(12,2) [not null]
  amount          numeric(12,2) [not null]
  sort_order      int [not null, default: 0]
}

Table billing_closings {
  id              uuid [pk]
  org_unit_id     int [not null, ref: > org_units.id]   // 締め処理拠点（FACTORY。締日は拠点 tz 基準）
  customer_bp_id  uuid [not null, ref: > business_partners.id]
  closing_date    date [not null]
  status          CLOSING_STATUS [not null, default: 'PENDING']
  currency        varchar(3) [not null, default: 'JPY']
  total_amount    numeric(12,2)
  processed_at    timestamp
  processed_by    uuid [ref: > users.id]
  notes           text
  created_at      timestamp
}

Enum CLOSING_STATUS {
  PENDING
  PROCESSED
  EXPORTED        // 会計システムへエクスポート済み（JP 拠点: 弥生会計 Next）
}

// ===========================
// 設計依頼（§10）
// ===========================

Table design_requests {
  id              uuid [pk]
  request_number  varchar [unique, not null]
  trigger         DESIGN_TRIGGER [not null]
  quote_id        uuid [ref: > quotes.id]           // 見積時
  sales_order_id  uuid [ref: > sales_orders.id]     // 受注時
  product_id      varchar [ref: > products.id]
  description     text
  status          DESIGN_STATUS [not null, default: 'PENDING']
  completed_at    timestamp
  created_by      uuid [ref: > users.id]
  created_at      timestamp
  updated_at      timestamp
}

Enum DESIGN_TRIGGER {
  QUOTE           // 見積時（§1 と並行）
  SALES_ORDER     // 受注時（§3 と並行）
}

Enum DESIGN_STATUS {
  PENDING
  IN_PROGRESS
  COMPLETED
}

Table design_files {
  id              uuid [pk]
  design_request_id uuid [ref: > design_requests.id]
  product_id      varchar [ref: > products.id]
  file_id         uuid [not null, ref: > files.id]
  version         int [not null, default: 1]
  is_latest       boolean [not null, default: true]
  notes           text
  created_by      uuid [ref: > users.id]
  created_at      timestamp
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
  currency            varchar(3)      [not null, default: 'JPY']  // 取引通貨（見積・請求のデフォルト）
  tax_type            TAX_TYPE        [default: 'TAXABLE']
  invoice_method      INVOICE_METHOD  [default: 'EMAIL']
  is_consignment      boolean         [default: false]  // 委託先フラグ
  notes               text
}

// ─── 仕入先・外注先固有属性 ───────────────────
// VENDOR ロールを持つ BP にのみ存在
// vendor_type で仕入先（素材調達）と外注先（工程委託）を区別
Table bp_vendor_attrs {
  bp_id                 uuid            [pk, ref: - business_partners.id]
  vendor_code           varchar         [unique]
  vendor_type           VENDOR_TYPE     [not null]
  currency              varchar(3)      [not null, default: 'JPY']  // 支払通貨
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
//   QOT-YYYYMM-NNNNN（見積書）
//   ORD-YYYYMM-NNNNN（注文受取書）
//   ORD-YYYYMM-NNNNN-NN（受注書）
//   DRN-YYYYMM-NNNNN（納品書）
//   INV-YYYYMM-NNNNN（請求書）
//   指示書・ロット番号: 通し連番 (int)
//
// 多拠点ポリシー（確定）:
//   シーケンスは全拠点共通のグローバル採番（単一 DB・SELECT ... FOR UPDATE で行ロック）。
//   番号から拠点は判別しない — 拠点はドキュメントの org_unit_id で管理する。
//   YYYYMM は起票拠点タイムゾーンの年月。
Table numbering_sequences {
  key             varchar [pk]            // QUOTE, ORDER_ACCEPT, DELIVERY, INVOICE
  prefix          varchar [not null]      // QOT, ORD, DRN, INV
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
