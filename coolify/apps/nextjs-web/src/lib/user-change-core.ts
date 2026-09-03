/**
 * user-change-core.ts — ユーザー変更依頼（方式 B）の内容と検証。純ロジック。
 *
 * 方式 A（時限昇格）と違い、こちらは**それ自体が 1 つの具体的な変更**である操作を
 * 扱う。「これから 2 時間ユーザーを止められる権利」を配るのではなく、
 * 「この人をこの理由で止めたい」を 1 件として出し、承認がその変更を適用する。
 * 対象を事前に名指しできるのだから、名指しした形で承認を受けるほうが正確で、
 * 承認者も「誰が止まるのか」を見て判断できる。
 *
 * work_order_flow_changes / order_acceptance_cancel_requests と同じ形。
 *
 * payload は kind ごとに形が違うので Json 1 列にして、境界（申請時と適用時の
 * 両方）でこのスキーマに通す。DB 側は JSONB のままなので、後から種類を足しても
 * マイグレーションは要らない。
 */

import type { getTranslations } from "next-intl/server";
import { z } from "zod";

type Tr = Awaited<ReturnType<typeof getTranslations>>;

export const USER_CHANGE_KINDS = [
  "SUSPEND",
  "RESTORE",
  "UPDATE_PLANTS",
  "UPDATE_ROLES",
] as const;

export type UserChangeKind = (typeof USER_CHANGE_KINDS)[number];

export function isUserChangeKind(v: string): v is UserChangeKind {
  return (USER_CHANGE_KINDS as readonly string[]).includes(v);
}

/** 訳は呼び出し側の `tr` に委ねる（このファイルは pure / server-safe のみ）。 */
export function userChangeLabel(kind: UserChangeKind, tr: Tr): string {
  switch (kind) {
    case "SUSPEND":
      return tr("common.userChangeSuspend");
    case "RESTORE":
      return tr("common.userChangeRestore");
    case "UPDATE_PLANTS":
      return tr("common.userChangeUpdatePlants");
    case "UPDATE_ROLES":
      return tr("common.userChangeUpdateRoles");
  }
}

/** 一覧のバッジ色（_specs/design.md §9 の考え方に合わせる）。 */
export const USER_CHANGE_COLOR: Record<UserChangeKind, string> = {
  SUSPEND: "red",
  RESTORE: "green",
  UPDATE_PLANTS: "blue",
  // ロールは権限そのものを動かすので、拠点（blue）より強い色で並べて区別する。
  UPDATE_ROLES: "violet",
};

/** 停止は「恒久」か「期限つき」。期限つきなら pg_cron が期限で戻す。 */
export const suspendPayloadSchema = z.object({
  kind: z.enum(["temporary", "permanent"]),
  /** temporary のときの復帰予定日時（ISO 文字列）。permanent では null。 */
  until: z.string().nullable(),
  disabledReason: z.string().max(200).optional(),
});

export const restorePayloadSchema = z.object({});

export const updatePlantsPayloadSchema = z.object({
  plantIds: z.array(z.number().int().positive()).max(200),
});

/**
 * ロール割当の変更。**変更後の全体**を渡す（差分ではない）。
 *
 * 差分（付ける / 外す）にしないのは、申請から承認までの間に別の変更が入ると
 * 「A を付ける」の意味が変わってしまうため。全体を渡しておけば、承認時点で
 * 何になるのかが 1 通りに決まる。空配列 = 全ロールを外す（＝権限ゼロ）。
 */
export const updateRolesPayloadSchema = z.object({
  roleIds: z.array(z.number().int().positive()).max(100),
});

export type SuspendPayload = z.infer<typeof suspendPayloadSchema>;
export type RestorePayload = z.infer<typeof restorePayloadSchema>;
export type UpdatePlantsPayload = z.infer<typeof updatePlantsPayloadSchema>;
export type UpdateRolesPayload = z.infer<typeof updateRolesPayloadSchema>;

/** kind → その payload スキーマ。申請時と適用時の両方でこれを通す。 */
export function payloadSchemaFor(kind: UserChangeKind) {
  switch (kind) {
    case "SUSPEND":
      return suspendPayloadSchema;
    case "RESTORE":
      return restorePayloadSchema;
    case "UPDATE_PLANTS":
      return updatePlantsPayloadSchema;
    case "UPDATE_ROLES":
      return updateRolesPayloadSchema;
  }
}

/**
 * payload を検証する。壊れていればメッセージ、通れば null。
 * 適用時にも必ず通すこと — 申請から承認までの間に、DB を直接触られている
 * 可能性を排除できないため。
 */
export function validatePayload(
  kind: UserChangeKind,
  payload: unknown,
  tr: Tr,
): string | null {
  const parsed = payloadSchemaFor(kind).safeParse(payload);
  if (parsed.success) return null;
  return parsed.error.issues[0]?.message ?? tr("common.requestContentInvalid");
}

