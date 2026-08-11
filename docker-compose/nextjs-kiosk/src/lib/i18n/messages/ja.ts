/**
 * ja.ts — キオスク UI 文言の正（source of truth）。
 *
 * `KioskMessages = typeof ja` を en/zh に型注釈することで、キー不足・型不一致を
 * コンパイル時に検出する（外部 i18n 依存なしの in-house 辞書 — docs の
 * DOCS_LANGS と同じ ja/en/zh）。値は文字列か小さなテンプレート関数のみ。
 * 新しい画面の文言はまずここに追加し、en/zh を同時に埋めること。
 */

export const ja = {
  launcher: {
    greeting: (name: string) => `${name} さん`,
    logout: "ログアウト",
    appsTitle: "アプリ",
    noApps: "利用できるアプリは準備中です",
    language: "言語",
  },
  activity: {
    /** 例: あと 2:30 で自動ログアウト（time = "m:ss"） */
    autoLogout: (time: string) => `あと ${time} で自動ログアウト`,
  },
};

export type KioskMessages = typeof ja;
