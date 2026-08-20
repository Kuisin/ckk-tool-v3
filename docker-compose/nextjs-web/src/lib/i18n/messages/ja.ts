/**
 * ja.ts — アプリ本体 UI 文言の正（source of truth）。
 *
 * `WebMessages = typeof ja` を en/zh に型注釈することで、キー不足・型不一致を
 * コンパイル時に検出する（in-house 辞書 — lib/i18n/index.ts 参照）。値は
 * 文字列か小さなテンプレート関数のみ。
 *
 * ★ 移行中: 画面の文言は順次ここへ移す。まだ移していない画面は日本語の
 *   直書きのまま動く（表示が日本語になるだけで壊れない）。新しい画面・
 *   触った画面から `useI18n()` / `getServerMessages()` に寄せること。
 *   移行済み: シェル（ヘッダー / フッター / ランチャー）・ホーム・
 *   プロフィール一式・共通 UI（ボタン / 空状態 / 確認モーダル）。
 */

export const ja = {
  /** 画面をまたいで使う短い語。 */
  common: {
    save: "保存",
    cancel: "キャンセル",
    edit: "編集",
    create: "新規作成",
    copy: "複製",
    delete: "削除",
    close: "閉じる",
    reset: "リセット",
    search: "検索",
    approve: "承認",
    reject: "差し戻し",
    print: "印刷",
    pdf: "PDF",
    loading: "読み込み中",
    saved: "保存しました",
    saveFailed: "保存に失敗しました",
    required: "必須",
    yes: "はい",
    no: "いいえ",
    enabled: "有効",
    disabled: "無効",
    none: "—",
    back: "戻る",
  },
  shell: {
    appsLabel: "アプリ",
    home: "ホーム",
    searchPlaceholder: "操作コード / アプリ名...",
    notifications: "通知",
    markAllRead: "すべて既読",
    noNotifications: "通知はありません",
    profile: "プロフィール",
    notificationSettings: "通知設定",
    homeSettings: "ホーム画面設定",
    preferences: "表示設定",
    logout: "ログアウト",
    devBadge: "DEV",
  },
  home: {
    favorites: "お気に入り",
    other: "その他",
  },
  profile: {
    title: "プロフィール",
    photo: "プロフィール写真",
    photoUpload: "写真を変更",
    photoDelete: "写真を削除",
    username: "ユーザー名",
    email: "メール",
    department: "所属",
    jobTitle: "役職",
    company: "会社",
    office: "拠点",
    phone: "電話",
  },
  /** /profile/preferences（言語・日付・時刻・タイムゾーン）。 */
  preferences: {
    title: "表示設定",
    description:
      "言語と日時の表示方法を選びます。設定はこのユーザーだけに適用され、Web とタブレット（キオスク）で共通です。",
    language: "言語",
    languageHelp:
      "画面の言語です。まだ翻訳されていない画面は日本語で表示されます。",
    dateFormat: "日付の形式",
    timeFormat: "時刻の形式",
    time24h: "24時間（14:30）",
    time12h: "12時間（2:30 PM）",
    timeZone: "タイムゾーン",
    timeZoneHelp:
      "日時をどの地域の時刻で表示するかです。保存される時刻そのものは変わりません。",
    preview: "プレビュー",
    previewDate: "日付",
    previewDateTime: "日時",
    previewTime: "時刻",
    saved: "表示設定を保存しました",
  },
  notifications: {
    title: "通知設定",
  },
  homeSettings: {
    title: "ホーム画面設定",
  },
};

export type WebMessages = typeof ja;
