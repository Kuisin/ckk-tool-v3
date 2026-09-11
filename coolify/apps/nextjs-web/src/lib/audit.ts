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
import { entityNameOf, resolveEntityNames } from "@/lib/audit-entity-name";
import { auditFieldDiffs, formatAuditValue } from "@/lib/audit-field-labels";
import type { AuditQuery } from "@/lib/audit-filter-core";
import { resolveAuditRecordKey } from "@/lib/audit-record-key";
import { avatarUrl } from "@/lib/avatar";
import { prisma } from "@/lib/db";
import type { Formatters } from "@/lib/format";
import { zonedDayRange } from "@/lib/format";
import type { Locale, Tr } from "@/lib/i18n";
import { inventoryNoteLabel } from "@/lib/inventory-note-labels";
import { getServerFormatters } from "@/lib/user-preferences";
import type { Prisma } from "../../generated/client/client";

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
  /** 業務識別子（文書番号・エントリキー・id。表示用 — 従来どおり） */
  recordId: string;
  /**
   * レコードの安定キー（省略可）。呼び出し元が更新直後の行を持っていて
   * PK が既に手元にあるときはここへ渡すと `audit-record-key.ts` の解決
   * クエリを省ける。省略時は `tableName`/`recordId` から自動解決する
   * （`lib/audit-record-key-core.ts` の登録簿）。
   */
  recordKey?: string;
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
 *
 * `record_key`（安定キー）は `input.recordKey` が渡されていればそれを使い、
 * 無ければ `resolveAuditRecordKey` で自動解決する。解決に失敗しても
 * （＝ null でも）監査行そのものは必ず書く — キーは読みやすさのための
 * 付加情報であって、無いことが書き込みを止める理由にはならない。
 */
export async function recordAudit(input: RecordAuditInput): Promise<void> {
  try {
    const userId = await getCurrentActorId();
    const recordKey =
      input.recordKey ??
      (await resolveAuditRecordKey(input.tableName, input.recordId)).key;
    await prisma.auditLog.create({
      data: {
        userId,
        action: input.action,
        tableName: input.tableName,
        recordId: input.recordId,
        recordKey,
        beforeData: toJson(input.before),
        afterData: toJson(input.after),
      },
    });
  } catch (e) {
    console.error("recordAudit failed", e);
  }
}

// ── read side ────────────────────────────────────────────────────────────────

/** 一覧・履歴タブに出す差分行を作る（表示専用の変換込み）。 */
function changePairs(
  before: unknown,
  after: unknown,
  tableName: string | undefined,
  tr: Tr,
  locale: Locale,
): string[] {
  return auditFieldDiffs(before, after, tableName, locale).map((d) =>
    tr("audit.change.pair", {
      label: d.label,
      before: formatAuditValue(d.before, d.key, { locale, tableName }),
      after: formatAuditValue(d.after, d.key, { locale, tableName }),
    }),
  );
}

/** UPDATE の before/after からスカラー変更点を「ラベル: 旧 → 新」で要約。 */
function describeChange(
  action: string,
  before: unknown,
  after: unknown,
  tableName: string | undefined,
  tr: Tr,
  locale: Locale,
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
  const all = changePairs(before, after, tableName, tr, locale);
  if (all.length === 0) return tr("common.update");
  // 3 件を超えたら「+N」を付ける — 以前は 6 件で無言のまま切り捨てていて、
  // 何件省略されたか画面から分からなかった。
  const shown = all.slice(0, 3);
  if (all.length > shown.length) {
    shown.push(tr("audit.change.more", { count: all.length - shown.length }));
  }
  return shown.join(" / ");
}

/**
 * 「誰が・何を・どうした」の 1 文（SY07 一覧の内容列・モバイルカード・
 * 詳細ページのリード用）。**履歴タブ（1 記録の中の複数行）には使わない** —
 * 同じ記録の行を並べると「田中 が 見積書 QOT-… の」を毎行繰り返すことになる
 * ため、あちらは `describeChange` の短い変更点のまま。
 *
 * 文は 1 キー = 1 文で組み立てる（`_specs/i18n-glossary.md` §2 — 訳文の断片を
 * つなげない。語順は言語ごとに違うため）。
 */
