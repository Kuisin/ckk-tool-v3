/**
 * display-core.ts — 管理ディスプレイの純ロジック（定数・期限計算・コード解釈）。
 * DB / Cookie に触れない純関数のみ — vitest で単体テスト（display-core.test.ts）。
 *
 * キオスクの kiosk-auth-core.ts と同じ役どころだが、ディスプレイは
 * 「人が居ない機器」なのでセッション・PIN・アイドルの概念を持たない。
 */

import { normalizeCode } from "./crockford";

/**
 * ディスプレイトークンは **365 日**。キオスク端末の 30 日と違えているのは、
 * 壁のディスプレイは誰も触らないから — 短いと、誰も見ていない間に自分で
 * ペアリング画面へ戻ってしまい、現場は「テレビが壊れた」としか分からない。
 * 失効は管理画面から即座にできる（期限は保険であって主たる制御ではない）。
 */
export const DISPLAY_TOKEN_TTL_MS = 365 * 24 * 60 * 60 * 1000;

/**
 * リンクコードの桁数と寿命。**キオスク端末とまったく同じ値**（12桁・10分）。
 * 揃えているのは、SY09 の 1 つのスキャナが両方を読むから — 桁数が違うと
 * 「どちらのコードか」を人が意識することになる。
 */
export const LINK_CODE_LENGTH = 12;
export const LINK_REQUEST_TTL_MS = 10 * 60 * 1000;

/**
 * オンライン判定の窓。キオスクの ONLINE_WINDOW_MS と同値だが、**同じ定数を
 * import せず別に置く** — あちらは「人がタブレットを触っていた形跡」の窓で、
 * こちらは「Pi が生きている」の窓。意味が違うものを 1 つの定数にすると、
 * 片方の都合で動かしたときにもう片方が黙って壊れる。
 */
export const DISPLAY_ONLINE_WINDOW_MS = 5 * 60 * 1000;

/**
 * 表示倍率（%）— 画面の大きさと見る距離に合わせる微調整。
 *
 * 同じ表示内容でも、43 型を近くで見るのと 65 型を 10m 先から見るのとでは
 * 読みやすい大きさが違う。行数（テンプレートの設定）が「どれだけ載せるか」
 * なのに対して、こちらは「どれだけ大きく出すか」。
 *
 * 5 刻みにしているのは、1% ずつ動かしても目で違いが分からないから —
 * 選択肢が細かいほど、現場は「正解の値」を探して迷う。
 */
export const DISPLAY_SCALE_MIN = 50;
export const DISPLAY_SCALE_MAX = 200;
export const DISPLAY_SCALE_DEFAULT = 100;
export const DISPLAY_SCALE_STEP = 5;

/** 倍率を許される範囲・刻みに丸める。DB の CHECK と同じ範囲。 */
export function normalizeScalePercent(value: unknown): number {
  // Number(null) は 0 になる。素直に Number() へ渡すと「未設定」が最小倍率に
  // 化けて、理由の見えない半分サイズの画面ができる。数値と数字の文字列だけ
  // 受けて、それ以外は既定に倒す。
  const n =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim() !== ""
        ? Number(value)
        : Number.NaN;
  if (!Number.isFinite(n)) return DISPLAY_SCALE_DEFAULT;
  const stepped = Math.round(n / DISPLAY_SCALE_STEP) * DISPLAY_SCALE_STEP;
  return Math.min(DISPLAY_SCALE_MAX, Math.max(DISPLAY_SCALE_MIN, stepped));
}

/**
 * 実際に置ける行数。
 *
 * 倍率を上げると 1 行が大きくなり、設定した件数が画面に入らなくなる。
 * そのとき**黙って切り落とすと、下の行は存在しないのと同じ**になる
 * （壁の画面ではスクロールできないので誰も気づけない）。だから入る数まで
 * 減らし、あふれたぶんはページ送りへ回す。
 *
 * 測れないうち（初回描画・高さ 0）は設定値をそのまま使う — 推測で減らすと
 * 一瞬だけ行が消えてちらつく。
 */
export function fitRowsToHeight(
  availablePx: number,
  rowPx: number,
  gapPx: number,
  configuredRows: number,
): number {
  if (!Number.isFinite(availablePx) || availablePx <= 0) return configuredRows;
  if (!Number.isFinite(rowPx) || rowPx <= 0) return configuredRows;
  const per = rowPx + Math.max(0, gapPx);
  // 最後の行の下には隙間が要らないぶんを足して数える
  const fits = Math.floor((availablePx + Math.max(0, gapPx)) / per);
  return Math.max(1, Math.min(configuredRows, fits));
}

