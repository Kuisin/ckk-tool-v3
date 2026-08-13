/**
 * ja.ts — キオスク UI 文言の正（source of truth）。
 *
 * `KioskMessages = typeof ja` を en/zh に型注釈することで、キー不足・型不一致を
 * コンパイル時に検出する（外部 i18n 依存なしの in-house 辞書 — docs の
 * DOCS_LANGS と同じ ja/en/zh）。値は文字列か小さなテンプレート関数のみ。
 * 新しい画面の文言はまずここに追加し、en/zh を同時に埋めること。
 */

export const ja = {
  /** ランチャーに並ぶアプリ名（app-list.ts の labelKey と対応）。 */
  apps: {
    stepExecution: "工程実行",
  },
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
  steps: {
    title: "工程実行",
    back: "アプリ一覧へ",
    backToList: "工程一覧へ",
    refresh: "更新",
    empty: "本日の担当工程はありません",
    upcoming: (n: number) => `予定 ${n} 件`,
    showCompleted: (n: number) => `完了した工程を表示（${n}）`,
    hideCompleted: "完了した工程を隠す",
    sections: {
      overdue: "遅延",
      today: "本日",
      upcoming: "予定",
    },
    card: {
      workOrder: (n: number) => `指示書 #${n}`,
      plannedQty: (n: number) => `割当 ${n} 本`,
      plannedTime: (start: string, end: string) => `${start}〜${end}`,
      allDay: "終日",
      expectedInput: (n: number) => `受入予定 ${n} 本`,
      inputRecorded: (n: number) => `受入 ${n} 本`,
      elapsed: (t: string) => `作業 ${t}`,
      elapsedLabel: "作業",
    },
    state: {
      startable: "開始可",
      blocked: "前工程待ち",
      working: "作業中",
      paused: "一時停止中",
      othersWorking: (name: string) => `${name} さんが作業中`,
      completed: "完了",
      cancelled: "キャンセル",
    },
    actions: {
      start: "工程開始",
      pause: "一時停止",
      resume: "再開",
      complete: "工程完了",
      cancel: "キャンセル",
      retry: "再試行",
    },
    start: {
      title: "工程を開始",
      inputLabel: (label: string) => label,
      expectedHint: (n: number) => `前工程からの想定は ${n} 本です`,
      differsHint: "想定と異なる本数です（このまま開始できます）",
      noneNote: "この工程は数量を記録しません。そのまま開始します。",
      submit: "開始する",
    },
    complete: {
      title: "工程を完了",
      noneNote: (n: number) =>
        `この工程は数量記録なしで完了します（通過数 ${n} 本）`,
      submit: "完了する",
    },
    quantity: {
      FLOW: {
        input: "受入数",
        success: "良品数",
        semi: "半製品",
        scrap: "廃棄",
        rework: "手直し",
      },
      INSPECTION: {
        input: "検査数",
        success: "合格数",
        semi: "不合格（半製品）",
        scrap: "不合格（廃棄）",
        rework: "不合格（手直し）",
      },
      defectsTitle: "不良内訳（区分）",
      total: "総不良数",
      fixed: "固定",
      computed: "自動計算",
      conservation: (sum: number, input: number) =>
        `内訳の合計（${sum}）が受入数（${input}）と一致しません`,
      overInput: (sum: number, input: number) =>
        `不良の合計（${sum}）が受入数（${input}）を超えています`,
      negative: "数量は 0 以上の整数で入力してください",
    },
    reasons: {
      title: "不良理由（任意）",
      reason: "理由",
      reasonPlaceholder: "不良種類を選択",
      count: "本数",
      add: "理由を追加",
      remove: "削除",
      hint: "在庫には影響しません（補助記録）",
    },
    inspection: {
      title: "検査記録",
      measured: "実測値",
      tolerance: (range: string) => `許容 ${range}`,
      pass: "合格",
      fail: "不合格",
      required: "必須",
      save: "検査記録を保存",
      saved: "検査記録を保存しました",
      requiredMissing: "必須項目の実測値を入力してください",
      recordsTitle: "記録済みの検査",
      noTemplates: "検査表テンプレートが未設定です（管理画面で設定）",
      recordedMeta: (at: string, by: string) => `${at} ${by}`,
      status: {
        PENDING: "未実施",
        PASS: "合格",
        FAIL: "不合格",
        APPROVED: "承認済",
      },
    },
    defects: {
      title: "不良記録",
      type: "不良種類",
      typePlaceholder: "不良種類を選択",
      description: "内容",
      descriptionPlaceholder: "不良の内容",
      addRow: "行を追加",
      removeRow: "削除",
      save: "不良記録を保存",
      saved: "不良記録を保存しました",
      recordsTitle: "記録済みの不良",
      open: "不良を記録",
    },
    errors: {
      OFFLINE: "通信に失敗しました。もう一度お試しください",
      NOT_FOUND: "工程が見つかりません",
      NOT_ASSIGNED: "この工程は担当ではありません",
      WO_NOT_APPROVED: "指示書が承認済み/進行中ではありません",
      NOT_STARTABLE: "前工程が完了していないため開始できません",
      LOCK_TAKEN: "別の人が先に開始しました",
      LOCK_HELD_BY_OTHER: "別の人が作業中です",
      NOT_IN_PROGRESS: "進行中の工程ではありません",
      ALREADY_COMPLETED: "この工程は既に完了しています",
      QUANTITY_REQUIRED: "数量を入力してください",
      QUANTITY_INVALID: "数量の入力を確認してください",
      ROUTING_INVALID: "分岐数量と一致しません",
      TEMPLATE_INVALID: "検査表がこの指示書と一致しません",
      ITEMS_REQUIRED: "記録する内容がありません",
      DEFECT_TYPE_INVALID: "不良種類が不正です",
      NO_PERMISSION: "この操作の権限がありません",
      UNKNOWN: "処理に失敗しました",
    },
  },
};

export type KioskMessages = typeof ja;
