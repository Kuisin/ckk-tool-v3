/**
 * home-settings-core.ts — ホーム画面カスタマイズの純ロジック（isomorphic）。
 *
 * app.user_home_settings の JSON（mode / starred / groups）を正規化し、
 * アプリ一覧を設定に従ってセクション分けする。DB を触らない純関数のみ —
 * サーバー（読み書き）とクライアント（ホーム描画・設定フォーム）で共用する。
 */

import { type AppCategory, type AppEntry, CATEGORY_COLORS } from "./app-list";

export type HomeMode = "default" | "custom";

// type alias（interface ではなく）: Prisma Json 列（InputJsonValue）へ
// そのまま渡せるようにする（interface は暗黙 index signature を持たない）。
export type HomeGroup = {
  /** グループ表示名（ユーザー入力） */
  name: string;
  /** 所属アプリ（appList の key。1 アプリは最大 1 グループ） */
  apps: string[];
};

export type HomeSettings = {
  mode: HomeMode;
  /** お気に入りアプリの key（ホーム上部に固定表示。配列順 = 表示順） */
  starred: string[];
  /** mode=custom 時のグループ定義（配列順 = 表示順） */
  groups: HomeGroup[];
};

export const DEFAULT_HOME_SETTINGS: HomeSettings = {
  mode: "default",
  starred: [],
  groups: [],
};

export const MAX_HOME_GROUPS = 20;
export const MAX_GROUP_NAME_LENGTH = 30;

/** カスタムモードで未所属アプリをまとめるセクション名。 */
export const UNGROUPED_SECTION_TITLE = "その他";

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string");
}

/**
 * DB / フォーム入力の生 JSON を正規化する。
 * 未知・重複アプリ key の除去（groups では先勝ち）、空グループ名の除去、
 * グループ数・名前長の上限を適用する。壊れた値は既定値に落ちる。
 */
export function sanitizeHomeSettings(
  raw: unknown,
  validKeys: Iterable<string>,
): HomeSettings {
  const valid = new Set(validKeys);
  if (typeof raw !== "object" || raw === null) return DEFAULT_HOME_SETTINGS;
  const obj = raw as Record<string, unknown>;

  const mode: HomeMode = obj.mode === "custom" ? "custom" : "default";

  const starred: string[] = [];
  for (const key of toStringArray(obj.starred)) {
    if (valid.has(key) && !starred.includes(key)) starred.push(key);
  }

  const groups: HomeGroup[] = [];
  const assigned = new Set<string>();
  if (Array.isArray(obj.groups)) {
    for (const g of obj.groups) {
      if (groups.length >= MAX_HOME_GROUPS) break;
      if (typeof g !== "object" || g === null) continue;
      const name =
        typeof (g as { name?: unknown }).name === "string"
          ? ((g as { name: string }).name
              .trim()
              .slice(0, MAX_GROUP_NAME_LENGTH) ?? "")
          : "";
      if (!name) continue;
      const apps: string[] = [];
      for (const key of toStringArray((g as { apps?: unknown }).apps)) {
        if (valid.has(key) && !assigned.has(key)) {
          assigned.add(key);
          apps.push(key);
        }
      }
      groups.push({ name, apps });
    }
  }

  return { mode, starred, groups };
}

export interface HomeSection {
  /** React key 用の安定キー */
  key: string;
  title: string;
  /** 既定カテゴリセクションのときのみ設定（色・アイコンの解決に使う） */
  category?: AppCategory;
  apps: AppEntry[];
}

/**
 * 表示対象アプリ（権限・フラグでの絞り込み後）を設定に従って
 * 「お気に入り + セクション」に分ける。お気に入りは各セクションから除外。
 */
export function organizeHomeApps(
  apps: AppEntry[],
  settings: HomeSettings,
): { starred: AppEntry[]; sections: HomeSection[] } {
  const byKey = new Map(apps.map((a) => [a.key, a]));
  const starred = settings.starred
    .map((key) => byKey.get(key))
    .filter((a): a is AppEntry => a !== undefined);
  const starredKeys = new Set(starred.map((a) => a.key));
  const rest = apps.filter((a) => !starredKeys.has(a.key));

  if (settings.mode === "custom") {
    const sections: HomeSection[] = [];
    const grouped = new Set<string>();
    settings.groups.forEach((group, i) => {
      const groupApps = group.apps
        .map((key) => {
          grouped.add(key);
          return byKey.get(key);
        })
        .filter(
          (a): a is AppEntry => a !== undefined && !starredKeys.has(a.key),
        );
      if (groupApps.length > 0) {
        sections.push({
          key: `group:${i}`,
          title: group.name,
          apps: groupApps,
        });
      }
    });
    const ungrouped = rest.filter((a) => !grouped.has(a.key));
    if (ungrouped.length > 0) {
      sections.push({
        key: "ungrouped",
        title: UNGROUPED_SECTION_TITLE,
        apps: ungrouped,
      });
    }
    return { starred, sections };
  }

  // default: カテゴリ別（CATEGORY_COLORS の定義順）
  const sections: HomeSection[] = [];
  for (const category of Object.keys(CATEGORY_COLORS) as AppCategory[]) {
    const categoryApps = rest.filter((a) => a.category === category);
    if (categoryApps.length > 0) {
      sections.push({
        key: `cat:${category}`,
        title: category,
        category,
        apps: categoryApps,
      });
    }
  }
  return { starred, sections };
}
