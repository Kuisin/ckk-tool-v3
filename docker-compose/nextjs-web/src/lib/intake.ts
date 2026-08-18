/**
 * intake.ts — 受注請書の自動取込パイプライン。server-only.
 *
 * 入口は 2 つ:
 *  - 監視フォルダ（INTAKE_DIR）: instrumentation.ts のポーラーが定期スキャン
 *    → ingestAndExtract（結果を待ってファイルを processed/failed へ動かす）
 *  - 画面からの優先取込（UPLOAD）: ingestAndQueueExtraction —
 *    保存 + 採番だけ同期で行い、**抽出は待ち行列へ積んで即返す**
 *
 * 抽出は po-extract → ollama へ行く。ollama は OLLAMA_NUM_PARALLEL（ai-stack
 * では 2）までなら同じ常駐モデルへ並行に流せるので、**空いている枠の分だけ
 * 並列**に走らせる（lib/task-queue、既定 2 / INTAKE_EXTRACT_CONCURRENCY）。
 * 両方の入口が同じ列を通るため、上限を超えて GPU を叩くことはない。
 * キューはプロセス内なので、コンテナが入れ替わると待機分は消える →
 * 起動時に requeueStuckExtractions() が IMPORT のまま残った行を拾い直す。
 *
 * 流れ: ファイルを SeaweedFS へ保存 + files 行 → order_acceptances を
 * IMPORT で採番作成（ORDER シーケンス — 番号 ORD-YYYYMM-NNNNN）→ po-extract
 * /extract/order-request で構造化 → 正規化（intake-core）→ 顧客
 * （match_names）・製品（コード/名称）を突合 → DRAFT + 明細。
 * 失敗時は IMPORT のまま extract_error を記録（画面から再実行可）。
 */

import { mkdir, readdir, readFile, rename, stat } from "node:fs/promises";
import path from "node:path";
import { getCurrentActorId, recordAudit } from "./audit";
import { prisma } from "./db";
import { formatDocNumber } from "./doc-number";
import { systematicFileName } from "./file-naming";
import { type NormalizedExtraction, normalizeExtraction } from "./intake-core";
import { notifyGroup } from "./notifications";
import { allocateDocumentKey } from "./numbering";
import { isOwnCompany } from "./own-company";
import { putObject } from "./storage";
import { createTaskQueue } from "./task-queue";

const PO_EXTRACT_URL = (
  process.env.PO_EXTRACT_URL ?? "http://po-extract:8000"
).replace(/\/$/, "");

/**
 * po-extract を待つ上限（既定 15 分 / PO_EXTRACT_TIMEOUT_MS で変更可）。
 *
 * po-extract 側は 1 回のモデル呼び出しに 600 秒を許しており（ai-stack
 * extractor/app.py の httpx timeout）、しかも 3 段（OCR → Vision → LLM）を
 * 順に叩く。以前ここは 180 秒で、**サーバーがまだ処理中なのにこちらが
 * 打ち切って**「The operation was aborted due to timeout」で失敗していた。
 * 抽出はバックグラウンドの列で動く（利用者を待たせない）ので、上限は
 * サーバー側の実力に合わせて長く取る。
 */
const EXTRACT_TIMEOUT_MS = Number(
  process.env.PO_EXTRACT_TIMEOUT_MS ?? 15 * 60_000,
);

/**
 * 同時に走らせる抽出の数（既定 2 / INTAKE_EXTRACT_CONCURRENCY で変更可）。
 *
 * ai-stack の ollama は `OLLAMA_NUM_PARALLEL=2` — 同じ常駐モデルへの並行
 * リクエストを 2 本まで捌ける。ここを ollama 側より大きくすると、超過分は
 * ollama のキューで待つだけで速くならず、1 件あたりの待ち時間だけ伸びる。
 * ollama 側を増やすときは**両方**揃えること。
 */
const EXTRACT_CONCURRENCY = Math.max(
  1,
  Number(process.env.INTAKE_EXTRACT_CONCURRENCY ?? 2),
);

const ALLOWED_EXT = new Set([".pdf", ".png", ".jpg", ".jpeg", ".webp"]);

