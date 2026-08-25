/**
 * user-suspension-core.ts — ユーザーの利用停止（一時 / 恒久）の判定。
 *
 * 純ロジックだけ（DB も session も触らない）。画面のボタン活性と Server Action の
 * 実行可否が**同じ関数**を見るようにして、片方だけ直して食い違うのを防ぐ。
 *
 * 停止の実体は `users.is_active = false`。`disabled_until` は「いつ戻すか」だけを
 * 持ち、期限が来たら pg_cron（sql/user-suspension-cron.sql）がフラグを戻す。
 */

export type SuspensionKind = "temporary" | "permanent";

export interface SuspensionTarget {
  id: string;
  username: string;
  isActive: boolean;
  /** 一時停止の解除予定（無効かつ null = 恒久停止）。 */
  disabledUntil: Date | null;
}

export interface SuspensionContext {
  /** 操作しているユーザーの id。自分自身は止められない。 */
  actorId: string;
  /**
   * 対象**以外**で system:ADMIN を持つ有効ユーザー数。
   * 対象が管理者のとき、0 なら止めると管理者が居なくなる。
   */
  otherActiveAdminCount: number;
  /** 対象が system:ADMIN を持っているか。 */
  targetIsAdmin: boolean;
}

export type SuspensionBlock =
  | "self"
  | "last-admin"
  | "already-disabled"
  | "already-active";

export interface SuspensionDecision {
  ok: boolean;
  /** ok=false のときだけ入る。 */
  block?: SuspensionBlock;
  /** 利用者に見せる理由（ok=true なら null）。 */
  message: string | null;
}

const MESSAGES: Record<SuspensionBlock, string> = {
  self: "自分自身は停止できません。別の管理者に依頼してください。",
  "last-admin":
    "最後の管理者は停止できません。先に他のユーザーへ管理者権限を割り当ててください。",
  "already-disabled": "このユーザーは既に停止中です。",
  "already-active": "このユーザーは停止されていません。",
};

function block(reason: SuspensionBlock): SuspensionDecision {
  return { ok: false, block: reason, message: MESSAGES[reason] };
}

/** 停止してよいか。 */
export function canSuspend(
  target: SuspensionTarget,
  ctx: SuspensionContext,
): SuspensionDecision {
  if (!target.isActive) return block("already-disabled");
  // 自分を止めると自分で戻せない（他に管理者が居ても、まず自分が締め出される）。
  if (target.id === ctx.actorId) return block("self");
  // 管理者ゼロの DB はロール付与画面が無く psql でしか戻せない。
  if (ctx.targetIsAdmin && ctx.otherActiveAdminCount < 1) {
    return block("last-admin");
  }
  return { ok: true, message: null };
}

/** 復帰させてよいか。 */
export function canRestore(target: SuspensionTarget): SuspensionDecision {
  if (target.isActive) return block("already-active");
  return { ok: true, message: null };
}

/**
 * 一時停止の期限を検証して返す。
 * `null` を返すのは恒久停止のとき（呼び出し側で kind を見て分岐しない）。
 */
export function resolveDisabledUntil(
  kind: SuspensionKind,
  until: Date | null,
  now: Date,
): { ok: true; value: Date | null } | { ok: false; message: string } {
  if (kind === "permanent") return { ok: true, value: null };
  if (!until) {
    return { ok: false, message: "一時停止には解除予定日時が必要です" };
  }
  if (Number.isNaN(until.getTime())) {
    return { ok: false, message: "解除予定日時が不正です" };
  }
  if (until.getTime() <= now.getTime()) {
    // 過去日時を許すと「止めた次の分に戻る」= 事故にしか見えない挙動になる。
    return { ok: false, message: "解除予定日時は未来を指定してください" };
  }
  return { ok: true, value: until };
}

export interface SuspensionState {
  kind: SuspensionKind | null;
  /** 画面に出す一文（有効なユーザーなら null）。 */
  label: string | null;
  /** 期限切れ済みで、まだ pg_cron が戻していない状態か。 */
  isAwaitingRestore: boolean;
}

/**
 * 現在の停止状態を画面用に言語化する。
 *
 * 期限を過ぎても最大 1 分は無効のままなので（復帰係が毎分なので）、
 * その間は「まもなく復帰します」と出して、故障に見えないようにする。
 */
export function suspensionState(
  target: SuspensionTarget,
  now: Date,
): SuspensionState {
  if (target.isActive) {
    return { kind: null, label: null, isAwaitingRestore: false };
  }
  if (!target.disabledUntil) {
    return {
      kind: "permanent",
      label: "停止中（無期限）",
      isAwaitingRestore: false,
    };
  }
  if (target.disabledUntil.getTime() <= now.getTime()) {
    return {
      kind: "temporary",
      label: "停止中（期限切れ — まもなく自動復帰します）",
      isAwaitingRestore: true,
    };
  }
  return { kind: "temporary", label: "停止中（一時）", isAwaitingRestore: false };
}
