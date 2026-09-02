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
 * 表示ラベルもここに置く。SY0D（ログイン履歴）とキオスク側の記録が
 * 同じ語彙を見ていることを型で保証するため。
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

const METHOD_LABELS: Record<LoginMethod, string> = {
  PASSWORD: "パスワード",
  SSO: "シングルサインオン",
  QR_SCAN: "QRカード（スキャンのみ）",
  QR_PIN: "QRカード + PIN",
  PIN_SETUP: "PIN 初回設定",
  ATTEST: "端末アテステーション",
  DEVICE_SETTINGS: "端末設定コード",
  DEVICE_LINK: "端末リンク",
  PORTAL_OTP: "取引先ポータル（確認コード）",
  PORTAL_BACKUP: "取引先ポータル（バックアップコード）",
  PORTAL_LINK: "取引先ポータル（書類リンク）",
};

const REASON_LABELS: Record<LoginFailureReason, string> = {
  EMPTY_INPUT: "入力が空",
  RATE_LIMITED: "レート制限",
  UNKNOWN_USER: "ユーザーが存在しない",
  USER_INACTIVE: "ユーザーが無効",
  NO_PASSWORD_SET: "パスワード未設定",
  BAD_PASSWORD: "パスワード不一致",
  SSO_NO_USERNAME: "SSO: ユーザー名クレームなし",
  SSO_USER_INACTIVE: "SSO: ユーザーが無効",
  SSO_UPSERT_FAILED: "SSO: ユーザー登録に失敗",
  SSO_CALLBACK_ERROR: "SSO: コールバック失敗",
  DEVICE_NO_COOKIE: "端末Cookieなし",
  DEVICE_NOT_FOUND: "未登録の端末",
  DEVICE_EXPIRED: "端末トークン期限切れ",
  DEVICE_DISABLED: "端末が無効",
  DEVICE_REVOKED: "端末が取り消し済み",
  DEVICE_PENDING: "端末が未有効化",
  ATTEST_REQUIRED: "アテステーション未通過",
  BAD_REQUEST: "リクエスト不正",
  CARD_INVALID: "カードが無効",
  CARD_SUSPENDED: "カードが一時停止",
  CARD_EXPIRED: "カードが有効期間外",
  LOCKED: "ロック中",
  TICKET_EXPIRED: "チケット期限切れ",
  PIN_FORMAT: "PIN の形式不正",
  PIN_MISMATCH: "PIN 不一致",
  PIN_ALREADY_SET: "PIN 設定済み",
  PIN_WEAK: "PIN が弱い",
  ATTEST_NOT_CONFIGURED: "アテステーション未設定",
  ATTEST_BAD_SIGNATURE: "署名検証に失敗",
  ATTEST_KEY_MISMATCH: "端末鍵が不一致",
  ATTEST_KEY_IN_USE: "端末鍵が他端末で使用中",
  ATTEST_BAD_PROFILE: "端末プロファイル不正",
  SETTINGS_NO_DEVICE: "端末設定: 端末不明",
  SETTINGS_LOCKED: "端末設定: ロック中",
  SETTINGS_CODE_INVALID: "端末設定コード不一致",
  REACTIVATE_PROOF_REQUIRED: "端末再発行: 証明なし",
  REACTIVATE_BAD_SIGNATURE: "端末再発行: 署名不正",
  REACTIVATE_CODE_INVALID: "端末再発行: 設定コード不一致",
  REACTIVATE_LOCKED: "端末再発行: ロック中",
  REACTIVATE_TOKEN_LIVE: "端末再発行: トークン有効中",
  UNLOCK_PIN_NOT_ATTESTED: "退出 PIN: 未アテステーション端末",
  PORTAL_UNKNOWN_EMAIL: "ポータル: 未登録のアドレス",
  PORTAL_ACCOUNT_INACTIVE: "ポータル: アカウントが無効",
  PORTAL_CODE_EXPIRED: "ポータル: 確認コード期限切れ",
  PORTAL_CODE_MISMATCH: "ポータル: 確認コード不一致",
  PORTAL_CODE_ATTEMPTS: "ポータル: 確認コード試行上限",
  PORTAL_BACKUP_INVALID: "ポータル: バックアップコード不一致",
  PORTAL_LINK_NOT_FOUND: "ポータル: リンクが存在しない",
  PORTAL_LINK_EXPIRED: "ポータル: リンク期限切れ",
  PORTAL_LINK_REVOKED: "ポータル: リンクが失効済み",
  PORTAL_LINK_EXHAUSTED: "ポータル: リンクの使用回数超過",
  PORTAL_MAIL_FAILED: "ポータル: メール送信に失敗",
  PORTAL_MAIL_BLOCKED_DEV: "ポータル: dev の許可リスト外",
  UNKNOWN: "不明",
};

export function loginMethodLabel(method: string): string {
  return METHOD_LABELS[method as LoginMethod] ?? method;
}

export function loginReasonLabel(reason: string | null): string {
  if (!reason) return "—";
  return REASON_LABELS[reason as LoginFailureReason] ?? reason;
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
