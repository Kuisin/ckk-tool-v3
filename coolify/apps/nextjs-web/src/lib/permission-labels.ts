/**
 * permission-labels.ts — 権限コード・アクション・スコープの表示名（ja / en / zh）。
 *
 * **画面に権限コードを生で出さない**ための 1 箇所。これまで SY01 の実効権限は
 * `quote` `kiosk_secret` のようなコードをそのまま並べていて、利用者には
 * 「何ができる権限なのか」が読めなかった。マニュアルにも同じ名前で書けるよう、
 * ラベルはここだけに置く。
 *
 * ■ 日本語が原本
 * `messages/*.json` と同じ約束で、**ja を先に書き、en / zh はその訳**。
 * 迷ったら ja の文言を直してから訳し直すこと。
 *
 * ■ DB の app.permissions.display_name との関係
 * DB 側にも表示名の列があるが、**画面とマニュアルはこちらを読む**。理由は 2 つ:
 *   - マニュアルはビルド時に組み立てるので DB を引けない
 *   - DB 側は ja / en だけで zh が無い
 * DB の列は psql や BI で読むときの手掛かりとして残す。両者が食い違わないよう、
 * permission-labels.test.ts が「seed に有るコードはここにも有る」を検査する。
 *
 * ■ 権限は「コード × アクション × スコープ」の 3 つで決まる
 *   コード     … 何に対する権限か（見積書 / 在庫 / …）
 *   アクション … その中で何ができるか（閲覧 / 作成 / 更新 / 削除 / 書き出し）
 *   スコープ   … どこまでの範囲か（全社 / 拠点 / 自分の担当）
 * 承認だけは例外で、**アクションでは決まらない** — 誰が承認できるかは承認設定
 * (MS0B) の承認グループ所属が決める（`lib/authz.ts` checkApprovalDocAccess）。
 */

import type { Locale } from "@/lib/i18n";
import { localizedLabel } from "./messages";

/** 3 言語ぶんの文言。ja が原本。 */
export interface LocalizedLabel {
  ja: string;
  en: string;
  zh: string;
}

/** 権限の性格。マニュアルの一覧をこの順・この区分で並べる。 */
export type PermissionGroup =
  | "business" // 日々の業務で使う
  | "master" // マスタと設定
  | "admin" // 管理者向け
  | "privileged"; // 申請と承認が要る特権操作

export interface PermissionMeta {
  code: string;
  label: LocalizedLabel;
  /** 「この権限があると何ができるか」の 1 行。 */
  summary: LocalizedLabel;
  group: PermissionGroup;
}

export const PERMISSION_GROUP_LABEL: Record<PermissionGroup, LocalizedLabel> = {
  business: localizedLabel("permission.PERMISSION_GROUP_LABEL.business"),
  master: localizedLabel("permission.PERMISSION_GROUP_LABEL.master"),
  admin: localizedLabel("permission.PERMISSION_GROUP_LABEL.admin"),
  privileged: localizedLabel("permission.PERMISSION_GROUP_LABEL.privileged"),
};

/** 種類ごとの説明。「権限にはどんな種類があるのか」をマニュアルで語るための 1 段落。 */
export const PERMISSION_GROUP_SUMMARY: Record<PermissionGroup, LocalizedLabel> =
  {
    business: localizedLabel("permission.PERMISSION_GROUP_SUMMARY.business"),
    master: localizedLabel("permission.PERMISSION_GROUP_SUMMARY.master"),
    admin: localizedLabel("permission.PERMISSION_GROUP_SUMMARY.admin"),
    privileged: localizedLabel(
      "permission.PERMISSION_GROUP_SUMMARY.privileged",
    ),
  };

/**
 * 権限コードの一覧。**app.permissions に入るコードと同じ集合**
 * （shared-db/sql/rbac-seed.sql + migrations）。
 */
