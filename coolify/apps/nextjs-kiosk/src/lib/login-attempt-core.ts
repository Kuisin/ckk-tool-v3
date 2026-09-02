/**
 * login-attempt-core.ts — 認証イベント（app.login_attempts）の語彙。
 * 純関数・isomorphic。web と kiosk の双子ファイル。
 *
 * method / reason を DB の enum にしていないのは、認証方式も失敗理由も
 * 今後まず間違いなく増えるため（WebAuthn、パスキー、新しいカード種別…）。
 * enum にすると 1 語増やすたびに migration が要る。代わりに **この
 * ファイルが値の集合の唯一の定義**で、DB 側は VarChar で受ける
 * （kiosk_device_logs.source と同じ割り切り）。
 *
 * 表示ラベルは lib/login-attempt-labels.ts（web 専用・next-intl 経由）に
 * 分けてある——ここは web/kiosk の双子ファイルで next-intl を読み込めない。
 * SY0D（ログイン履歴）とキオスク側の記録が同じ語彙（この列挙）を見ている
 * ことは型で保証する。
 */

import { parseQrPayload, QR_KINDS } from "./qr-payload";

/** 認証方式。login_attempts.method（VarChar(24)）。 */
export const LOGIN_METHODS = [
  "PASSWORD", // Web: ユーザー名 + パスワード（Auth.js credentials）
  "SSO", // Web: Authentik
  "QR_SCAN", // キオスク: カードスキャンのみ（PIN 不要の経路）
  "QR_PIN", // キオスク: スキャン + PIN 照合
  "PIN_SETUP", // キオスク: 初回 PIN 設定
  "ATTEST", // キオスク: 端末アテステーション（鍵署名）
  "DEVICE_SETTINGS", // キオスク: 端末設定コード
  "DEVICE_LINK", // キオスク: 端末リンク（登録）
  // 取引先ポータル（社外向け・/portal）。app は WEB のまま（同じアプリが配信
  // しているので嘘をつかない）で、社内の認証と区別するのは PORTAL_ 接頭辞。
  "PORTAL_OTP", // ポータル: 事前登録メールへの確認コード
  "PORTAL_BACKUP", // ポータル: バックアップコード（メールが受け取れないとき）
  "PORTAL_LINK", // ポータル: 書類リンク（LINK_ONLY の解決）
] as const;

export type LoginMethod = (typeof LOGIN_METHODS)[number];

/**
 * 失敗理由。login_attempts.reason（VarChar(40)）。
 * **成功行では null**。
 */
export const LOGIN_FAILURE_REASONS = [
  // ── Web ────────────────────────────────────────────────────────────────
  "EMPTY_INPUT",
  "RATE_LIMITED",
  "UNKNOWN_USER",
  "USER_INACTIVE",
  "NO_PASSWORD_SET",
  "BAD_PASSWORD",
  "SSO_NO_USERNAME",
  "SSO_USER_INACTIVE",
  "SSO_UPSERT_FAILED",
  "SSO_CALLBACK_ERROR",
  // ── キオスク: 端末 ─────────────────────────────────────────────────────
  "DEVICE_NO_COOKIE",
  "DEVICE_NOT_FOUND",
  "DEVICE_EXPIRED",
  "DEVICE_DISABLED",
  "DEVICE_REVOKED",
  "DEVICE_PENDING",
  "ATTEST_REQUIRED",
  // ── キオスク: カード / PIN ─────────────────────────────────────────────
  "BAD_REQUEST",
  "CARD_INVALID",
  "CARD_SUSPENDED",
  "CARD_EXPIRED",
  "LOCKED",
  "TICKET_EXPIRED",
  "PIN_FORMAT",
  "PIN_MISMATCH",
  "PIN_ALREADY_SET",
  // 初回設定の PIN が弱い（桁数不足・同じ数字の連続・123456 のような並び）
  "PIN_WEAK",
  // ── キオスク: アテステーション / 端末設定 ───────────────────────────────
  "ATTEST_NOT_CONFIGURED",
  "ATTEST_BAD_SIGNATURE",
  "ATTEST_KEY_MISMATCH",
  "ATTEST_KEY_IN_USE",
  "ATTEST_BAD_PROFILE",
  "SETTINGS_NO_DEVICE",
  "SETTINGS_LOCKED",
  "SETTINGS_CODE_INVALID",
  // ── キオスク: 端末トークンの再発行（Cookie 消失時の復帰）────────────────
  // deviceId だけでは再発行しない — 端末鍵の署名か端末設定コードが要る。
  "REACTIVATE_PROOF_REQUIRED",
  "REACTIVATE_BAD_SIGNATURE",
  "REACTIVATE_CODE_INVALID",
  "REACTIVATE_LOCKED",
  // 生きているトークンを持つディスプレイは再発行しない（再リンクへ）
  "REACTIVATE_TOKEN_LIVE",
  // 退出 PIN の配布はアテステーション済みの端末（専用アプリ）にだけ渡す
  "UNLOCK_PIN_NOT_ATTESTED",
  // ── 取引先ポータル（社外向け）─────────────────────────────────────────
  // **画面はこれらを区別しない**（存在するアドレスとしないアドレスが
  // 見分けられてしまう）。区別するのはこの記録の中だけ。
  "PORTAL_UNKNOWN_EMAIL",
  "PORTAL_ACCOUNT_INACTIVE",
  "PORTAL_CODE_EXPIRED",
  "PORTAL_CODE_MISMATCH",
  "PORTAL_CODE_ATTEMPTS",
  "PORTAL_BACKUP_INVALID",
  "PORTAL_LINK_NOT_FOUND",
  "PORTAL_LINK_EXPIRED",
  "PORTAL_LINK_REVOKED",
  "PORTAL_LINK_EXHAUSTED",
  // メールが出せなかった。利用者には成功と同じ画面を出すので、運用が
  // 気づける唯一の場所がここ（Grafana のアラートもこの行を見る）。
  "PORTAL_MAIL_FAILED",
  // dev で許可リスト（PORTAL_MAIL_ALLOWLIST）に無い宛先を止めた。
  "PORTAL_MAIL_BLOCKED_DEV",
  // 想定外（新しい state を足して対応表を更新し忘れたとき）
  "UNKNOWN",
] as const;

