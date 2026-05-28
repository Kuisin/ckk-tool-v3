## Tables (Database)
### Auth
```
Table users {
  id              uuid [pk]
  group           USER_GROUP
  employee_id     uuid [unique]  // only for employees（nullable: system/guest）
  username        varchar  // AD[uid]
  display_name    varchar  // AD[lastNamePhonetic], AD[firstNamePhonetic] - AD[lastName] AD[lastName]
  email           varchar  // AD[email]
  is_active       boolean
  last_login_at   timestamp
  created_at      timestamp
  updated_at      timestamp
}

Enum USER_GROUP {
  SYSTEM,
  EMPLOYEE,
  GUEST
}

Table roles {
  id              serial [pk]
  is_system       boolean
  rolename        varchar  // only alphabet, number and symbol allowed
  display_name    json  // { ja: '', en: '' }
  description     json  // { ja: '', en: '' }
}

Table user_role_relation {
  user_id         uuid      [not null]
  role_id         numeric   [not null]

  is_active       boolean
  assigned_at     timestamp
  deactivate_at   timestamp

  assigned_by     uuid

  indexes {
    (user_id, role_id) [pk]
  }
}

Table permissions {
  code            varchar [pk]  // invoice, sales...
  display_name    json  // { ja: '', en: '' }
  description     json  // { ja: '', en: '' }
}

Table role_permission_relation {
  role_id         numeric
  permission_code varchar
  action          ACTION
  scope           SCOPE
  scope_custom    numeric  // use when allowing outside execution user's attribute

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
  user_id         uuid [pk]
  action          ACTION
  permission_code varchar
  scope           SCOPE  // only highest scope
  scope_custom    numeric

  indexes {
    (user_id, action, permission_code) [pk]
  }
}
```

### Logic

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
```

### Log
```
// -----------------------------
// System Log（統合ログ）
// -----------------------------
Table system_logs {
  id              uuid [pk]
  user_id         uuid
  action          varchar      // LOGIN, CREATE_INVOICE, DOWNLOAD_PDF
  resource        varchar      // invoice, auth
  resource_id     varchar      // 任意ID
  status          varchar      // SUCCESS / FAIL
  ip_address      varchar
  user_agent      text
  created_at      timestamp
}

// -----------------------------
// Audit Log（業務監査）
// -----------------------------
Table audit_logs {
  id              serial [pk]
  user_id         uuid
  action          varchar      // CREATE / UPDATE / DELETE
  table_name      varchar      // invoices
  record_id       uuid
  before_data     json
  after_data      json
  created_at      timestamp
}

// ===========================
// AD Sync Log
// ===========================
Table ad_sync_logs {
  id              serial      [pk]
  sync_type       varchar     [not null]           // full, delta, single
  status          SYNC_STATUS [not null]
  total_records   int
  created_count   int
  updated_count   int
  deactivated_count int
  error_message   text
  started_at      timestamp   [not null]
  finished_at     timestamp
}
```