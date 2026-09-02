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

import { getTranslations } from "next-intl/server";
import type { AuditEntry } from "@/components/ui/shells";
import { auditFieldDiffs, formatAuditValue } from "@/lib/audit-field-labels";
import { avatarUrl } from "@/lib/avatar";
import { prisma } from "@/lib/db";
import type { Formatters } from "@/lib/format";
import type { Tr } from "@/lib/i18n";
import { inventoryNoteLabel } from "@/lib/inventory-note-labels";
import { getServerFormatters } from "@/lib/user-preferences";

export type AuditAction =
  | "CREATE"
  | "UPDATE"
  | "DELETE"
  | "SEED"
  | "MIGRATE"
  | "VIEW"
  /** 個人データを含むファイルの持ち出し（誰がいつ何件出したかを残す）。 */
  | "EXPORT";

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

/** action → 画面表示用のラベル。VIEW/EXPORT も含め全ての AuditAction を持つ。 */
function actionLabel(action: string, tr: Tr): string {
  return tr.has(`audit.action.${action}`)
    ? tr(`audit.action.${action}`)
    : action;
}

/** table_name → 画面表示用のラベル（操作履歴一覧の「対象」列）。訳が無ければテーブル名そのまま。 */
export function auditTableLabel(tableName: string, tr: Tr): string {
  return tr.has(`audit.table.${tableName}`)
    ? tr(`audit.table.${tableName}`)
    : tableName;
}

/**
 * 現在の操作ユーザー ID。認証が未実装（セッションなし）のため現状はシステム
 * ユーザーを返す（履歴上は「システム」表示）。
 * TODO(auth): Auth.js v5 実装後に signed-in user の UUID を返す。書き込み側は
 * ここだけを参照するので、認証実装時の変更点は 1 箇所で済む。
 */
