/**
 * privileged-access-core.ts — 時限昇格（方式 A）の有効性判定と申請内容の検証。
 *
 * ■ 時計は「承認」ではなく「初回使用」から動く
 * 承認された時点では付与は**装填されただけ**で、まだ減っていない。誰かが実際に
 * その操作をした瞬間（activatedAt）に動きはじめ、
 *     min(activatedAt + durationMinutes, windowEndsAt)
 * で切れる。窓を先に取っておいても、使わなければ持ち時間は減らない一方、
 * 窓の終わりは絶対の上限なので「30 分ぶん承認したのに窓が 5 分しか残っていない」
 * ときは 5 分で終わる。**短いほうが勝つ**。
 *
 * ■ 期限は毎回その場で判定する（cron に消させない）
 * user-suspension-cron.sql は期限切れの利用停止を pg_cron で戻していて、最大 1 分の
 * 遅れを許容している——遅れても「アクセスが減る側」に倒れるから成立する設計。
 * ここで同じことをすると遅れが「アクセスが増える側」に倒れるので、判定は常に
 * この関数（と SQL の同じ条件式）で行う。DB の status='EXPIRED' は表示用の打刻で
 * あって、判定の入力ではない。
 *
 * ■ 端は両端とも含む
 * isMemberEffective（approval-membership.ts）と揃えてある。片方だけ排他にすると
 * 「画面には有効と出るのに押すと弾かれる」が生まれる。
 *
 * 純ロジック（I/O なし）— サーバーの門番も画面のカウントダウンも同じ関数を使う。
 */

/** 申請の状態。DB の app."PRIVILEGED_REQUEST_STATUS" と同じ集合。 */
export type PrivilegedRequestStatus =
  | "PENDING"
  | "APPROVED"
  | "REJECTED"
  | "CANCELLED"
  | "REVOKED"
  | "EXPIRED";

/** 窓は申請時点から最長 2 週間（DB の CHECK privileged_access_window_max_14d と対）。 */
export const MAX_WINDOW_DAYS = 14;
/** 1 回あたりの有効時間の上限（分）= 24 時間。 */
export const MAX_DURATION_MINUTES = 1440;
export const MIN_DURATION_MINUTES = 1;

const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;

/** 判定に必要な最小限の形（Prisma の行でもフォームの値でも渡せる）。 */
export interface GrantWindow {
  status: PrivilegedRequestStatus;
  windowStartsAt: Date | string;
  windowEndsAt: Date | string;
  durationMinutes: number;
  /** 初回使用時刻。null = 未使用 = 時計がまだ動いていない。 */
  activatedAt: Date | string | null;
}

function toTime(v: Date | string | null | undefined): number | null {
  if (v == null) return null;
  const t = v instanceof Date ? v.getTime() : new Date(v).getTime();
  return Number.isNaN(t) ? null : t;
}

/**
 * 実効終了時刻。
 *   未使用   → 窓の終わり（まだ 1 分も減っていない）
 *   使用済み → min(初回使用 + duration, 窓の終わり)
 * 時刻が壊れている行は「即座に終わっている」とみなす（fail-closed）。
 */
export function effectiveEndsAt(g: GrantWindow): Date {
  const windowEnd = toTime(g.windowEndsAt);
  if (windowEnd == null) return new Date(0);
  const activated = toTime(g.activatedAt);
  if (activated == null) return new Date(windowEnd);
  const durationEnd = activated + g.durationMinutes * MINUTE_MS;
  return new Date(Math.min(durationEnd, windowEnd));
}

/**
 * 今この瞬間、この付与で操作してよいか。
 *
 * 承認済みであること・窓の中にいること・（使用済みなら）duration が尽きていない
 * ことの 3 つすべて。status が EXPIRED でも判定は時刻で行うので、打刻の遅れで
 * 使えてしまうことはない（逆に、打刻が先行しても時刻が生きていれば使える）。
 */
export function isGrantUsable(g: GrantWindow, now: Date): boolean {
  if (g.status !== "APPROVED") return false;
  const t = now.getTime();
  const start = toTime(g.windowStartsAt);
  if (start == null || start > t) return false;
  return t <= effectiveEndsAt(g).getTime();
}