/** WS の生存確認とハートビートの間隔。 */
export const DISPLAY_SWEEP_INTERVAL_MS = 30 * 1000;

/** ディスプレイ側から打つハートビートの最短間隔（WS が張れないときの保険）。 */
export const DISPLAY_HEARTBEAT_MIN_INTERVAL_MS = 60 * 1000;

/**
 * どの機械の何枚目か（自己申告の手掛かり）。
 *
 * Pi が URL に載せてくる値なので**詐称できる**。表示とまとめ表示にしか
 * 使わない — 認証にも権限にも使わない（端末シグネチャと同じ扱い）。
 * だから検証は「変な値で列を汚さない」ためだけのもので、弾く必要は無い。
 */
export const MACHINE_ID_MAX_LENGTH = 64;
export const SCREEN_INDEX_MAX = 8;

export type MachineHint = {
  machineId: string | null;
  screenIndex: number | null;
};

/** hostname らしき文字列に丸める（英数字・ハイフン・アンダースコアだけ）。 */
export function normalizeMachineId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value.trim().replace(/[^A-Za-z0-9._-]/g, "");
  if (!cleaned) return null;
  return cleaned.slice(0, MACHINE_ID_MAX_LENGTH);
}

/** 画面番号は 1 から。範囲外・数値でないものは「不明」に倒す。 */
export function normalizeScreenIndex(value: unknown): number | null {
  const n =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim() !== ""
        ? Number(value)
        : Number.NaN;
  if (!Number.isInteger(n)) return null;
  if (n < 1 || n > SCREEN_INDEX_MAX) return null;
  return n;
}

/** URL のクエリなど、未検証の入力から手掛かりを組み立てる。 */
export function machineHint(
  machineId: unknown,
  screenIndex: unknown,
): MachineHint {
  return {
    machineId: normalizeMachineId(machineId),
    screenIndex: normalizeScreenIndex(screenIndex),
  };
}

/** デバイストークンの有効判定。 */
export function isDisplayTokenAlive(
  now: Date,
  expiresAt: Date | null,
): boolean {
  return expiresAt !== null && now.getTime() < expiresAt.getTime();
}

/** リンクコードの有効判定。 */
export function isLinkRequestAlive(now: Date, expiresAt: Date | null): boolean {
  return expiresAt !== null && now.getTime() < expiresAt.getTime();
}

/** 死活判定 — last_seen_at が窓の内側か。null は「一度も見ていない」。 */
export function isDisplayOnline(now: Date, lastSeenAt: Date | null): boolean {
  if (!lastSeenAt) return false;
  return now.getTime() - lastSeenAt.getTime() < DISPLAY_ONLINE_WINDOW_MS;
}

/** リンクコードの期限までの残り ms（負値なし）。画面のカウントダウン用。 */
export function linkRemainingMs(now: Date, expiresAt: Date): number {
  return Math.max(0, expiresAt.getTime() - now.getTime());
}

/**
 * 管理側（SY09）が読み取った値からリンクコードを取り出す。
 *
 * **キオスク端末とディスプレイで QR の中身を同じにしてある**（裸の 12 桁）。
 * 揃えたのは、SY09 のスキャナを 1 つに保つため — 端末とディスプレイで
 * 別のスキャナ / 別の読み方があると、現場は「どっちで読むのか」を毎回
 * 考えることになる。`CKK:` 統一形式（qr-payload.ts）を使わないのも
 * キオスクと同じ理由で、あれは紙に刷る書類の規約。
 *
 * 受け付ける形:
 *   1. 裸のコード（`ABCD-EFGH-JKLM` / `ABCDEFGHJKLM`）— QR と手入力の両方
 *   2. `?code=` を持つ URL — 将来スマホのカメラから直接開く経路を足したく
 *      なったときのために受けておく（今どの画面も出していない）
 *
 * 一致しなければ空文字 — 呼び出し側は「読み取れません」を出す。
 */
export function extractLinkCode(raw: string): string {
  const trimmed = String(raw ?? "").trim();
  if (!trimmed) return "";

  let candidate = trimmed;
  try {
    const url = new URL(trimmed);
    candidate = url.searchParams.get("code") ?? "";
  } catch {
    // URL でなければ裸のコードとして扱う
  }

  const normalized = normalizeCode(candidate);
  return normalized.length === LINK_CODE_LENGTH ? normalized : "";
}