function auditSentence(
  tr: Tr,
  locale: Locale,
  row: {
    action: string;
    tableName: string;
    recordId: string | null;
    beforeData: unknown;
    afterData: unknown;
  },
  actor: string,
  target: string,
  /**
   * マスタ系の表（`audit-entity-name-core.ts` が名前を持つと登録している
   * 表）では番号（`42`）ではなく名前（`M6 ボルト`）で語る — 呼び出し元が
   * `resolveEntityNames`/`entityNameOf` で解決したもの。名前が引けない表
   * （書類系）では undefined のままで、その場合は record_id をそのまま使う。
   */
  entityName: string | undefined,
): string {
  const record = entityName ?? row.recordId ?? "";
  const note = (row.afterData as { note?: unknown } | null)?.note;
  if (typeof note === "string" && note) {
    return tr("audit.sentence.note", {
      actor,
      note: inventoryNoteLabel(tr, note) ?? note,
    });
  }
  if (row.action === "CREATE") {
    return record
      ? tr("audit.sentence.create", { actor, target, record })
      : tr("audit.sentence.createNoRecord", { actor, target });
  }
  if (row.action === "DELETE")
    return tr("audit.sentence.delete", { actor, target, record });
  if (row.action === "VIEW")
    return tr("audit.sentence.view", { actor, target, record });
  if (row.action === "EXPORT")
    return tr("audit.sentence.export", { actor, target, record });
  if (row.action === "UPDATE") {
    const diffs = auditFieldDiffs(
      row.beforeData,
      row.afterData,
      row.tableName,
      locale,
    );
    if (diffs.length === 0) {
      return tr("audit.sentence.updateNone", { actor, target, record });
    }
    const first = diffs[0];
    if (diffs.length === 1) {
      return tr("audit.sentence.updateOne", {
        actor,
        target,
        record,
        field: first.label,
        before: formatAuditValue(first.before, first.key, {
          locale,
          tableName: row.tableName,
        }),
        after: formatAuditValue(first.after, first.key, {
          locale,
          tableName: row.tableName,
        }),
      });
    }
    return tr("audit.sentence.updateMany", {
      actor,
      target,
      record,
      field: first.label,
      rest: diffs.length - 1,
    });
  }
  // SEED / MIGRATE は常に note を持つので上の分岐で処理済み。ここに来るのは
  // 未知の action だけ — 画面を壊さず「何かをした」とだけ言う。
  return tr("audit.sentence.fallback", {
    actor,
    target,
    record,
    action: actionLabel(row.action, tr),
  });
}