export interface IngestResult {
  yearMonth: string;
  seq: number;
  number: string; // ORD-YYYYMM-NNNNN
  status: "DRAFT" | "IMPORT"; // IMPORT = 抽出失敗（extract_error 参照）
  error?: string;
}

/** ファイルを保存し IMPORT 行を作る（抽出はまだ）。 */
async function ingestFile(input: {
  filename: string;
  bytes: Buffer;
  contentType: string;
  source: "FOLDER" | "UPLOAD";
}): Promise<{ yearMonth: string; seq: number; fileId: string }> {
  const actor = await getCurrentActorId();
  // 系統的リネーム（lib/file-naming）: 時刻+乱数で一意、元名で判別可能。
  const key = `intake/${systematicFileName(input.filename)}`;
  const stored = await putObject(key, input.bytes, input.contentType);
  if (!stored) {
    throw new Error("ストレージ（SeaweedFS）への保存に失敗しました");
  }

  const { yearMonth, seq } = await allocateDocumentKey("ORDER");
  const fileRow = await prisma.file.create({
    data: {
      storageKey: key,
      filename: input.filename,
      mimeType: input.contentType,
      sizeBytes: BigInt(input.bytes.byteLength),
      uploadedBy: actor,
    },
    select: { id: true },
  });
  await prisma.orderAcceptance.create({
    data: {
      yearMonth,
      seq,
      status: "IMPORT",
      source: input.source,
      sourceFileId: fileRow.id,
      createdBy: actor,
    },
  });
  await recordAudit({
    action: "CREATE",
    tableName: "order_acceptances",
    recordId: formatDocNumber("ORD", { yearMonth, seq }),
    after: {
      note: `取込（${input.source === "FOLDER" ? "監視フォルダ" : "優先取込"}）: ${input.filename}`,
    },
  });
  return { yearMonth, seq, fileId: fileRow.id };
}

/**
 * 顧客突合: match_names 完全一致 → 名称 ja 一致。
 *
 * 注文書は相手の視点で書かれているため、AI が向きを取り違えると**自社名**が
 * 顧客として来る。自社は顧客になり得ないので、突合そのものを行わない
 * （画面側は「向きが逆」の案内を出す — lib/intake-review）。
 */
async function matchCustomer(name: string | null): Promise<string | null> {
  if (!name) return null;
  if (isOwnCompany(name)) return null;
  const byMatch = await prisma.businessPartner.findFirst({
    where: { isActive: true, matchNames: { has: name } },
    select: { id: true },
  });
  if (byMatch) return byMatch.id;
  const byName = await prisma.businessPartner.findFirst({
    where: { isActive: true, name: { path: ["ja"], equals: name } },
    select: { id: true },
  });
  return byName?.id ?? null;
}

/** 製品突合: PRD コード一致 → 名称 ja 完全一致。 */
async function matchProduct(
  code: string | null,
  text: string | null,
): Promise<number | null> {
  if (code) {
    const m = /^PRD-?(\d{6})-?(\d{1,4})$/i.exec(code.trim());
    if (m) {
      const p = await prisma.product.findFirst({
        where: { yearMonth: m[1], seq: Number(m[2]) },
        select: { id: true },
      });
      if (p) return p.id;
    }
  }
  if (text) {
    const p = await prisma.product.findFirst({
      where: { isActive: true, name: { path: ["ja"], equals: text } },
      select: { id: true },
    });
    if (p) return p.id;
  }
  return null;
}

