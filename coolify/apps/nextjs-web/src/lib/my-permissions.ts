import "server-only";

/**
 * my-permissions.ts — 「自分は何を持っていて、何を持っていないか」を組み立てる。
 *
 * これまで権限の状態が見えるのは SY01（system 権限が要る）だけで、**本人が自分の
 * 権限を確かめる場所が無かった**。「権限がありません」と出ても、何が足りないのか
 * 分からないまま管理者に聞くしかない。
 *
 * ここでは **持っていない権限も含めて全件**返す。持っているものだけを並べると、
 * 「一覧に無い」が「権限が無い」なのか「そんな権限は存在しない」なのか区別
 * できない — 区別できることがこの画面の目的なので、両方出す。
 */

import { isSuperuser } from "@ckk/authz-core";
import { getPermissionSet, getScopeContext } from "@/lib/authz";
import {
  PERMISSION_GROUP_ORDER,
  PERMISSIONS,
  type PermissionGroup,
} from "@/lib/permission-labels";
import { peekElevations } from "@/lib/privileged-access";
import {
  isElevationCode,
  operationsForCode,
  PRIVILEGED_OPERATIONS,
} from "@/lib/privileged-operations";

/** 特権操作 1 件の、いまの状態。 */
export interface MyOperationState {
  key: string;
  label: string;
  description: string;
  /** いま実行できるか。 */
  allowed: boolean;
  /** 申請する資格があるか（無ければロールから足りない）。 */
  canRequest: boolean;
  /** 承認依頼中の申請があるか。 */
  pending: boolean;
  /**
   * 残り（ミリ秒）。**まだ一度も使っていない付与では窓の終わりまで**なので、
   * これをそのまま「残り時間」として出すと、1 回あたりの持ち時間より長く
   * 見えてしまう。表示するかどうかは state で決めること。
   */
  remainingMs: number | null;
  /** ARMED = まだ時計が動いていない / ACTIVE = 動いている。 */
  state: string | null;
  /** 管理者として素通ししているか。 */
  viaAdmin: boolean;
}

export interface MyPermissionRow {
  code: string;
  label: string;
  summary: string;
  group: PermissionGroup;
  /** その権限を何らかの形で持っているか。 */
  granted: boolean;
  /** 持っているアクション（表示名）。ADMIN 保持なら「管理」1 つ。 */
  actions: string[];
  /** 範囲の表示名（複数の grant があれば複数）。 */
  scopes: string[];
  /** 承認する側の権限を持っているか。 */
  canApprove: boolean;
  /** 特権操作コードなら、その操作ごとの状態。 */
  operations: MyOperationState[];
}

export interface MyPermissionsView {
  superuser: boolean;
  groups: { group: PermissionGroup; rows: MyPermissionRow[] }[];
  /** 持っている権限の数 / 全体。 */
  grantedCount: number;
  totalCount: number;
}

/**
 * 本人の権限一覧。未ログインなら null。
 *
 * **peek しか呼ばない** — この画面を開いただけで特権の持ち時間が動きはじめては
 * いけない（lib/privileged-access.ts の peek / use の使い分け）。
 */
export async function getMyPermissions(): Promise<MyPermissionsView | null> {
  const set = await getPermissionSet();
  const ctx = await getScopeContext();
  if (!set || !ctx) return null;

  const superuser = isSuperuser(set);

  // 特権操作の状態はまとめて 1 回だけ引く（コードごとに引くとクエリが増える）。
  const opStates = await peekElevations(
    PRIVILEGED_OPERATIONS.map((o) => o.key),
  );

  const rows: MyPermissionRow[] = PERMISSIONS.map((meta) => {
    const grants = set.byCode.get(meta.code) ?? [];
    const admin = grants.some((g) => g.action === "ADMIN");
    const actions = admin
      ? ["ADMIN"]
      : [...new Set(grants.map((g) => g.action))];
    const scopes = [...new Set(grants.map((g) => g.scope))];

    const operations: MyOperationState[] = isElevationCode(meta.code)
      ? operationsForCode(meta.code).map((op) => {
          const v = opStates[op.key];
          return {
            key: op.key,
            label: op.label.ja,
            description: op.description.ja,
            allowed: v?.allowed ?? false,
            canRequest: v?.canRequest ?? false,
            pending: v?.pending ?? false,
            remainingMs: v?.remainingMs ?? null,
            state: v?.state ?? null,
            viaAdmin: v?.viaAdmin ?? false,
          };
        })
      : [];

    return {
      code: meta.code,
      label: meta.label.ja,
      summary: meta.summary.ja,
      group: meta.group,
      granted: superuser || grants.length > 0,
      actions: superuser && actions.length === 0 ? ["ADMIN"] : actions,
      scopes: superuser && scopes.length === 0 ? ["ALL"] : scopes,
      canApprove: superuser || grants.some((g) => g.action === "APPROVE"),
      operations,
    };
  });

  return {
    superuser,
    groups: PERMISSION_GROUP_ORDER.map((group) => ({
      group,
      rows: rows.filter((r) => r.group === group),
    })).filter((g) => g.rows.length > 0),
    grantedCount: rows.filter((r) => r.granted).length,
    totalCount: rows.length,
  };
}