export async function getCurrentActorId(): Promise<string | null> {
  try {
    const { auth } = await import("@/auth");
    const session = await auth();
    const id = (session?.user as { id?: string } | undefined)?.id;
    if (id) return id;
  } catch {
    // リクエスト外（instrumentation ポーラー・ビルド時）はセッションなし
  }
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

/** 一覧の要約に出す値。詳細表と同じ整形を使う（言葉を割らない）。 */
function fmtValue(v: unknown, key?: string): string {
  return formatAuditValue(v, key);
}

/** UPDATE の before/after からスカラー変更点を「ラベル: 旧 → 新」で要約。 */
function describeChange(
  action: string,
  before: unknown,
  after: unknown,
  tableName: string | undefined,
  tr: Tr,
): string {
  // システムイベント（SEED/MIGRATE 等）は after.note に人間向け説明を持つ。
  // lib/inventory.ts などが書く note は構造化ノート（鍵+パラメータ）のことが
  // あり、その場合はいま開いている人の言語で解決する（書いた瞬間の言語に
  // 固定しない）。
  const note = (after as { note?: unknown } | null)?.note;
  if (typeof note === "string" && note)
    return inventoryNoteLabel(tr, note) ?? note;
  if (action === "CREATE") return tr("common.create");
  if (action === "DELETE") return tr("common.delete");
  // 詳細表と同じ差分（入れ子は平らにして葉ごとに見る）。以前はここで
  // オブジェクトを丸ごと飛ばしていたので、設定 JSON だけが変わった操作は
  // 一覧に「更新」としか出ず、何をしたのか分からなかった。
  const diffs = auditFieldDiffs(before, after, tableName)
    .slice(0, 6)
    .map(
      (d) =>
        `${d.label}: ${fmtValue(d.before, d.key)} → ${fmtValue(d.after, d.key)}`,
    );
  return diffs.length > 0 ? diffs.join(" / ") : tr("common.update");
}

type AuditRow = {
  id: bigint;
  action: string;
  tableName: string;
  recordId: string | null;
  beforeData: unknown;
  afterData: unknown;
  createdAt: Date;
  user: {
    id: string;
    displayName: string;
    avatarThumbFileId: string | null;
    avatarFileId: string | null;
  } | null;
  /** 操作元のキオスク端末（共有タブレット経由の操作のみ）。 */
  kioskDevice: { id: string; name: unknown } | null;
};

/**
 * 履歴 1 行 → 表示用。日時はここで文字列にするので、閲覧者の表示設定
 * （タイムゾーン・日付形式・言語）を渡してもらう。
 */
function mapAudit(fmt: Formatters, tr: Tr, row: AuditRow): AuditEntry {
  return {
    id: row.id.toString(),
    action: actionLabel(row.action, tr),
    // 詳細ポップアップ用の生データ（一覧では使わない）。
    tableName: row.tableName,
    tableLabel: auditTableLabel(row.tableName, tr),
    recordId: row.recordId,
    before: row.beforeData,
    after: row.afterData,
    user: row.user?.displayName ?? tr("common.system"),
    // 操作者の顔写真（小）。未設定・システム操作ならイニシャル表示になる。
    avatarUrl: row.user ? actorAvatarUrl(row.user) : null,
    // 操作元の共有タブレット（Web からの操作は null → バッジを出さない）。
    device: row.kioskDevice ? fmt.deviceName(row.kioskDevice.name) : null,
    at: fmt.dateTime(row.createdAt),
    detail: describeChange(
      row.action,
      row.beforeData,
      row.afterData,
      row.tableName,
      tr,
    ),
  };
}

/**
 * 操作者のサムネイル URL（無ければ大サイズ → null）。
 * 履歴タブとコメント（lib/document-memos）で顔写真の出し方を揃えるため共有する。
 */
export function actorAvatarUrl(user: {
  id: string;
  avatarThumbFileId: string | null;
  avatarFileId: string | null;
}): string | null {
  if (user.avatarThumbFileId) {
    return avatarUrl(user.id, user.avatarThumbFileId, "thumb");
  }
  if (user.avatarFileId) return avatarUrl(user.id, user.avatarFileId);
  return null;
}

/** 1 レコードの履歴（詳細画面「履歴」タブ）。失敗時は空配列（画面を壊さない）。 */
export async function fetchAuditEntries(
  tableName: string,
  recordId: string,
): Promise<AuditEntry[]> {
  try {
    const [fmt, tr] = await Promise.all([
      getServerFormatters(),
      getTranslations(),
    ]);
    const rows = await prisma.auditLog.findMany({
      where: { tableName, recordId },
      orderBy: { createdAt: "desc" },
      include: {
        user: {
          select: {
            id: true,
            displayName: true,
            avatarThumbFileId: true,
            avatarFileId: true,
          },
        },
        kioskDevice: { select: { id: true, name: true } },
      },
      take: 100,
    });
    return rows.map((row) => mapAudit(fmt, tr, row));
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

/** 操作履歴 詳細（SY07 詳細ページ用）— 一覧行 + 生データ・ユーザー id。 */
export interface ActivityDetailEntry extends ActivityEntry {
  /** 操作ユーザー id（システム操作・不明時は null — ユーザー詳細リンク用）。 */
  userId: string | null;
  /** 生の操作種別（CREATE / UPDATE / DELETE / SEED / MIGRATE …）。 */
  actionRaw: string;
  beforeData: unknown;
  afterData: unknown;
}

/** 操作履歴 1 件の詳細。未存在・不正 id は null。 */
export async function getActivityEntry(
  id: string,
): Promise<ActivityDetailEntry | null> {
  let key: bigint;
  try {
    key = BigInt(id);
  } catch {
    return null;
  }
  try {
    const [fmt, tr] = await Promise.all([
      getServerFormatters(),
      getTranslations(),
    ]);
    const row = await prisma.auditLog.findUnique({
      where: { id: key },
      include: {
        user: {
          select: {
            id: true,
            displayName: true,
            avatarThumbFileId: true,
            avatarFileId: true,
          },
        },
        kioskDevice: { select: { id: true, name: true } },
      },
    });
    if (!row) return null;
    return {
      ...mapAudit(fmt, tr, row),
      tableName: row.tableName,
      tableLabel: auditTableLabel(row.tableName, tr),
      recordId: row.recordId,
      userId: row.user?.id ?? null,
      actionRaw: row.action,
      beforeData: row.beforeData ?? null,
      afterData: row.afterData ?? null,
    };
  } catch (e) {
    console.error("getActivityEntry failed", e);
    return null;
  }
}

/** 全体の操作履歴（管理者一覧）。失敗時は空配列。 */
export async function listAuditEntries(
  opts: { take?: number; skip?: number } = {},
): Promise<ActivityEntry[]> {
  const { take = 200, skip = 0 } = opts;
  try {
    const [fmt, tr] = await Promise.all([
      getServerFormatters(),
      getTranslations(),
    ]);
    const rows = await prisma.auditLog.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        user: {
          select: {
            id: true,
            displayName: true,
            avatarThumbFileId: true,
            avatarFileId: true,
          },
        },
        kioskDevice: { select: { id: true, name: true } },
      },
      take,
      skip,
    });
    return rows.map((row) => ({
      ...mapAudit(fmt, tr, row),
      tableName: row.tableName,
      tableLabel: auditTableLabel(row.tableName, tr),
      recordId: row.recordId,
    }));
  } catch (e) {
    console.error("listAuditEntries failed", e);
    return [];
  }
}