/** 抽出 → 正規化 → 突合 → DRAFT 反映。IMPORT 行に対して再実行可能。 */
export async function runExtraction(key: {
  yearMonth: string;
  seq: number;
}): Promise<IngestResult> {
  const number = `ORD-${key.yearMonth}-${String(key.seq).padStart(5, "0")}`;
  const row = await prisma.orderAcceptance.findUniqueOrThrow({
    where: { yearMonth_seq: key },
    include: { sourceFile: true },
  });
  if (!row.sourceFile) {
    return {
      ...key,
      number,
      status: "IMPORT",
      error: "取込元ファイルがありません",
    };
  }

  try {
    const { getObject } = await import("./storage");
    const bytes = await getObject(row.sourceFile.storageKey);
    if (!bytes) throw new Error("取込元ファイルを読み出せません");

    const form = new FormData();
    form.append(
      "file",
      new Blob([bytes], { type: row.sourceFile.mimeType }),
      row.sourceFile.filename,
    );
    const res = await fetch(`${PO_EXTRACT_URL}/extract/order-request`, {
      method: "POST",
      body: form,
      signal: AbortSignal.timeout(EXTRACT_TIMEOUT_MS),
    }).catch((e) => {
      // タイムアウトは原因が分かる文言にする（画面にそのまま出るため）。
      if (e instanceof Error && e.name === "TimeoutError") {
        throw new Error(
          `抽出がタイムアウトしました（${Math.round(EXTRACT_TIMEOUT_MS / 60_000)}分）。` +
            "ファイルが大きすぎるか、抽出サーバー（po-extract）が応答していません",
        );
      }
      throw e;
    });
    if (!res.ok) throw new Error(`po-extract HTTP ${res.status}`);
    const raw = (await res.json()) as unknown;
    const norm: NormalizedExtraction = normalizeExtraction(
      (raw as { data?: unknown })?.data ?? raw,
    );

    const customerBpId = await matchCustomer(norm.customerName);
    const items = await Promise.all(
      norm.items.map(async (it, i) => ({
        productId: await matchProduct(it.productCode, it.productText),
        productText: it.productText ?? it.productCode,
        orderType: it.orderType,
        quantity: it.quantity,
        unitPrice: it.unitPrice,
        deliveryDate: it.deliveryDate ? new Date(it.deliveryDate) : null,
        notes: it.notes,
        sortOrder: i,
      })),
    );

    await prisma.$transaction(async (tx) => {
      await tx.orderAcceptanceItem.deleteMany({
        where: { acceptanceYearMonth: key.yearMonth, acceptanceSeq: key.seq },
      });
      await tx.orderAcceptance.update({
        where: { yearMonth_seq: key },
        data: {
          status: "DRAFT",
          extracted: raw as object,
          extractError: null,
          customerBpId,
          customerOrderRef: norm.customerOrderRef,
          orderDate: norm.orderDate ? new Date(norm.orderDate) : null,
          notes: norm.notes,
          items: { create: items },
        },
      });
    });
    await recordAudit({
      action: "UPDATE",
      tableName: "order_acceptances",
      recordId: number,
      after: {
        note: `自動抽出完了（明細 ${items.length} 件・顧客${customerBpId ? "一致" : "未特定"}）`,
      },
    });
    // 取込結果を第一承認グループ（受注確認の担当者）へ通知 — ベストエフォート
    void notifyGroup("FIRST", {
      type: "INTAKE",
      title: `受注請書 ${number} を自動取込しました`,
      message: `明細 ${items.length} 件・顧客${customerBpId ? "一致" : "未特定"} — 内容を確認してください`,
      linkPath: "/sales/order-acceptances",
    }).catch((err) => console.error("[intake] 取込通知に失敗:", err));
    return { ...key, number, status: "DRAFT" };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await prisma.orderAcceptance.update({
      where: { yearMonth_seq: key },
      data: { extractError: message },
    });
    await recordAudit({
      action: "UPDATE",
      tableName: "order_acceptances",
      recordId: number,
      after: { note: `自動抽出失敗: ${message}` },
    });
    void notifyGroup("FIRST", {
      type: "INTAKE",
      title: `受注請書 ${number} の自動抽出に失敗しました`,
      message: message.slice(0, 200),
      linkPath: "/sales/order-acceptances",
    }).catch((err) => console.error("[intake] 取込通知に失敗:", err));
    return { ...key, number, status: "IMPORT", error: message };
  }
}

// ─── 抽出キュー（1 件ずつ） ──────────────────────────────────────────────────
//
// po-extract は GPU にモデルを常駐させて動くため **同時実行できない**。
// 画面からのアップロードは保存 + 採番だけで即返し、重い抽出はこの列に積む
// （フォルダ取込も同じ列を通るので、両方が同時に走ることはない）。
// プロセス内キューなので、コンテナが落ちると待機分は消える —
// 起動時に requeueStuckExtractions() が IMPORT のまま残った行を拾い直す。