/** 残り時間（ミリ秒）。使えないときは 0 — 画面のカウントダウン用。 */
export function remainingMs(g: GrantWindow, now: Date): number {
  if (!isGrantUsable(g, now)) return 0;
  return Math.max(0, effectiveEndsAt(g).getTime() - now.getTime());
}

/**
 * 画面に出す状態。status（決裁の結果）と時刻（実際に使えるか）の両方から決める。
 *   SCHEDULED … 承認済みだが窓がまだ始まっていない
 *   ARMED     … 使える。ただしまだ一度も使っていない（時計が動いていない）
 *   ACTIVE    … 使える。時計が動いている
 *   EXPIRED   … 承認されたが期限が過ぎた（使わずに終わった場合も含む）
 */
export type GrantState =
  | "PENDING"
  | "SCHEDULED"
  | "ARMED"
  | "ACTIVE"
  | "EXPIRED"
  | "REJECTED"
  | "REVOKED"
  | "CANCELLED";

export function grantState(g: GrantWindow, now: Date): GrantState {
  if (g.status === "PENDING") return "PENDING";
  if (g.status === "REJECTED") return "REJECTED";
  if (g.status === "REVOKED") return "REVOKED";
  if (g.status === "CANCELLED") return "CANCELLED";
  // EXPIRED は表示用の打刻なので、時刻で見て生きていれば生きていると言う。
  const t = now.getTime();
  const start = toTime(g.windowStartsAt);
  if (start != null && start > t) return "SCHEDULED";
  if (!isGrantUsable({ ...g, status: "APPROVED" }, now)) return "EXPIRED";
  return toTime(g.activatedAt) == null ? "ARMED" : "ACTIVE";
}

/** バッジの文言（_specs/design.md §9 の色の付け方に合わせる）。 */
export const GRANT_STATE_LABEL: Record<GrantState, string> = {
  PENDING: "承認待ち",
  SCHEDULED: "開始前",
  ARMED: "利用可能",
  ACTIVE: "利用中",
  EXPIRED: "期限切れ",
  REJECTED: "差し戻し",
  REVOKED: "取り消し",
  CANCELLED: "取り下げ",
};

export const GRANT_STATE_COLOR: Record<GrantState, string> = {
  PENDING: "yellow",
  SCHEDULED: "blue",
  ARMED: "green",
  ACTIVE: "violet",
  EXPIRED: "gray",
  REJECTED: "red",
  REVOKED: "red",
  CANCELLED: "gray",
};

export interface RequestWindowInput {
  windowStartsAt: Date | string;
  windowEndsAt: Date | string;
  durationMinutes: number;
}

/**
 * 申請内容の検証。DB の CHECK 制約（privileged_access_window_*）の双子で、
 * 同じ条件を人間に読める日本語で返す。**片方だけ直さないこと** — 画面が通して
 * DB が落とすと、利用者には理由の分からない失敗になる。
 *
 * 返り値: エラーメッセージ。問題なければ null。
 */
export function validateRequestWindow(
  input: RequestWindowInput,
  now: Date,
): string | null {
  const start = toTime(input.windowStartsAt);
  const end = toTime(input.windowEndsAt);
  if (start == null) return "開始日時を指定してください";
  if (end == null) return "終了日時を指定してください";
  if (end <= start) return "終了日時は開始日時より後にしてください";

  // 遡っての付与を作らせない。1 分の緩みは時計ずれと送信の往復ぶん（DB 側と同じ）。
  if (start < now.getTime() - MINUTE_MS) {
    return "開始日時を過去にすることはできません";
  }
  // 上限は「申請時点から」14 日。開始を先送りしても総延長は伸びない。
  if (end > now.getTime() + MAX_WINDOW_DAYS * DAY_MS) {
    return `終了日時は申請から ${MAX_WINDOW_DAYS} 日以内にしてください`;
  }

  if (!Number.isInteger(input.durationMinutes)) {
    return "有効時間は分単位の整数で指定してください";
  }
  if (
    input.durationMinutes < MIN_DURATION_MINUTES ||
    input.durationMinutes > MAX_DURATION_MINUTES
  ) {
    return `有効時間は ${MIN_DURATION_MINUTES}〜${MAX_DURATION_MINUTES} 分の範囲で指定してください`;
  }
  return null;
}