type AuditRow = {
  id: bigint;
  action: string;
  tableName: string;
  recordId: string | null;
  recordKey: string | null;
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
    actionRaw: row.action,
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
      fmt.locale,
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

/**
 * 1 レコードの履歴（詳細画面「履歴」タブ）。失敗時は空配列（画面を壊さない）。
 *
 * `record_key` で突き合わせるのが基本だが、以下の行を拾い漏らさないよう
 * `record_key IS NULL` の行にも `record_id` 一致でフォールバックする:
 *   - backfill が届かなかった行（サイズが大きく別ジョブへ切り出した場合 等）
 *   - migration とコードのデプロイの間に旧コードが書いた行
 * フォールバックには対象書類の `created_at` 以降という境界を付ける
 * （`resolveAuditRecordKey` の `since`）— 番号が再利用されていても、
 * 削除済みの前の世代の行を新しい書類の履歴に混ぜない。
 * キーを解決できない表（intake_folder 等）は従来どおり record_id だけで引く。
 */
export async function fetchAuditEntries(
  tableName: string,
  recordId: string,
): Promise<AuditEntry[]> {
  try {
    const [fmt, tr, resolved] = await Promise.all([
      getServerFormatters(),
      getTranslations(),
      resolveAuditRecordKey(tableName, recordId, { needSince: true }),
    ]);
    const where: Prisma.AuditLogWhereInput = resolved.key
      ? {
          tableName,
          OR: [
            { recordKey: resolved.key },
            {
              recordKey: null,
              recordId,
              ...(resolved.since ? { createdAt: { gte: resolved.since } } : {}),
            },
          ],
        }
      : { tableName, recordId };
    const rows = await prisma.auditLog.findMany({
      where,
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
  /** レコードの安定キー（表示はしない — デバッグ・突合用）。 */
  recordKey: string | null;
  /** 「誰が・何を・どうした」の 1 文（一覧の内容列・モバイルカード・詳細のリード）。 */
  summary: string;
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
    const tableLabel = auditTableLabel(row.tableName, tr);
    const names = await resolveEntityNames([
      { tableName: row.tableName, recordKey: row.recordKey },
    ]);
    return {
      ...mapAudit(fmt, tr, row),
      tableName: row.tableName,
      tableLabel,
      recordId: row.recordId,
      recordKey: row.recordKey,
      summary: auditSentence(
        tr,
        fmt.locale,
        row,
        row.user?.displayName ?? tr("common.system"),
        tableLabel,
        entityNameOf(
          names,
          row.tableName,
          row.recordKey,
          row.afterData ?? row.beforeData,
        ),
      ),
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

export interface AuditPage {
  rows: ActivityEntry[];
  total: number;
}

/**
 * `AuditQuery`（`lib/audit-filter-core.ts`）→ Prisma の `where`。
 *
 * `q`（自由文字列）は record_id の部分一致と、操作者の表示名からの絞り込み
 * を両方見る。`before_data`/`after_data` は**見ない** — GIN 索引が無い
 * jsonb を部分一致で舐めるのは高くつくうえ、そこには個人データが入る行が
 * あり、`personal_data.activity_search` の昇格が守ろうとしている範囲を
 * 自由文字列検索で広げてしまう。「このレコードを探す」という本来の用途は
 * record_id で足りる。
 */
async function buildAuditWhere(
  query: AuditQuery,
  timeZone: string,
): Promise<Prisma.AuditLogWhereInput> {
  const where: Prisma.AuditLogWhereInput = {};
  if (query.tableName) where.tableName = query.tableName;
  if (query.action) where.action = query.action;
  if (query.userId) where.userId = query.userId;

  const range: { gte?: Date; lt?: Date } = {};
  if (query.from) {
    const r = zonedDayRange(query.from, timeZone);
    if (r) range.gte = r.gte;
  }
  if (query.to) {
    const r = zonedDayRange(query.to, timeZone);
    if (r) range.lt = r.lt;
  }
  if (range.gte || range.lt) where.createdAt = range;

  if (query.q) {
    const matchingUsers = await prisma.user.findMany({
      where: { displayName: { contains: query.q, mode: "insensitive" } },
      select: { id: true },
      take: 50,
    });
    const or: Prisma.AuditLogWhereInput[] = [
      { recordId: { contains: query.q, mode: "insensitive" } },
    ];
    if (matchingUsers.length > 0) {
      or.push({ userId: { in: matchingUsers.map((u) => u.id) } });
    }
    where.OR = or;
  }

  return where;
}

/**
 * 全体の操作履歴（SY07 一覧）— 絞り込み・ページングをサーバー側で行う。
 * 失敗時は空ページ（画面を壊さない）。
 */
export async function queryAuditEntries(query: AuditQuery): Promise<AuditPage> {
  try {
    const [fmt, tr] = await Promise.all([
      getServerFormatters(),
      getTranslations(),
    ]);
    const where = await buildAuditWhere(query, fmt.prefs.timeZone);
    const [rows, total] = await prisma.$transaction([
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: query.sortDir },
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
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      prisma.auditLog.count({ where }),
    ]);
    // 表ごとに 1 クエリへ束ねる — 1 ページ (最大 100 行) ぶんの名前を
    // 行ごとに引くと、名前を持つ表が多いページで数十クエリになる。
    const names = await resolveEntityNames(
      rows.map((row) => ({
        tableName: row.tableName,
        recordKey: row.recordKey,
      })),
    );
    return {
      total,
      rows: rows.map((row) => {
        const tableLabel = auditTableLabel(row.tableName, tr);
        return {
          ...mapAudit(fmt, tr, row),
          tableName: row.tableName,
          tableLabel,
          recordId: row.recordId,
          recordKey: row.recordKey,
          summary: auditSentence(
            tr,
            fmt.locale,
            row,
            row.user?.displayName ?? tr("common.system"),
            tableLabel,
            entityNameOf(
              names,
              row.tableName,
              row.recordKey,
              row.afterData ?? row.beforeData,
            ),
          ),
        };
      }),
    };
  } catch (e) {
    console.error("queryAuditEntries failed", e);
    return { rows: [], total: 0 };
  }
}

/**
 * 絞り込みバーの「操作者」選択肢。全ユーザーの一覧（`audit_logs` の
 * `DISTINCT user_id` ではない）— こちらは小さいテーブルの全走査で済み、
 * 監査ログの経過で選択肢が増減しない。SY07 に到達できる人は既に
 * `activity-log` の READ とこの昇格を持っており、SY01 でも同じ一覧が
 * 見えるので、ここで追加の露出は生まれない。
 */
export async function listAuditActors(): Promise<
  { value: string; label: string }[]
> {
  try {
    const rows = await prisma.user.findMany({
      select: { id: true, displayName: true },
      orderBy: { displayName: "asc" },
    });
    return rows.map((u) => ({ value: u.id, label: u.displayName }));
  } catch (e) {
    console.error("listAuditActors failed", e);
    return [];
  }
}