export const PERMISSIONS: readonly PermissionMeta[] = [
  // ── 業務 ────────────────────────────────────────────────────────────────
  {
    code: "price_list",
    label: localizedLabel("permission.PERMISSIONS.price_list.label"),
    summary: localizedLabel("permission.PERMISSIONS.price_list.summary"),
    group: "business",
  },
  {
    code: "quote",
    label: localizedLabel("permission.PERMISSIONS.quote.label"),
    summary: localizedLabel("permission.PERMISSIONS.quote.summary"),
    group: "business",
  },
  {
    code: "order_acceptance",
    label: localizedLabel("permission.PERMISSIONS.order_acceptance.label"),
    summary: localizedLabel("permission.PERMISSIONS.order_acceptance.summary"),
    group: "business",
  },
  {
    code: "design_request",
    label: localizedLabel("permission.PERMISSIONS.design_request.label"),
    summary: localizedLabel("permission.PERMISSIONS.design_request.summary"),
    group: "business",
  },
  {
    code: "design_file",
    label: localizedLabel("permission.PERMISSIONS.design_file.label"),
    summary: localizedLabel("permission.PERMISSIONS.design_file.summary"),
    group: "business",
  },
  {
    code: "purchase_order",
    label: localizedLabel("permission.PERMISSIONS.purchase_order.label"),
    summary: localizedLabel("permission.PERMISSIONS.purchase_order.summary"),
    group: "business",
  },
  {
    code: "material_receipt",
    label: localizedLabel("permission.PERMISSIONS.material_receipt.label"),
    summary: localizedLabel("permission.PERMISSIONS.material_receipt.summary"),
    group: "business",
  },
  {
    code: "outsource_order",
    label: localizedLabel("permission.PERMISSIONS.outsource_order.label"),
    summary: localizedLabel("permission.PERMISSIONS.outsource_order.summary"),
    group: "business",
  },
  {
    code: "work_order",
    label: localizedLabel("permission.PERMISSIONS.work_order.label"),
    summary: localizedLabel("permission.PERMISSIONS.work_order.summary"),
    group: "business",
  },
  {
    code: "inventory",
    label: localizedLabel("permission.PERMISSIONS.inventory.label"),
    summary: localizedLabel("permission.PERMISSIONS.inventory.summary"),
    group: "business",
  },
  {
    code: "delivery_order",
    label: localizedLabel("permission.PERMISSIONS.delivery_order.label"),
    summary: localizedLabel("permission.PERMISSIONS.delivery_order.summary"),
    group: "business",
  },
  {
    code: "delivery_note",
    label: localizedLabel("permission.PERMISSIONS.delivery_note.label"),
    summary: localizedLabel("permission.PERMISSIONS.delivery_note.summary"),
    group: "business",
  },
  {
    code: "invoice",
    label: localizedLabel("permission.PERMISSIONS.invoice.label"),
    summary: localizedLabel("permission.PERMISSIONS.invoice.summary"),
    group: "business",
  },
  {
    code: "billing_closing",
    label: localizedLabel("permission.PERMISSIONS.billing_closing.label"),
    summary: localizedLabel("permission.PERMISSIONS.billing_closing.summary"),
    group: "business",
  },
  {
    code: "approve",
    label: localizedLabel("permission.PERMISSIONS.approve.label"),
    summary: localizedLabel("permission.PERMISSIONS.approve.summary"),
    group: "business",
  },
  {
    code: "form",
    label: localizedLabel("permission.PERMISSIONS.form.label"),
    summary: localizedLabel("permission.PERMISSIONS.form.summary"),
    group: "business",
  },
  {
    code: "internal_page",
    label: localizedLabel("permission.PERMISSIONS.internal_page.label"),
    summary: localizedLabel("permission.PERMISSIONS.internal_page.summary"),
    group: "business",
  },

  // ── マスタ・設定 ─────────────────────────────────────────────────────────
  {
    code: "master",
    label: localizedLabel("permission.PERMISSIONS.master.label"),
    summary: localizedLabel("permission.PERMISSIONS.master.summary"),
    group: "master",
  },
  {
    code: "admin_manual",
    label: localizedLabel("permission.PERMISSIONS.admin_manual.label"),
    summary: localizedLabel("permission.PERMISSIONS.admin_manual.summary"),
    group: "master",
  },

  // ── 管理 ────────────────────────────────────────────────────────────────
  {
    code: "system",
    label: localizedLabel("permission.PERMISSIONS.system.label"),
    summary: localizedLabel("permission.PERMISSIONS.system.summary"),
    group: "admin",
  },
  {
    code: "kiosk",
    label: localizedLabel("permission.PERMISSIONS.kiosk.label"),
    summary: localizedLabel("permission.PERMISSIONS.kiosk.summary"),
    group: "admin",
  },

  // ── 特権操作 ────────────────────────────────────────────────────────────
  {
    code: "kiosk_secret",
    label: localizedLabel("permission.PERMISSIONS.kiosk_secret.label"),
    summary: localizedLabel("permission.PERMISSIONS.kiosk_secret.summary"),
    group: "privileged",
  },
  {
    code: "kiosk_device",
    label: localizedLabel("permission.PERMISSIONS.kiosk_device.label"),
    summary: localizedLabel("permission.PERMISSIONS.kiosk_device.summary"),
    group: "privileged",
  },
  {
    code: "kiosk_card",
    label: localizedLabel("permission.PERMISSIONS.kiosk_card.label"),
    summary: localizedLabel("permission.PERMISSIONS.kiosk_card.summary"),
    group: "privileged",
  },
  {
    code: "personal_data",
    label: localizedLabel("permission.PERMISSIONS.personal_data.label"),
    summary: localizedLabel("permission.PERMISSIONS.personal_data.summary"),
    group: "privileged",
  },
  {
    code: "user_admin",
    label: localizedLabel("permission.PERMISSIONS.user_admin.label"),
    summary: localizedLabel("permission.PERMISSIONS.user_admin.summary"),
    group: "privileged",
  },
  {
    code: "portal_admin",
    label: localizedLabel("permission.PERMISSIONS.portal_admin.label"),
    summary: localizedLabel("permission.PERMISSIONS.portal_admin.summary"),
    group: "privileged",
  },
];

