// 純粋な RBAC 判定ロジック（DB 非依存 — 入力は user_permissions の行のみ）。
//
// 判定規則（両アプリの旧 authz.ts の規則を統合し、scope 解決を追加）:
//   一致 = (code, action) が一致 or (code, ADMIN) or (system, ADMIN)
//   実効アクセス =
//     いずれかの一致行が ALL（または superuser）→ ALL
//     それ以外 → 各行を拠点集合へ解決した和集合 + OWN フラグ
//
// scope_values の解決（→ resolveGrantPlants）:
//   PLANT  '*'        → 所属拠点（user_plants）すべて
//   PLANT  コード列挙 → 列挙拠点 ∩ 所属拠点（所属が外側の境界）
//   REGION '*'        → 所属拠点の地域の「全拠点」（再交差しない — 地域は
//                       PLANT より広い階層。全所属拠点が地域未設定なら ∅）
//   REGION コード列挙 → 列挙地域の全拠点（交差しない）
//   OWN               → 拠点なし・own=true
//   COUNTRY/DEPARTMENT/TEAM/SUB → 未実装: 何も与えない（fail-closed）
//   空配列（不正データ）→ 何も与えない（'*' とは扱わない）

import type {
  AppPermissionRef,
  Decision,
  PermissionAction,
  PermissionRow,
  PermissionScope,
  PermissionSet,
  PlantRef,
  ScopeContext,
} from "./types";

export const SUPERUSER_CODE = "system";
export const SUPERUSER_ACTION: PermissionAction = "ADMIN";

/** kiosk の readableCodes 互換 — superuser を表す番兵キー */
export const ALL_CODES = "*";

export function buildPermissionSet(
  rows: readonly PermissionRow[],
): PermissionSet {
  const byCode = new Map<string, PermissionRow[]>();
  let superuser = false;
  for (const row of rows) {
    const list = byCode.get(row.code);
    if (list) {
      list.push(row);
    } else {
      byCode.set(row.code, [row]);
    }
    if (row.code === SUPERUSER_CODE && row.action === SUPERUSER_ACTION) {
      superuser = true;
    }
  }
  return { rows, byCode, superuser };
}

export function isSuperuser(set: PermissionSet): boolean {
  return set.superuser;
}

function matchingRows(
  set: PermissionSet,
  code: string,
  action: PermissionAction,
): PermissionRow[] {
  const rows = set.byCode.get(code) ?? [];
  return rows.filter((r) => r.action === action || r.action === "ADMIN");
}

/** 1 grant 行 → 拠点集合（OWN は plants を持たないため own フラグで返す） */
function resolveGrantPlants(
  row: PermissionRow,
  ctx: ScopeContext,
): { plants: readonly PlantRef[]; own: boolean } {
  switch (row.scope) {
    case "OWN":
      return { plants: [], own: true };
    case "PLANT": {
      if (row.scopeValues.includes(ALL_CODES)) {
        return { plants: ctx.assignedPlants, own: false };
      }
      // 列挙拠点 ∩ 所属拠点 — 所属していない拠点の列挙は無効。
      const named = new Set(row.scopeValues);
      return {
        plants: ctx.assignedPlants.filter((p) => named.has(p.code)),
        own: false,
      };
    }
    case "REGION": {
      let regionCodes: ReadonlySet<string>;
      if (row.scopeValues.includes(ALL_CODES)) {
        regionCodes = new Set(
          ctx.assignedPlants
            .map((p) => p.regionCode)
            .filter((c): c is string => c !== null),
        );
      } else {
        regionCodes = new Set(row.scopeValues);
      }
      if (regionCodes.size === 0) return { plants: [], own: false };
      return {
        plants: ctx.allPlants.filter(
          (p) => p.regionCode !== null && regionCodes.has(p.regionCode),
        ),
        own: false,
      };
    }
    // ALL は呼び出し側で短絡。未実装スコープは fail-closed。
    default:
      return { plants: [], own: false };
  }
}

/**
 * 判定本体。allowed の場合は実効アクセス（ALL / 拠点集合+OWN）を返す。
 * scope を実装しない機能はこれまで通り allowed だけ見ればよい（プラミング）。
 */
export function decide(
  set: PermissionSet,
  ctx: ScopeContext,
  code: string,
  action: PermissionAction,
): Decision {
  const rows = matchingRows(set, code, action);
  if (set.superuser) {
    return { allowed: true, access: { kind: "ALL" } };
  }
  if (rows.length === 0) return { allowed: false };
  if (rows.some((r) => r.scope === "ALL")) {
    return { allowed: true, access: { kind: "ALL" } };
  }
  const plantIds = new Set<number>();
  let own = false;
  for (const row of rows) {
    const resolved = resolveGrantPlants(row, ctx);
    for (const p of resolved.plants) plantIds.add(p.id);
    own = own || resolved.own;
  }
  return { allowed: true, access: { kind: "SCOPED", plantIds, own } };
}

/**
 * READ 可能な permission code の集合（アプリ可視性フィルタ用）。
 * superuser は番兵 "*" を含む（kiosk visibleApps 互換）。
 */
export function readableCodes(set: PermissionSet): ReadonlySet<string> {
  const codes = new Set<string>();
  for (const row of set.rows) {
    if (row.action === "READ" || row.action === "ADMIN") {
      codes.add(row.code);
    }
  }
  if (set.superuser) codes.add(ALL_CODES);
  return codes;
}

/** アプリ一覧 → ユーザーに表示してよい key の集合（requiredPermission=null は常時可視） */
export function visibleAppKeys<T extends AppPermissionRef>(
  set: PermissionSet,
  apps: readonly T[],
): Set<string> {
  const codes = readableCodes(set);
  const all = codes.has(ALL_CODES);
  const keys = new Set<string>();
  for (const app of apps) {
    if (
      app.requiredPermission === null ||
      all ||
      codes.has(app.requiredPermission)
    ) {
      keys.add(app.key);
    }
  }
  return keys;
}

/** scope 型ガード（アダプタの raw 行マッピング用） */
export const PERMISSION_SCOPES: readonly PermissionScope[] = [
  "ALL",
  "REGION",
  "COUNTRY",
  "PLANT",
  "DEPARTMENT",
  "TEAM",
  "SUB",
  "OWN",
];

export const PERMISSION_ACTIONS: readonly PermissionAction[] = [
  "READ",
  "CREATE",
  "UPDATE",
  "DELETE",
  "EXPORT",
  "ADMIN",
];
