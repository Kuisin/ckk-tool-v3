import "server-only";

/**
 * accounting-settings.ts — 会計連携設定の読み書き（SY0J）。
 *
 * 汎用の設定表（`app.system_settings`）へ `accounting.*` として置くので、
 * 項目を足しても DB の変更は要らない（lib/app-config.ts の規約）。
 * 値の意味・既定・検証は `accounting-export-core.ts` が持つ。
 *
 * `accounting.receivableAccountCode` など科目コードの 4 本は、マイグレーション
 * 20261023090000_accounting_codes が空文字で作ってある（設定画面が「まだ 1 度も
 * 保存していない」状態を特別扱いしないで済むように）。
 */

import {
  type AccountingExportSettings,
  accountingExportSettingsSchema,
  DEFAULT_ACCOUNTING_EXPORT_SETTINGS,
} from "./accounting-export-core";
import { readConfigNamespace, writeConfigValues } from "./app-config";
import { prisma } from "./db";

/** 平坦なキー → system_settings のキー。科目コードは 1 つずつ別キーに置く。 */
const KEY = {
  columns: "accounting.columns",
  headerRow: "accounting.headerRow",
  encoding: "accounting.encoding",
  newline: "accounting.newline",
  dateFormat: "accounting.dateFormat",
  quoteMode: "accounting.quoteMode",
  amountStyle: "accounting.amountStyle",
  filenameSuffix: "accounting.filenameSuffix",
  taxCodeRules: "accounting.taxCodeRules",
  receivableAccountCode: "accounting.receivableAccountCode",
  salesAccountCode: "accounting.salesAccountCode",
  taxAccountCode: "accounting.taxAccountCode",
  deptCode: "accounting.deptCode",
  taxCode: "accounting.taxCode",
} as const;

/**
 * 現在の設定。未設定のキーは既定で埋める。
 *
 * **壊れた値でエクスポートを 500 にしない** — 1 つでも検証に落ちたら既定に倒す。
 * 設定が不正なときに出るのは「会計ソフトの正式な形ではないが構造としては正しい
 * CSV」で、そのほうが「ダウンロードを押すと画面が落ちる」より直しやすい。
 */
export async function getAccountingSettings(): Promise<AccountingExportSettings> {
  const stored = await readConfigNamespace("accounting");
  const d = DEFAULT_ACCOUNTING_EXPORT_SETTINGS;
  const take = <T>(key: string, fallback: T): T => {
    const v = stored.get(key);
    return v === undefined ? fallback : (v as T);
  };
  const merged: AccountingExportSettings = {
    columns: take(KEY.columns, d.columns),
    headerRow: take(KEY.headerRow, d.headerRow),
    encoding: take(KEY.encoding, d.encoding),
    newline: take(KEY.newline, d.newline),
    dateFormat: take(KEY.dateFormat, d.dateFormat),
    quoteMode: take(KEY.quoteMode, d.quoteMode),
    amountStyle: take(KEY.amountStyle, d.amountStyle),
    filenameSuffix: take(KEY.filenameSuffix, d.filenameSuffix),
    taxCodeRules: take(KEY.taxCodeRules, d.taxCodeRules),
    accounts: {
      receivableAccountCode: take(
        KEY.receivableAccountCode,
        d.accounts.receivableAccountCode,
      ),
      salesAccountCode: take(KEY.salesAccountCode, d.accounts.salesAccountCode),
      taxAccountCode: take(KEY.taxAccountCode, d.accounts.taxAccountCode),
      deptCode: take(KEY.deptCode, d.accounts.deptCode),
      taxCode: take(KEY.taxCode, d.accounts.taxCode),
    },
  };
  const parsed = accountingExportSettingsSchema.safeParse(merged);
  if (!parsed.success) {
    console.error(
      // i18n-ignore — サーバーログのみ（Loki）、UI に出ない
      "[accounting] 設定が不正なので既定で動かします:",
      parsed.error.issues,
    );
    return DEFAULT_ACCOUNTING_EXPORT_SETTINGS;
  }
  return parsed.data;
}

/**
 * いまの設定の「版」— `accounting.*` の中で最後に更新された時刻（ISO 文字列）。
 *
 * 設定を変えると**同じ請求書を書き出し直したときのバイト列が変わる**。あとから
 * 「この CSV はどの設定で出たのか」を追えるように、エクスポートの監査行へ添える。
 * 版番号の列を別に持たないのは、持つと設定の保存と版の更新がずれ得るため —
 * updated_at はその 1 行の保存そのものなのでずれない。
 */
export async function getAccountingSettingsRevision(): Promise<string | null> {
  const row = await prisma.systemSetting.findFirst({
    where: { key: { startsWith: "accounting." } },
    orderBy: { updatedAt: "desc" },
    select: { updatedAt: true },
  });
  return row?.updatedAt.toISOString() ?? null;
}

export async function saveAccountingSettings(
  settings: AccountingExportSettings,
): Promise<void> {
  await writeConfigValues({
    [KEY.columns]: settings.columns,
    [KEY.headerRow]: settings.headerRow,
    [KEY.encoding]: settings.encoding,
    [KEY.newline]: settings.newline,
    [KEY.dateFormat]: settings.dateFormat,
    [KEY.quoteMode]: settings.quoteMode,
    [KEY.amountStyle]: settings.amountStyle,
    [KEY.filenameSuffix]: settings.filenameSuffix,
    [KEY.taxCodeRules]: settings.taxCodeRules,
    [KEY.receivableAccountCode]: settings.accounts.receivableAccountCode,
    [KEY.salesAccountCode]: settings.accounts.salesAccountCode,
    [KEY.taxAccountCode]: settings.accounts.taxAccountCode,
    [KEY.deptCode]: settings.accounts.deptCode,
    [KEY.taxCode]: settings.accounts.taxCode,
  });
}
