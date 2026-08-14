// @ckk/authz-core — nextjs-web / nextjs-kiosk 共通の RBAC 判定コア。
//
// 各アプリの src/lib/authz.ts はこのパッケージの薄いアダプタ:
//   web   : Auth.js セッション解決 + React cache() メモ化 + AuthzResult 互換 API
//   kiosk : kiosk セッションの userId を引数で受ける boolean API（互換維持）
// SQL は sql.ts のみ。判定は permission-set.ts（純粋・単体テスト済み）。

export {
  NEVER,
  ownOrPlantWhere,
  ownWhere,
  plantIdSet,
  plantWhere,
  rowInScope,
} from "./access-where";
export {
  ALL_CODES,
  buildPermissionSet,
  decide,
  isSuperuser,
  PERMISSION_ACTIONS,
  PERMISSION_SCOPES,
  readableCodes,
  SUPERUSER_ACTION,
  SUPERUSER_CODE,
  visibleAppKeys,
} from "./permission-set";
export type { AuthzDb } from "./sql";
export {
  findUserIdsWithPermission,
  loadPermissionRows,
  loadScopeContext,
} from "./sql";
export * from "./types";