/**
 * 承認者に見せる 1 行の要約。「何が起きるのか」を承認前に読めるようにする。
 *
 * 拠点もロールも payload には id しか入っていないので、呼び出し側が名前の
 * 対応表を渡す。渡されなければ `#12` のような id 表示に落ちる — 読めはするが
 * 判断はできないので、決裁画面では必ず渡すこと。
 */
export function describeUserChange(
  kind: UserChangeKind,
  payload: unknown,
  tr: Tr,
  names?: {
    plants?: ReadonlyMap<number, string>;
    roles?: ReadonlyMap<number, string>;
  },
): string {
  switch (kind) {
    case "SUSPEND": {
      const p = suspendPayloadSchema.safeParse(payload);
      if (!p.success) return userChangeLabel("SUSPEND", tr);
      if (p.data.kind === "permanent") return tr("common.suspendPermanently");
      return p.data.until
        ? tr("common.suspendUntil", { until: p.data.until })
        : tr("common.suspendWithDeadline");
    }
    case "RESTORE":
      return tr("common.restoreFromSuspension");
    case "UPDATE_PLANTS": {
      const p = updatePlantsPayloadSchema.safeParse(payload);
      if (!p.success) return userChangeLabel("UPDATE_PLANTS", tr);
      if (p.data.plantIds.length === 0)
        return tr("common.removeAllAssignedSites");
      const labels = p.data.plantIds.map(
        (id) => names?.plants?.get(id) ?? tr("common.siteHash", { id }),
      );
      return tr("common.setAssignedSitesTo", { names: labels.join(" / ") });
    }
    case "UPDATE_ROLES": {
      const p = updateRolesPayloadSchema.safeParse(payload);
      if (!p.success) return userChangeLabel("UPDATE_ROLES", tr);
      // 「全部外す」は権限ゼロを意味するので、空欄ではなく言葉で出す。
      if (p.data.roleIds.length === 0) return tr("common.removeAllRoles");
      const labels = p.data.roleIds.map(
        (id) => names?.roles?.get(id) ?? tr("common.roleHash", { id }),
      );
      return tr("common.setRolesTo", { names: labels.join(" / ") });
    }
  }
}

// ─── ロール変更のガード（純関数）─────────────────────────────────────────────

export type RoleChangeBlock = "self" | "last-admin" | "unknown-role";

export interface RoleChangeDecision {
  ok: boolean;
  block?: RoleChangeBlock;
  message: string | null;
}

export interface RoleChangeContext {
  /** 操作しているユーザーの id。自分のロールは自分で変えられない。 */
  actorId: string;
  /** 変更対象のユーザー id。 */
  targetUserId: string;
  /** いま存在するロールの id 全部（実在確認用）。 */
  knownRoleIds: ReadonlySet<number>;
  /** system:ADMIN を与えるロールの id。空 = 誰も管理者になれない構成。 */
  adminRoleIds: ReadonlySet<number>;
  /** 対象**以外**で system:ADMIN を持つ有効ユーザー数。 */
  otherActiveAdminCount: number;
  /** 対象がいま system:ADMIN を持っているか。 */
  targetIsAdmin: boolean;
}

/**
 * このロール構成に変えてよいか。
 *
 * canSuspend と同じ考え方で、**画面のボタン活性と Server Action が同じ関数を
 * 見る**ようにしてある。守っているのは 3 つだけ:
 *
 *  - 自分のロールは自分で変えない（承認者を挟む意味が消えるため。DB の CHECK と
 *    createUserChangeRequest も自己申請を拒むが、管理者の直接適用はそこを通らない）
 *  - **最後の管理者から管理者ロールを外させない** — 管理者ゼロの DB は
 *    この画面からも復旧できない（ロールを変えるには user_admin が要り、
 *    user_admin はどの業務ロールにも配られていない）ので psql しか残らない
 *  - 存在しないロール id を当てない（申請から承認までにロールが消えることがある）
 */
export function canUpdateRoles(
  roleIds: readonly number[],
  ctx: RoleChangeContext,
  tr: Tr,
): RoleChangeDecision {
  if (ctx.actorId === ctx.targetUserId) {
    return {
      ok: false,
      block: "self",
      message: tr("common.cannotChangeOwnRoles"),
    };
  }
  const unknown = roleIds.filter((id) => !ctx.knownRoleIds.has(id));
  if (unknown.length > 0) {
    return {
      ok: false,
      block: "unknown-role",
      message: tr("common.nonexistentRolesIncluded", {
        ids: unknown.map((id) => `#${id}`).join(", "),
      }),
    };
  }
  const keepsAdmin = roleIds.some((id) => ctx.adminRoleIds.has(id));
  if (ctx.targetIsAdmin && !keepsAdmin && ctx.otherActiveAdminCount < 1) {
    return {
      ok: false,
      block: "last-admin",
      message: tr("common.cannotRemoveLastAdminRole"),
    };
  }
  return { ok: true, message: null };
}
