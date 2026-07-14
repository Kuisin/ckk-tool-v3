/**
 * audit.ts — 業務操作履歴（audit_logs）の読み書き。server-only.
 *
 * 詳細画面の「履歴」タブ（record 単位）と管理者向け操作履歴一覧（全体）へ
 * データを供給する。書き込みは Server Action の mutation 直後に best-effort で
 * 行う（ログ失敗で業務処理は止めない）。
 *
 * record_id は業務識別子文字列（文書番号 QOT-…/EST-…、価格表エントリキー、
 * マスタの文字列 id）。認証未実装のため user_id は現状 null（後述 TODO(auth)）。
 */

import type { AuditEntry } from "@/components/ui/shells";
import { prisma } from "@/lib/db";
import { formatDateTime } from "@/lib/format";

export type AuditAction = "CREATE" | "UPDATE" | "DELETE" | "SEED" | "MIGRATE";

/**
 * システムユーザー（固定 UUID）。認証実装前の操作、および seed・force-migration
 * 等のシステム操作の actor。app.users に同 UUID の行を用意する
 * （migration 20260706040000_add_system_user / seed）。
 */
export const SYSTEM_USER_ID = "00000000-0000-0000-0000-000000000000";

export interface RecordAuditInput {
  action: AuditAction;
  /** DB テーブル名（@@map 値）。例: "quotes" / "price_list_entries" / "products" */
  tableName: string;
  /** 業務識別子（文書番号・エントリキー・id） */
  recordId: string;
  /** 変更前スナップショット（プレーンな JSON 相当のみ）。CREATE では省略。 */
  before?: unknown;
  /** 変更後スナップショット。DELETE では省略。 */
  after?: unknown;
}

const ACTION_LABEL: Record<string, string> = {
  CREATE: "作成",
  UPDATE: "更新",
  DELETE: "削除",
  SEED: "初期データ",
  MIGRATE: "マイグレーション",
};

/** table_name → 画面表示用の日本語ラベル（操作履歴一覧の「対象」列）。 */
export const AUDIT_TABLE_LABELS: Record<string, string> = {
  quotes: "見積書",
  estimates: "試算",
  price_list_entries: "価格表",
  products: "製品",
  materials: "素材",
  material_types: "材種",
  business_partners: "取引先",
  feature_flags: "アプリ管理",
  factories: "工場",
  process_step_catalog: "工程マスタ",
  inspection_templates: "検査表テンプレート",
  defect_types: "不良種類",
  approval_groups: "承認グループ",
  system: "システム",
};

export function auditTableLabel(tableName: string): string {
  return AUDIT_TABLE_LABELS[tableName] ?? tableName;
}

/** 主要フィールドの日本語ラベル（UPDATE 差分表示用）。未登録キーはそのまま表示。 */
const FIELD_LABELS: Record<string, string> = {
  status: "ステータス",
  isActive: "有効",
  notes: "備考",
  unitPrice: "単価",
  baseUnitPrice: "基準単価",
  validFrom: "有効開始日",
  validUntil: "有効終了日",
  quantity: "数量",
  name: "名称",
  nameJa: "名称",
  unit: "単位",
};

/**
 * 現在の操作ユーザー ID。認証が未実装（セッションなし）のため現状はシステム
 * ユーザーを返す（履歴上は「システム」表示）。
 * TODO(auth): Auth.js v5 実装後に signed-in user の UUID を返す。書き込み側は
 * ここだけを参照するので、認証実装時の変更点は 1 箇所で済む。
 */
export async function getCurrentActorId(): Promise<string | null> {
  return SYSTEM_USER_ID;
}

/** unknown を Prisma Json 相当（プレーン値）へ。BigInt/循環参照を避けるため best-effort。 */
function toJson(value: unknown): object | undefined {
  if (value === undefined || value === null) return undefined;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return undefined;
  }
}

/**
 * 監査ログを 1 件記録する。best-effort — 失敗しても例外は投げない
 * （業務 mutation を監査ログの失敗で巻き戻さない）。
 */
export async function recordAudit(input: RecordAuditInput): Promise<void> {
  try {
    const userId = await getCurrentActorId();
    await prisma.auditLog.create({
      data: {
        userId,
        action: input.action,
        tableName: input.tableName,
        recordId: input.recordId,
        beforeData: toJson(input.before),
        afterData: toJson(input.after),
      },
    });
  } catch (e) {
    console.error("recordAudit failed", e);
  }
}