export type LoginFailureReason = (typeof LOGIN_FAILURE_REASONS)[number];

/**
 * 読み取ったペイロードの種別。**中身は保存しない**（カード QR の値は
 * secret そのもの）。「ログイン画面に指示書ストリップをかざした」のような
 * 誤操作を、値を残さずに判別できるようにするためだけの列。
 */
export const SCAN_KINDS = [
  "CARD",
  "WO",
  "OTHER",
  "MALFORMED",
  "EMPTY",
] as const;

export type ScanKind = (typeof SCAN_KINDS)[number];

/** スキャン値の種別だけを判定する（値は返さない）。 */
export function scanKindOf(payload: unknown): ScanKind {
  const trimmed = typeof payload === "string" ? payload.trim() : "";
  if (!trimmed) return "EMPTY";
  const unified = parseQrPayload(trimmed);
  if (unified) {
    if (unified.kind === QR_KINDS.CARD) return "CARD";
    if (unified.kind === QR_KINDS.WO) return "WO";
    return "OTHER";
  }
  // 統一形式ではない = 配布済みの素の 16 桁カード、旧 URL 形式、あるいはゴミ。
  // 16 桁に正規化できるかは呼び出し側（extractCardId）が判定するので、
  // ここでは「カードの体裁をしているか」までに留める。
  if (/^[0-9A-Za-z-]{12,24}$/.test(trimmed)) return "CARD";
  return "MALFORMED";
}

/**
 * キオスクのレスポンス state（画面が分岐に使う値）→ 失敗理由。
 * **state を足したらここも足す**。対応が無いものは "UNKNOWN" に落ちるので
 * 記録自体は失われない。
 */
const KIOSK_STATE_REASONS: Record<string, LoginFailureReason> = {
  BAD_REQUEST: "BAD_REQUEST",
  CARD_INVALID: "CARD_INVALID",
  CARD_SUSPENDED: "CARD_SUSPENDED",
  CARD_EXPIRED: "CARD_EXPIRED",
  LOCKED: "LOCKED",
  TICKET_EXPIRED: "TICKET_EXPIRED",
  PIN_FORMAT: "PIN_FORMAT",
  PIN_MISMATCH: "PIN_MISMATCH",
  PIN_ALREADY_SET: "PIN_ALREADY_SET",
  PIN_WEAK: "PIN_WEAK",
  NOT_CONFIGURED: "ATTEST_NOT_CONFIGURED",
  BAD_SIGNATURE: "ATTEST_BAD_SIGNATURE",
  KEY_MISMATCH: "ATTEST_KEY_MISMATCH",
  KEY_IN_USE: "ATTEST_KEY_IN_USE",
  BAD_PROFILE: "ATTEST_BAD_PROFILE",
  NO_DEVICE: "SETTINGS_NO_DEVICE",
  INVALID: "SETTINGS_CODE_INVALID",
  PROOF_REQUIRED: "REACTIVATE_PROOF_REQUIRED",
  REACTIVATE_BAD_SIGNATURE: "REACTIVATE_BAD_SIGNATURE",
  REACTIVATE_CODE_INVALID: "REACTIVATE_CODE_INVALID",
  REACTIVATE_LOCKED: "REACTIVATE_LOCKED",
  TOKEN_LIVE: "REACTIVATE_TOKEN_LIVE",
  NOT_ATTESTED: "UNLOCK_PIN_NOT_ATTESTED",
};

/**
 * 端末が無効なときの理由。getDevice() の reason（NO_COOKIE / NOT_FOUND /
 * EXPIRED / DISABLED / REVOKED / PENDING / ATTEST_REQUIRED）を受ける。
 */
export function deviceFailureReason(
  deviceReason: string | null | undefined,
): LoginFailureReason {
  if (deviceReason === "ATTEST_REQUIRED") return "ATTEST_REQUIRED";
  const mapped = `DEVICE_${deviceReason ?? ""}`;
  return (LOGIN_FAILURE_REASONS as readonly string[]).includes(mapped)
    ? (mapped as LoginFailureReason)
    : "UNKNOWN";
}

/** キオスクの state から失敗理由を引く。 */
export function kioskFailureReason(state: string): LoginFailureReason {
  return KIOSK_STATE_REASONS[state] ?? "UNKNOWN";
}