const BY_CODE = new Map(PERMISSIONS.map((p) => [p.code, p]));

/** 権限コードの定義。未知のコードは null。 */
export function permissionMeta(code: string): PermissionMeta | null {
  return BY_CODE.get(code) ?? null;
}

/** 表示名。未知のコードはコードをそのまま返す（画面が空欄にならないように）。 */
export function permissionLabel(code: string, locale: Locale = "ja"): string {
  return BY_CODE.get(code)?.label[locale] ?? code;
}

/** 「この権限があると何ができるか」。未知のコードは空文字。 */
export function permissionSummary(code: string, locale: Locale = "ja"): string {
  return BY_CODE.get(code)?.summary[locale] ?? "";
}

/** 「見積書（quote）」— 画面で名前とコードを並べたいとき。 */
export function permissionLabelWithCode(
  code: string,
  locale: Locale = "ja",
): string {
  const meta = BY_CODE.get(code);
  return meta ? `${meta.label[locale]}（${code}）` : code;
}

/** app.ACTION — その権限の中で何ができるか。 */
export const ACTION_LABEL: Record<string, LocalizedLabel> = {
  READ: localizedLabel("permission.ACTION_LABEL.READ"),
  CREATE: localizedLabel("permission.ACTION_LABEL.CREATE"),
  UPDATE: localizedLabel("permission.ACTION_LABEL.UPDATE"),
  DELETE: localizedLabel("permission.ACTION_LABEL.DELETE"),
  EXPORT: localizedLabel("permission.ACTION_LABEL.EXPORT"),
  APPROVE: localizedLabel("permission.ACTION_LABEL.APPROVE"),
  ADMIN: localizedLabel("permission.ACTION_LABEL.ADMIN"),
};

/** app.SCOPE — どこまでの範囲に及ぶか。 */
export const SCOPE_LABEL: Record<string, LocalizedLabel> = {
  ALL: localizedLabel("permission.SCOPE_LABEL.ALL"),
  REGION: localizedLabel("permission.SCOPE_LABEL.REGION"),
  COUNTRY: localizedLabel("permission.SCOPE_LABEL.COUNTRY"),
  PLANT: localizedLabel("permission.SCOPE_LABEL.PLANT"),
  DEPARTMENT: localizedLabel("permission.SCOPE_LABEL.DEPARTMENT"),
  TEAM: localizedLabel("permission.SCOPE_LABEL.TEAM"),
  SUB: localizedLabel("permission.SCOPE_LABEL.SUB"),
  OWN: localizedLabel("permission.SCOPE_LABEL.OWN"),
};

export function actionLabel(action: string, locale: Locale = "ja"): string {
  return ACTION_LABEL[action]?.[locale] ?? action;
}

export function scopeLabel(scope: string, locale: Locale = "ja"): string {
  return SCOPE_LABEL[scope]?.[locale] ?? scope;
}

/** マニュアルの一覧を出す順。 */
export const PERMISSION_GROUP_ORDER: readonly PermissionGroup[] = [
  "business",
  "master",
  "admin",
  "privileged",
];

export function permissionsByGroup(group: PermissionGroup): PermissionMeta[] {
  return PERMISSIONS.filter((p) => p.group === group);
}