interface ExtractionKey {
  yearMonth: string;
  seq: number;
}

/**
 * キーとコールバックは**混ぜない** — ジョブをそのまま Prisma の
 * `where: { yearMonth_seq: … }` に渡すと settle/fail が紛れ込んで
 * 「could not serialize [object Function]」で落ちる（実際にやらかした）。
 */
interface ExtractionJob {
  key: ExtractionKey;
  settle: (result: IngestResult) => void;
  fail: (error: unknown) => void;
}

const jobId = (key: ExtractionKey) => `${key.yearMonth}-${key.seq}`;

/** 待機中・実行中の抽出（同じ書類を二重に走らせないための相乗り表）。 */
const inFlight = new Map<string, Promise<IngestResult>>();

const extractionQueue = createTaskQueue<ExtractionJob>(
  async (job) => {
    try {
      job.settle(await runExtraction(job.key));
    } catch (error) {
      job.fail(error);
    } finally {
      inFlight.delete(jobId(job.key));
    }
  },
  {
    concurrency: EXTRACT_CONCURRENCY,
    onError: (error, job) =>
      console.error(`[intake] 抽出ジョブが異常終了 ${jobId(job.key)}`, error),
  },
);

/**
 * 抽出を列に積み、その 1 件の結果を待つ Promise を返す。
 * 同じ書類が既に列にいる場合は**その結果に相乗り**する（二重抽出しない）。
 */
function scheduleExtraction(key: ExtractionKey): Promise<IngestResult> {
  const id = jobId(key);
  const existing = inFlight.get(id);
  if (existing) return existing;
  let settle!: (result: IngestResult) => void;
  let fail!: (error: unknown) => void;
  const promise = new Promise<IngestResult>((resolve, reject) => {
    settle = resolve;
    fail = reject;
  });
  inFlight.set(id, promise);
  extractionQueue.push({
    key: { yearMonth: key.yearMonth, seq: key.seq },
    settle,
    fail,
  });
  return promise;
}

/** 抽出を待ち行列に積む（即戻る）。待機件数を返す。 */
export function enqueueExtraction(key: ExtractionKey): number {
  void scheduleExtraction(key).catch((e) =>
    console.error(`[intake] 抽出に失敗 ${jobId(key)}`, e),
  );
  return extractionQueue.size();
}

/** 抽出待ち + 実行中の状況（画面の案内文用）。 */
export function extractionQueueStatus(): {
  pending: number;
  active: number;
  concurrency: number;
} {
  return {
    pending: extractionQueue.size(),
    active: extractionQueue.activeCount(),
    concurrency: EXTRACT_CONCURRENCY,
  };
}

/**
 * 取込 + 抽出の一括実行（監視フォルダ用 — 抽出の完了まで待つ）。
 * フォルダ側は結果を見てファイルを processed/failed へ動かすため同期が必要。
 * 抽出自体はアップロードと同じ列を通るので、同時実行にはならない。
 */
export async function ingestAndExtract(input: {
  filename: string;
  bytes: Buffer;
  contentType: string;
  source: "FOLDER" | "UPLOAD";
}): Promise<IngestResult> {
  const { yearMonth, seq } = await ingestFile(input);
  return runExtractionSerialized({ yearMonth, seq });
}

/**
 * 取込のみ即時実行し、抽出は待ち行列へ（画面の優先取込用）。
 * 応答は数百 ms — 利用者は続けて次のファイルを投げられる。
 */
export async function ingestAndQueueExtraction(input: {
  filename: string;
  bytes: Buffer;
  contentType: string;
  source: "FOLDER" | "UPLOAD";
}): Promise<{
  yearMonth: string;
  seq: number;
  number: string;
  pending: number;
}> {
  const { yearMonth, seq } = await ingestFile(input);
  const pending = enqueueExtraction({ yearMonth, seq });
  return {
    yearMonth,
    seq,
    number: `ORD-${yearMonth}-${String(seq).padStart(5, "0")}`,
    pending,
  };
}

/** 列を通して抽出し、その 1 件の結果を待つ（フォルダ取込・画面の再実行から使う）。 */
export function runExtractionSerialized(
  key: ExtractionKey,
): Promise<IngestResult> {
  return scheduleExtraction(key);
}

