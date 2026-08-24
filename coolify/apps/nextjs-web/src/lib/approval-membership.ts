/**
 * approval-membership.ts — 承認グループのメンバーが「今この瞬間、実効か」の判定。
 *
 * メンバーには 2 種類ある:
 *   常任       — valid_from / valid_until とも null
 *   期間限定   — 両方に日時が入る（片側だけは DB の CHECK 制約で禁止）
 *
 * 期間限定メンバーは「その期間だけグループの一員」。代理（approval_delegates）
 * とは別物で、代理は「本来の承認者の代わりに押す」——承認記録に原承認者が
 * 残る。混同しやすいので画面・マニュアルでも書き分けること。
 *
 * 純ロジック（I/O なし）。サーバーの権限判定・通知の宛先・画面のバッジが
 * **同じ関数**を使うことで、「画面では有効なのに押せない」を構造的に防ぐ。
 */

/** 判定に必要な最小限の形（Prisma の行でもフォームの値でも渡せる）。 */
export interface MemberValidity {
  isActive: boolean;
  validFrom: Date | string | null;
  validUntil: Date | string | null;
}

/** メンバーの期間状態 — 詳細画面のバッジに使う。 */
export type MemberPeriodState =
  | "PERMANENT" // 常任
  | "ACTIVE" // 期間限定・期間内
  | "SCHEDULED" // 期間限定・開始前
  | "EXPIRED" // 期間限定・終了後
  | "DISABLED"; // 無効化されている（期間に関係なく承認できない）

function toTime(v: Date | string | null): number | null {
  if (v == null) return null;
  const t = v instanceof Date ? v.getTime() : new Date(v).getTime();
  return Number.isNaN(t) ? null : t;
}

/**
 * 今この瞬間、承認できるメンバーか。
 * 端は両端とも含む（開始日時ちょうど・終了日時ちょうどは有効）。
 */
export function isMemberEffective(m: MemberValidity, now: Date): boolean {
  if (!m.isActive) return false;
  const t = now.getTime();
  const from = toTime(m.validFrom);
  const until = toTime(m.validUntil);
  if (from != null && from > t) return false;
  if (until != null && until < t) return false;
  return true;
}

/** バッジ表示用の状態。isActive=false は期間より優先する。 */
export function memberPeriodState(
  m: MemberValidity,
  now: Date,
): MemberPeriodState {
  if (!m.isActive) return "DISABLED";
  const from = toTime(m.validFrom);
  const until = toTime(m.validUntil);
  if (from == null && until == null) return "PERMANENT";
  const t = now.getTime();
  if (from != null && from > t) return "SCHEDULED";
  if (until != null && until < t) return "EXPIRED";
  return "ACTIVE";
}

export const MEMBER_PERIOD_STATE_LABEL: Record<MemberPeriodState, string> = {
  PERMANENT: "常任",
  ACTIVE: "有効中",
  SCHEDULED: "期間前",
  EXPIRED: "期間終了",
  DISABLED: "無効",
};

export const MEMBER_PERIOD_STATE_COLOR: Record<MemberPeriodState, string> = {
  PERMANENT: "blue",
  ACTIVE: "green",
  SCHEDULED: "yellow",
  EXPIRED: "gray",
  DISABLED: "gray",
};

/**
 * Prisma の where 断片 — isMemberEffective と同じ条件を DB 側で表す。
 * 片方だけ直して食い違うのを避けるため、必ず両方をこのファイルに置く。
 */
export function effectiveMemberWhere(now: Date) {
  return {
    isActive: true,
    AND: [
      { OR: [{ validFrom: null }, { validFrom: { lte: now } }] },
      { OR: [{ validUntil: null }, { validUntil: { gte: now } }] },
    ],
  };
}

/**
 * 期間入力の検証（画面と Server Action が共用）。
 * 常任 = 両方 null。期間限定 = 両方必須かつ 終了 > 開始。
 */
export function validateMemberPeriod(input: {
  validFrom: Date | string | null;
  validUntil: Date | string | null;
}): string | null {
  const from = toTime(input.validFrom);
  const until = toTime(input.validUntil);
  const hasFrom = input.validFrom != null && input.validFrom !== "";
  const hasUntil = input.validUntil != null && input.validUntil !== "";
  if (!hasFrom && !hasUntil) return null; // 常任
  if (!hasFrom || !hasUntil) {
    return "期間限定メンバーは開始日時と終了日時の両方を入力してください";
  }
  if (from == null || until == null) return "日時の形式が正しくありません";
  if (until <= from) return "終了日時は開始日時より後にしてください";
  return null;
}
