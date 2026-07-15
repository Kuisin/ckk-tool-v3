/**
 * intake.ts — 受注請書の自動取込パイプライン。server-only.
 *
 * 入口は 2 つ:
 *  - 監視フォルダ（INTAKE_DIR）: instrumentation.ts のポーラーが定期スキャン
 *  - 画面からの優先取込（UPLOAD）: 同じ ingestAndExtract を即時実行
 *
 * 流れ: ファイルを SeaweedFS へ保存 + files 行 → order_acceptances を
 * IMPORT で採番作成（ORDER シーケンス — 番号 ORD-YYYYMM-NNNNN）→ po-extract
 * /extract/order-request で構造化 → 正規化（intake-core）→ 顧客
 * （match_names）・製品（コード/名称）を突合 → DRAFT + 明細。
 * 失敗時は IMPORT のまま extract_error を記録（画面から再実行可）。
 */

import { randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, rename, stat } from "node:fs/promises";
import path from "node:path";
import { getCurrentActorId, recordAudit } from "./audit";
import { prisma } from "./db";
import { formatDocNumber } from "./doc-number";
import { type NormalizedExtraction, normalizeExtraction } from "./intake-core";
import { allocateDocumentKey } from "./numbering";
import { putObject } from "./storage";

const PO_EXTRACT_URL = (
  process.env.PO_EXTRACT_URL ?? "http://po-extract:8000"
).replace(/\/$/, "");

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
  const safeName = input.filename.replace(/[^\w.\-()（）　-鿿]/g, "_");
  const key = `intake/${randomUUID()}-${safeName}`;
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

/** 顧客突合: match_names 完全一致 → 名称 ja 一致。 */
async function matchCustomer(name: string | null): Promise<string | null> {
  if (!name) return null;
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
      signal: AbortSignal.timeout(180_000), // 抽出 ~48s/doc + 余裕
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
    return { ...key, number, status: "IMPORT", error: message };
  }
}

/** 取込 + 抽出の一括実行（優先取込・フォルダ双方から使う）。 */
export async function ingestAndExtract(input: {
  filename: string;
  bytes: Buffer;
  contentType: string;
  source: "FOLDER" | "UPLOAD";
}): Promise<IngestResult> {
  const { yearMonth, seq } = await ingestFile(input);
  return runExtraction({ yearMonth, seq });
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
