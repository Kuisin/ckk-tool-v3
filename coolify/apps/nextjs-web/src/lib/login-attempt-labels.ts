/**
 * login-attempt-labels.ts — login-attempt-core.ts の列挙に付く表示ラベル。
 *
 * **web 専用**（`login-attempt-core.ts` は web/kiosk の双子ファイルなので
 * next-intl を読み込めない — キオスクはこれらのラベルを一切表示しない。
 * SY0D（ログイン履歴）の 3 画面だけがここを読む）。
 */

import type { Locale } from "./i18n";
import { label } from "./messages";

export function loginMethodLabel(
  method: string,
  locale: Locale = "ja",
): string {
  return label(`loginAttempt.methods.${method}`, locale, method);
}

export function loginReasonLabel(
  reason: string | null,
  locale: Locale = "ja",
): string {
  if (!reason) return "—";
  return label(`loginAttempt.reasons.${reason}`, locale, reason);
}