/**
 * 起動時の拾い直し — IMPORT のままエラーも無い行（＝抽出前にプロセスが落ちた）を
 * 列へ積み直す。監視フォルダの孤児 .processing 回収と同じ考え方。
 * ローリングデプロイで一瞬 2 コンテナが並ぶため、**十分に古い行だけ**を対象に
 * する（新コンテナが、旧コンテナで抽出中の行を横取りしないように）。
 */
export async function requeueStuckExtractions(): Promise<number> {
  const STUCK_MS = 10 * 60_000;
  const rows = await prisma.orderAcceptance.findMany({
    where: {
      status: "IMPORT",
      extractError: null,
      sourceFileId: { not: null },
      createdAt: { lt: new Date(Date.now() - STUCK_MS) },
    },
    select: { yearMonth: true, seq: true },
    orderBy: [{ yearMonth: "asc" }, { seq: "asc" }],
    take: 20,
  });
  for (const row of rows) {
    enqueueExtraction({ yearMonth: row.yearMonth, seq: row.seq });
  }
  if (rows.length > 0) {
    console.warn(`[intake] 未抽出の ${rows.length} 件を再投入しました`);
  }
  return rows.length;
}

// ─── 監視フォルダ ────────────────────────────────────────────────────────────

const MIME_BY_EXT: Record<string, string> = {
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
};

let scanning = false;

/**
 * INTAKE_DIR を 1 回スキャン: 対象拡張子のファイルを .processing に改名して
 * クレーム → 取込・抽出 → processed/（失敗は failed/）へ移動。
 * 逐次処理（GPU の抽出は 1 件ずつ）。再入は no-op。
 */
export async function scanIntakeFolder(): Promise<void> {
  const dir = process.env.INTAKE_DIR;
  if (!dir || scanning) return;
  scanning = true;
  try {
    const processedDir = path.join(dir, "processed");
    const failedDir = path.join(dir, "failed");
    await mkdir(processedDir, { recursive: true });
    await mkdir(failedDir, { recursive: true });

    const entries = await readdir(dir);

    // 孤児 .processing の回収（監査 P1-7: 抽出中にコンテナが差し替わると
    // クレームされたまま永久に放置される）。10 分より古いものは元の名前に
    // 戻して再スキャン対象にする（取込自体は冪等 — 番号は再採番になる）。
    const ORPHAN_MS = 10 * 60_000;
    for (const name of entries) {
      if (!name.endsWith(".processing")) continue;
      const full = path.join(dir, name);
      const info = await stat(full).catch(() => null);
      if (!info?.isFile()) continue;
      if (Date.now() - info.mtimeMs < ORPHAN_MS) continue;
      const original = full.slice(0, -".processing".length);
      await rename(full, original).catch(() => {});
      console.warn(`[intake] 孤児 .processing を回収: ${name}`);
    }

    for (const name of entries) {
      const ext = path.extname(name).toLowerCase();
      if (!ALLOWED_EXT.has(ext)) continue;
      const full = path.join(dir, name);
      const info = await stat(full).catch(() => null);
      if (!info?.isFile()) continue;
      // 書き込み途中のファイルを避ける（最終更新から 5 秒待つ）
      if (Date.now() - info.mtimeMs < 5_000) continue;

      const claimed = `${full}.processing`;
      try {
        await rename(full, claimed); // 原子的クレーム
      } catch {
        continue; // 他プロセスが先に取った
      }
      try {
        const bytes = await readFile(claimed);
        const result = await ingestAndExtract({
          filename: name,
          bytes,
          contentType: MIME_BY_EXT[ext] ?? "application/octet-stream",
          source: "FOLDER",
        });
        const dest = result.status === "DRAFT" ? processedDir : failedDir;
        await rename(claimed, path.join(dest, `${result.number}-${name}`));
        console.log(`[intake] ${name} → ${result.number} (${result.status})`);
      } catch (e) {
        console.error(`[intake] ${name} failed`, e);
        await rename(claimed, path.join(failedDir, name)).catch(() => {});
      }
    }
  } finally {
    scanning = false;
  }
}
