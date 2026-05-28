## Tables (Database)
### Auth
```
Table users {
  id              uuid [pk]
  group           USER_GROUP
  employee_id     uuid [unique]  // only for employees（nullable: system/guest）
  username        varchar  // AD[uid]
  display_name    varchar  // AD[lastNamePhonetic], AD[firstNamePhonetic] - AD[lastName] AD[lastName]
  email           varchar  // AD[email]
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

### Master Data
```
// ===========================
// 顧客（2階層：企業 → 支店）
// ===========================

Table customers {
  id              uuid [pk]
  code            varchar [unique, not null]
  name            json [not null]         // { ja: '', en: '' }
  short_name      json                    // { ja: '', en: '' }
  is_active       boolean [default: true]
  notes           text
  created_at      timestamp
  updated_at      timestamp
}

Table customer_branches {
  id              uuid [pk]
  customer_id     uuid [not null, ref: > customers.id]
  code            varchar [unique, not null]
  name            json [not null]         // { ja: '', en: '' }
  address         text
  is_active       boolean [default: true]
  notes           text
  created_at      timestamp
  updated_at      timestamp
}

// 最終需要家（大口顧客のみ任意登録）
Table end_users {
  id              uuid [pk]
  customer_id     uuid [not null, ref: > customers.id]
  name            json [not null]         // { ja: '', en: '' }
  is_active       boolean [default: true]
  notes           text
  created_at      timestamp
  updated_at      timestamp
}

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

// 外注企業（センタレス・コーティング等）
Table suppliers {
  id              uuid [pk]
  code            varchar [unique, not null]
  name            json [not null]         // { ja: '', en: '' }
  contact         json                    // 担当者情報 { name, email, phone }
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
  customer_id     uuid [not null, ref: > customers.id]
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
  customer_id     uuid [not null, ref: > customers.id]
  customer_branch_id uuid [ref: > customer_branches.id]
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
  unit_price      numeric(12,2) [not null]
  amount          numeric(12,2) [not null]
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
  quote_id        uuid [ref: > quotes.id]
  customer_id     uuid [not null, ref: > customers.id]
  customer_branch_id uuid [ref: > customer_branches.id]
  customer_order_ref varchar               // 顧客注文書番号（FAX受取）
  status          ORDER_ACCEPTANCE_STATUS [not null, default: 'PENDING']
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
  order_acceptance_id uuid [not null, ref: > order_acceptances.id]
  product_id      varchar [not null, ref: > products.id]
  lot_number      int [unique]             // 通し連番（指示書と共用）
  order_type      ORDER_TYPE [not null]
  quantity        int [not null]
  unit_price      numeric(12,2) [not null]
  amount          numeric(12,2) [not null]
  delivery_date   date
  status          SALES_ORDER_STATUS [not null, default: 'DRAFT']
  end_user_id     uuid [ref: > end_users.id]  // 任意
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
  supplier_id     uuid [ref: > suppliers.id]     // 外注時
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
  product_id      varchar [not null, ref: > products.id]
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
  material_id     varchar [not null, ref: > materials.id]
  supplier_id     uuid [ref: > suppliers.id]
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
  shipping_order_id uuid [not null, ref: > shipping_orders.id]
  delivery_method DELIVERY_METHOD [not null]
  recipient_id    uuid [not null, ref: > customers.id]
  recipient_branch_id uuid [ref: > customer_branches.id]
  end_user_id     uuid [ref: > end_users.id]    // ユーザー直送時
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
  customer_id     uuid [not null, ref: > customers.id]
  customer_branch_id uuid [ref: > customer_branches.id]
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
  customer_id     uuid [not null, ref: > customers.id]
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

### 外部関係者マスタ（Business Partner）
```
// ===========================
// 外部関係者マスタ（BP）
// S/4HANA BP モデルに準拠: 1 法人エンティティ + 複数ロール割当
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
  billing_bp_id       uuid                              // 請求先が別法人の場合（nullable）
  closing_day         smallint                          // 締日（1–31、31 = 月末）
  payment_terms_days  int                               // 支払サイト（日数）
  payment_day         smallint                          // 支払日
  credit_limit        numeric(15,2)
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
