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