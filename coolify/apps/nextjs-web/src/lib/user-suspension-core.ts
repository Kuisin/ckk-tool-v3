import type { getTranslations } from "next-intl/server";

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

type Tr = Awaited<ReturnType<typeof getTranslations>>;

function messageFor(reason: SuspensionBlock, tr: Tr): string {
  switch (reason) {
    case "self":
      return tr("settings.userSuspensionCore.youCannotSuspendYourself");
    case "last-admin":
      return tr("settings.userSuspensionCore.theLastAdminCannotBe");
    case "already-disabled":
      return tr("settings.userSuspensionCore.thisUserIsAlready");
    case "already-active":
      return tr("settings.userSuspensionCore.thisUserIsNot");
  }
}

function block(reason: SuspensionBlock, tr: Tr): SuspensionDecision {
  return { ok: false, block: reason, message: messageFor(reason, tr) };
}

/** 停止してよいか。 */
export function canSuspend(
  target: SuspensionTarget,
  ctx: SuspensionContext,
  tr: Tr,
): SuspensionDecision {
  if (!target.isActive) return block("already-disabled", tr);
  // 自分を止めると自分で戻せない（他に管理者が居ても、まず自分が締め出される）。
  if (target.id === ctx.actorId) return block("self", tr);
  // 管理者ゼロの DB はロール付与画面が無く psql でしか戻せない。
  if (ctx.targetIsAdmin && ctx.otherActiveAdminCount < 1) {
    return block("last-admin", tr);
  }
  return { ok: true, message: null };
}

/** 復帰させてよいか。 */
export function canRestore(
  target: SuspensionTarget,
  tr: Tr,
): SuspensionDecision {
  if (target.isActive) return block("already-active", tr);
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
  tr: Tr,
): { ok: true; value: Date | null } | { ok: false; message: string } {
  if (kind === "permanent") return { ok: true, value: null };
  if (!until) {
    return {
      ok: false,
      message: tr("settings.userSuspensionCore.aScheduledReleaseDate"),
    };
  }
  if (Number.isNaN(until.getTime())) {
    return {
      ok: false,
      message: tr("settings.userSuspensionCore.theScheduledReleaseDate"),
    };
  }
  if (until.getTime() <= now.getTime()) {
    // 過去日時を許すと「止めた次の分に戻る」= 事故にしか見えない挙動になる。
    return {
      ok: false,
      message: tr("settings.userSuspensionCore.pleaseSpecifyAFuture"),
    };
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
  tr: Tr,
): SuspensionState {
  if (target.isActive) {
    return { kind: null, label: null, isAwaitingRestore: false };
  }
  if (!target.disabledUntil) {
    return {
      kind: "permanent",
      label: tr("settings.userSuspensionCore.suspendedIndefinite"),
      isAwaitingRestore: false,
    };
  }
  if (target.disabledUntil.getTime() <= now.getTime()) {
    return {
      kind: "temporary",
      label: tr("settings.userSuspensionCore.suspendedExpiredWillRestore"),
      isAwaitingRestore: true,
    };
  }
  return {
    kind: "temporary",
    label: tr("settings.userSuspensionCore.suspendedTemporary"),
    isAwaitingRestore: false,
  };
}
