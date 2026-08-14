// RBAC 共通型 — nextjs-web / nextjs-kiosk 双方のアダプタが参照する契約。
//
// 前提となる DB 契約（shared-db）:
//   app.user_permissions ビュー = 有効なロール経由の「全」grant 行
//     (user_id, action, permission_code, scope, scope_values)
//   scope_values: text[] — PLANT/REGION スコープの対象コード。'*' = ワイルド
//   カード（PLANT: 所属拠点すべて / REGION: 所属拠点の地域すべて）。

/** role_permission_relation.action（ADMIN は同一コードの全アクションを内包） */
export type PermissionAction =
  | "READ"
  | "CREATE"
  | "UPDATE"
  | "DELETE"
  | "EXPORT"
  | "APPROVE"
  | "ADMIN";

/** SCOPE enum。PLANT/OWN/REGION/ALL のみ現行実装 — 残りは定義のみ（fail-closed） */
export type PermissionScope =
  | "ALL"
  | "REGION"
  | "COUNTRY"
  | "PLANT"
  | "DEPARTMENT"
  | "TEAM"
  | "SUB"
  | "OWN";

/** user_permissions ビューの 1 行（= 1 grant） */
export interface PermissionRow {
  code: string;
  action: PermissionAction;
  scope: PermissionScope;
  /** scope_values。PLANT/REGION 以外では無視される */
  scopeValues: readonly string[];
}

/** 拠点参照（scope 解決用の最小形） */
export interface PlantRef {
  id: number;
  code: string;
  regionCode: string | null;
}

/**
 * スコープ解決に必要なユーザー文脈。
 * assignedPlants = user_plants の所属拠点（有効のみ）。
 * allPlants      = 全有効拠点（REGION 解決に必要 — 地域→拠点集合の展開）。
 */
export interface ScopeContext {
  userId: string;
  assignedPlants: readonly PlantRef[];
  allPlants: readonly PlantRef[];
}

/**
 * 実効アクセス。
 * ALL    = 無制限。
 * SCOPED = plantIds の拠点に属する行 ∪（own のとき）自分が作成した行。
 *          plantIds が空で own=false の場合も合法 — アプリには入れるが
 *          行は 1 件も見えない（fail-closed）。
 */
export type Access =
  | { kind: "ALL" }
  | { kind: "SCOPED"; plantIds: ReadonlySet<number>; own: boolean };

export type Decision = { allowed: false } | { allowed: true; access: Access };

/** buildPermissionSet の結果（decide/readableCodes への入力） */
export interface PermissionSet {
  rows: readonly PermissionRow[];
  byCode: ReadonlyMap<string, readonly PermissionRow[]>;
  /** system:ADMIN 保持 = スーパーユーザー（全コード・全アクション・ALL） */
  superuser: boolean;
}

/** アプリ登録エントリの可視性判定に必要な最小形 */
export interface AppPermissionRef {
  key: string;
  /** null = 権限不要（ログインのみ） */
  requiredPermission: string | null;
}
