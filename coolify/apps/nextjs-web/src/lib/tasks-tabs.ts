/**
 * tasks-tabs.ts — 承認・予定 (CM01) のタブ定義と、個人ごとの表示/非表示。
 *
 * タブは 6 枚あり、全部を使う人はまずいない（現場は作業予定、承認者は承認待ち、
 * 事務はフォーム…）。使わないタブが常に前に並ぶと、スマホでは自分のタブが
 * 画面外へ押し出される。そこで**隠すタブを本人が選べる**ようにした。
 *
 * 純関数（I/O なし）— サーバー（保存時の検証）とクライアント（描画・設定画面）で
 * 同じ判定を使う。並び順は常にこの定義の順で、入れ替えは持たない。
 */

export interface TaskTabDef {
  id: string;
  label: string;
  /** スマホのタブに出す短い名前（6 枚が横スクロールに収まるように）。 */
  shortLabel: string;
}

export const TASK_TABS: readonly TaskTabDef[] = [
  { id: "plans", label: "作業予定", shortLabel: "予定" },
  { id: "approvals", label: "承認待ち", shortLabel: "承認" },
  { id: "forms", label: "未回答のフォーム", shortLabel: "未回答" },
  { id: "my-forms", label: "回答済みのフォーム", shortLabel: "回答済み" },
  { id: "completions", label: "完了した申請", shortLabel: "完了" },
  { id: "comments", label: "文書のコメント", shortLabel: "コメント" },
];

/** 個人設定の保存キー（app.user_view_settings.key）。 */
export const TASK_TABS_SETTING_KEY = "general.tasks.tabs";

export const TASK_TAB_IDS: readonly string[] = TASK_TABS.map((t) => t.id);

export function taskTabLabel(id: string, short = false): string {
  const tab = TASK_TABS.find((t) => t.id === id);
  if (!tab) return id;
  return short ? tab.shortLabel : tab.label;
}

/**
 * 保存された値（{ hidden: string[] }）を正規化する。
 *
 * 知らない id は捨てる — 画面から消えたタブの設定が残り続けても意味が無く、
 * 「隠しているタブが 1 つあるはずなのに見つからない」という不整合になる。
 * ただし**その時点で出ていないだけのタブ**（承認権限が無い・完了通知がまだ
 * 無い）は捨てない。条件が変わればまた出てくるので、設定は残しておく。
 */
export function sanitizeHiddenTabs(raw: unknown): string[] {
  const list =
    typeof raw === "object" && raw !== null && "hidden" in raw
      ? (raw as { hidden: unknown }).hidden
      : raw;
  if (!Array.isArray(list)) return [];
  const hidden: string[] = [];
  for (const v of list) {
    if (typeof v !== "string") continue;
    if (!TASK_TAB_IDS.includes(v) || hidden.includes(v)) continue;
    hidden.push(v);
  }
  return hidden;
}

/**
 * 実際に描くタブ。並びは TASK_TABS の順。
 *
 * **全部隠されたら設定を無視して全部出す**（fail-open）。タブが 1 枚も無い
 * 画面は何も操作できず、設定を戻す手立ても画面の中にあるため、行き止まりを
 * 作らない。
 */
export function visibleTaskTabs(
  available: readonly string[],
  hidden: readonly string[],
): TaskTabDef[] {
  const shown = TASK_TABS.filter(
    (t) => available.includes(t.id) && !hidden.includes(t.id),
  );
  if (shown.length > 0) return shown;
  return TASK_TABS.filter((t) => available.includes(t.id));
}

/**
 * 開くタブを決める。URL の ?tab= が隠されている / 存在しないときは先頭へ
 * 落とす（隠したタブのリンクを踏んでも空白の画面にならない）。
 */
export function resolveActiveTab(
  requested: string | null | undefined,
  visible: readonly TaskTabDef[],
): string {
  if (requested && visible.some((t) => t.id === requested)) return requested;
  return visible[0]?.id ?? TASK_TABS[0].id;
}