/**
 * システム操作（seed / force-migration 等）を履歴に記録する。
 * actor は常にシステムユーザー。`note` が履歴の「変更内容」に表示される。
 */
export async function recordSystemEvent(input: {
  action: "SEED" | "MIGRATE";
  tableName?: string;
  recordId?: string;
  note: string;
}): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        userId: SYSTEM_USER_ID,
        action: input.action,
        tableName: input.tableName ?? "system",
        recordId: input.recordId ?? null,
        afterData: { note: input.note },
      },
    });
  } catch (e) {
    console.error("recordSystemEvent failed", e);
  }
}

// ── read side ────────────────────────────────────────────────────────────────

function fmtValue(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "boolean") return v ? "有効" : "無効";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

/** UPDATE の before/after からスカラー変更点を「ラベル: 旧 → 新」で要約。 */
function describeChange(
  action: string,
  before: unknown,
  after: unknown,
): string {
  // システムイベント（SEED/MIGRATE 等）は after.note に人間向け説明を持つ。
  const note = (after as { note?: unknown } | null)?.note;
  if (typeof note === "string" && note) return note;
  if (action === "CREATE") return "新規作成";
  if (action === "DELETE") return "削除";
  const b = (before ?? {}) as Record<string, unknown>;
  const a = (after ?? {}) as Record<string, unknown>;
  const keys = new Set([...Object.keys(b), ...Object.keys(a)]);
  const diffs: string[] = [];
  for (const k of keys) {
    const bv = b[k];
    const av = a[k];
    // ネスト（配列・オブジェクト）は差分表示から除外（明細等）。
    if (
      (bv !== null && typeof bv === "object") ||
      (av !== null && typeof av === "object")
    ) {
      continue;
    }
    if (fmtValue(bv) === fmtValue(av)) continue;
    const label = FIELD_LABELS[k] ?? k;
    diffs.push(`${label}: ${fmtValue(bv)} → ${fmtValue(av)}`);
    if (diffs.length >= 6) break;
  }
  return diffs.length > 0 ? diffs.join(" / ") : "更新";
}

type AuditRow = {
  id: bigint;
  action: string;
  tableName: string;
  recordId: string | null;
  beforeData: unknown;
  afterData: unknown;
  createdAt: Date;
  user: { displayName: string } | null;
};

function mapAudit(row: AuditRow): AuditEntry {
  return {
    id: row.id.toString(),
    action: ACTION_LABEL[row.action] ?? row.action,
    user: row.user?.displayName ?? "システム",
    at: formatDateTime(row.createdAt),
    detail: describeChange(row.action, row.beforeData, row.afterData),
  };
}

/** 1 レコードの履歴（詳細画面「履歴」タブ）。失敗時は空配列（画面を壊さない）。 */
export async function fetchAuditEntries(
  tableName: string,
  recordId: string,
): Promise<AuditEntry[]> {
  try {
    const rows = await prisma.auditLog.findMany({
      where: { tableName, recordId },
      orderBy: { createdAt: "desc" },
      include: { user: { select: { displayName: true } } },
      take: 100,
    });
    return rows.map(mapAudit);
  } catch (e) {
    console.error("fetchAuditEntries failed", e);
    return [];
  }
}

export interface ActivityEntry extends AuditEntry {
  tableName: string;
  tableLabel: string;
  recordId: string | null;
}

/** 全体の操作履歴（管理者一覧）。失敗時は空配列。 */
export async function listAuditEntries(
  opts: { take?: number; skip?: number } = {},
): Promise<ActivityEntry[]> {
  const { take = 200, skip = 0 } = opts;
  try {
    const rows = await prisma.auditLog.findMany({
      orderBy: { createdAt: "desc" },
      include: { user: { select: { displayName: true } } },
      take,
      skip,
    });
    return rows.map((row) => ({
      ...mapAudit(row),
      tableName: row.tableName,
      tableLabel: auditTableLabel(row.tableName),
      recordId: row.recordId,
    }));
  } catch (e) {
    console.error("listAuditEntries failed", e);
    return [];
  }
}
