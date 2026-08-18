/**
 * intake.ts — 注文請書の自動取込パイプライン。server-only.
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
 *
 * 失敗時は IMPORT のまま extract_error を記録する。メッセージは
 * lib/intake-extract-error で**分類**して「何が起きたか / 原因 / 対処 / 詳細」
 * の形にする（以前は「po-extract HTTP 502」だけで、原因も対処も分からなかった）。
 * 直る見込みのある失敗（接続不可・5xx・タイムアウト・AI が形式を外した）は
 * 自動で最大 3 回まで試し直す（INTAKE_EXTRACT_MAX_ATTEMPTS）。壊れたファイルの
 * ような直らない失敗は 1 回で諦める。人からの再抽出は回数を 1 から数え直す。
 */

import { mkdir, readdir, readFile, rename, stat } from "node:fs/promises";
import path from "node:path";
import { getCurrentActorId, recordAudit } from "./audit";
import { prisma } from "./db";
import { formatDocNumber } from "./doc-number";
import { systematicFileName } from "./file-naming";
import { type NormalizedExtraction, normalizeExtraction } from "./intake-core";
import {
  classifyHttpFailure,
  classifyLocalFailure,
  classifyNetworkFailure,
  classifyTimeoutFailure,
  type ExtractFailure,
  formatExtractError,
  RETRY_PENDING_MARKER,
  retryPlan,
} from "./intake-extract-error";
import { notifyGroup } from "./notifications";
import { allocateDocumentKey } from "./numbering";
import { linesReplaceBlockReason } from "./order-line-core";
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

/**
 * 1 書類あたりの抽出試行回数（既定 3 / INTAKE_EXTRACT_MAX_ATTEMPTS）。
 *
 * 失敗の多くは一時的なもの（po-extract の再起動中・ollama の混雑・AI が形式を
 * 外す）で、同じ原稿でももう一度流せば通る。人が「再抽出」を押すまで止まって
 * いるのは無駄なので、**直る見込みのある失敗だけ**自動で試し直す
 * （原稿が壊れている・様式が無い といった直らない失敗は 1 回で諦める —
 * lib/intake-extract-error の retryable が唯一の判定元）。
 */
const MAX_EXTRACT_ATTEMPTS = Math.max(
  1,
  Number(process.env.INTAKE_EXTRACT_MAX_ATTEMPTS ?? 3),
);

/**
 * 再試行までの待ち（既定 20 秒 / INTAKE_EXTRACT_RETRY_DELAY_MS）。
 * 回を追うごとに伸ばす（20s → 40s）— サーバー再起動中なら少し待つ方が通る。
 * 待っている間は列の枠を空ける（他の書類を止めない）。
 */
const EXTRACT_RETRY_DELAY_MS = Math.max(
  0,
  Number(process.env.INTAKE_EXTRACT_RETRY_DELAY_MS ?? 20_000),
);

const ALLOWED_EXT = new Set([".pdf", ".png", ".jpg", ".jpeg", ".webp"]);

export interface IngestResult {
  yearMonth: string;
  seq: number;
  number: string; // ORD-YYYYMM-NNNNN
  status: "DRAFT" | "IMPORT"; // IMPORT = 抽出失敗（extract_error 参照）
  /** 失敗時の保存済みメッセージ（分類済み・複数行）。 */
  error?: string;
  /** 失敗がもう一度試して直る見込みか（自動再試行の判断に使う）。 */
  retryable?: boolean;
}

/** 分類済みの抽出失敗。message は画面・通知にそのまま出す。 */
class ExtractFailureError extends Error {
  constructor(readonly failure: ExtractFailure) {
    super(failure.summary);
    this.name = "ExtractFailureError";
  }
}

const asFailure = (error: unknown): ExtractFailure =>
  error instanceof ExtractFailureError
    ? error.failure
    : classifyLocalFailure(error, "unknown");

/**
 * po-extract を 1 回叩いて生 JSON を返す。失敗は必ず ExtractFailureError
 * （分類済み）にして投げる — 呼び出し側は message を出すだけでよい。
 */
async function callPoExtract(file: {
  bytes: ArrayBuffer; // getObject（SeaweedFS）の戻り値そのまま
  filename: string;
  mimeType: string;
}): Promise<unknown> {
  const endpoint = `${PO_EXTRACT_URL}/extract/order-request`;
  const form = new FormData();
  form.append(
    "file",
    new Blob([file.bytes], { type: file.mimeType }),
    file.filename,
  );

  let res: Response;
  try {
    res = await fetch(endpoint, {
      method: "POST",
      body: form,
      signal: AbortSignal.timeout(EXTRACT_TIMEOUT_MS),
    });
  } catch (e) {
    // タイムアウト（こちら側の打ち切り）と接続不可は原因も対処も違う。
    if (e instanceof Error && e.name === "TimeoutError") {
      throw new ExtractFailureError(classifyTimeoutFailure(EXTRACT_TIMEOUT_MS));
    }
    throw new ExtractFailureError(classifyNetworkFailure(e, endpoint));
  }

  if (!res.ok) {
    // 本文（FastAPI の detail）まで読む — 「HTTP 502」だけでは、モデルが
    // 形式を外したのか、サーバーが落ちているのかが区別できない。
    const body = await res.text().catch(() => null);
    throw new ExtractFailureError(classifyHttpFailure(res.status, body));
  }

  try {
    return (await res.json()) as unknown;
  } catch (e) {
    throw new ExtractFailureError(classifyLocalFailure(e, "response"));
  }
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
  // 原本を添付としても残す（ロック付き — 削除・差し替え不可）。
  // 抽出をやり直すときも、内容を確かめるときも、根拠はこの 1 枚しかない。
  await prisma.documentAttachment.create({
    data: {
      ownerType: "order_acceptances",
      ownerId: formatDocNumber("ORD", { yearMonth, seq }),
      fileId: fileRow.id,
      label: "取込元（原本）",
      uploadedBy: actor,
      isLocked: true,
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
  // 人が入れた照合名（match_names）と、フリガナから自動生成した分
  // （match_names_auto — 画面には出さない）の両方を見る。
  const byMatch = await prisma.businessPartner.findFirst({
    where: {
      isActive: true,
      OR: [{ matchNames: { has: name } }, { matchNamesAuto: { has: name } }],
    },
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

/**
 * 抽出 → 正規化 → 突合 → DRAFT 反映。IMPORT 行に対して再実行可能。
 *
 * `attempt` / `maxAttempts` は**表示と再試行判断のためだけ**に使う
 * （何回目で失敗したか、まだ試すのかを extract_error に残す）。
 * 再試行そのものは列側（scheduleExtraction のワーカー）が行う。
 */
export async function runExtraction(
  key: {
    yearMonth: string;
    seq: number;
  },
  opts: { attempt?: number; maxAttempts?: number } = {},
): Promise<IngestResult> {
  const attempt = opts.attempt ?? 1;
  const maxAttempts = opts.maxAttempts ?? 1;
  const number = `ORD-${key.yearMonth}-${String(key.seq).padStart(5, "0")}`;
  const row = await prisma.orderAcceptance.findUniqueOrThrow({
    where: { yearMonth_seq: key },
    include: { sourceFile: true },
  });
  if (!row.sourceFile) {
    return recordExtractFailure(key, number, {
      failure: {
        summary: "取込元ファイルがありません",
        cause: "この注文請書には原本（PDF・画像）が紐付いていません",
        hint: "「手入力に切り替え」で内容を入力するか、ファイルを取り直して取込してください",
        retryable: false,
      },
      attempt,
      maxAttempts,
      notify: true,
    });
  }

  try {
    const { getObject } = await import("./storage");
    const bytes = await getObject(row.sourceFile.storageKey).catch((e) => {
      throw new ExtractFailureError(classifyLocalFailure(e, "storage"));
    });
    if (!bytes) {
      throw new ExtractFailureError(
        classifyLocalFailure(
          new Error(`storage key ${row.sourceFile?.storageKey} not found`),
          "storage",
        ),
      );
    }

    const raw = await callPoExtract({
      bytes,
      filename: row.sourceFile.filename,
      mimeType: row.sourceFile.mimeType,
    });
    let norm: NormalizedExtraction;
    try {
      norm = normalizeExtraction((raw as { data?: unknown })?.data ?? raw);
    } catch (e) {
      throw new ExtractFailureError(classifyLocalFailure(e, "normalize"));
    }

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

    // 抽出中に人が「手入力に切り替え」を押していたら、その入力を上書きしない
    // （裏で走る処理が、目の前の編集を消してしまうのが一番まずい）。
    const current = await prisma.orderAcceptance.findUnique({
      where: { yearMonth_seq: key },
      select: { status: true },
    });
    if (current?.status !== "IMPORT") {
      return { ...key, number, status: "DRAFT" };
    }

    await prisma.$transaction(async (tx) => {
      // ラインチェック（多重防御）: 抽出はバックグラウンドで走り UI と競合する。
      // 確定済みの明細が 1 行でもあれば作り直さない。
      const existing = await tx.orderLine.findMany({
        where: { acceptanceYearMonth: key.yearMonth, acceptanceSeq: key.seq },
        select: { status: true, branch: true, isLocked: true },
      });
      if (linesReplaceBlockReason("IMPORT", existing)) return;
      await tx.orderLine.deleteMany({
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
      title: `注文請書 ${number} を自動取込しました`,
      message: `明細 ${items.length} 件・顧客${customerBpId ? "一致" : "未特定"} — 内容を確認してください`,
      linkPath: "/sales/order-acceptances",
    }).catch((err) => console.error("[intake] 取込通知に失敗:", err));
    return { ...key, number, status: "DRAFT" };
  } catch (e) {
    const failure = asFailure(e);
    const { willRetry } = retryPlan({
      failure,
      attempt,
      maxAttempts,
      baseDelayMs: EXTRACT_RETRY_DELAY_MS,
    });
    return recordExtractFailure(key, number, {
      failure,
      attempt,
      maxAttempts,
      // 通知は諦めたときだけ（再試行のたびに鳴らすと通知が意味を失う）。
      notify: !willRetry,
    });
  }
}

/**
 * 失敗を 1 か所で記録する（extract_error + 監査 + 通知）。
 * 保存文字列は「何が起きたか / 原因 / 対処 / 詳細 / 自動再試行」の決まった形
 * （lib/intake-extract-error）— 画面はこれを読み戻して表示する。
 */
async function recordExtractFailure(
  key: ExtractionKey,
  number: string,
  input: {
    failure: ExtractFailure;
    attempt: number;
    maxAttempts: number;
    notify: boolean;
  },
): Promise<IngestResult> {
  const { failure, attempt, maxAttempts, notify } = input;
  // 失敗している間に人が「手入力に切り替え」を押していたら、裏の失敗で
  // 赤い印を付けない（成功時と同じ — 目の前の入力より裏の処理を優先しない）。
  const current = await prisma.orderAcceptance.findUnique({
    where: { yearMonth_seq: key },
    select: { status: true },
  });
  if (current && current.status !== "IMPORT") {
    return { ...key, number, status: "DRAFT" };
  }

  const { willRetry } = retryPlan({
    failure,
    attempt,
    maxAttempts,
    baseDelayMs: EXTRACT_RETRY_DELAY_MS,
  });
  const message = formatExtractError(failure, {
    attempt,
    maxAttempts,
    willRetry,
  });
  await prisma.orderAcceptance.update({
    where: { yearMonth_seq: key },
    data: { extractError: message },
  });
  await recordAudit({
    action: "UPDATE",
    tableName: "order_acceptances",
    recordId: number,
    after: {
      note:
        `自動抽出失敗（${attempt}/${maxAttempts} 回目）: ${failure.summary}` +
        (failure.detail ? ` — ${failure.detail}` : ""),
    },
  });
  if (notify) {
    void notifyGroup("FIRST", {
      type: "INTAKE",
      title: `注文請書 ${number} の自動抽出に失敗しました`,
      message: [failure.summary, failure.hint].join(" / ").slice(0, 200),
      linkPath: "/sales/order-acceptances",
    }).catch((err) => console.error("[intake] 取込通知に失敗:", err));
  }
  return {
    ...key,
    number,
    status: "IMPORT",
    error: message,
    retryable: willRetry,
  };
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
  /** 何回目の試行か（1 始まり）。自動再試行のたびに増える。 */
  attempt: number;
  settle: (result: IngestResult) => void;
  fail: (error: unknown) => void;
}

const jobId = (key: ExtractionKey) => `${key.yearMonth}-${key.seq}`;

/** 待機中・実行中の抽出（同じ書類を二重に走らせないための相乗り表）。 */
const inFlight = new Map<string, Promise<IngestResult>>();

const extractionQueue = createTaskQueue<ExtractionJob>(
  async (job) => {
    const id = jobId(job.key);
    let result: IngestResult;
    try {
      result = await runExtraction(job.key, {
        attempt: job.attempt,
        maxAttempts: MAX_EXTRACT_ATTEMPTS,
      });
    } catch (error) {
      // runExtraction 自身の想定外（DB 障害など）— 相乗り待ちを解いて終わる。
      inFlight.delete(id);
      job.fail(error);
      return;
    }
    // 直る見込みのある失敗は、少し待ってから同じ列へ積み直す
    //（result.retryable は「まだ回数が残っている」まで含んだ判断 — retryPlan）。
    // ここで settle しない = フォルダ取込の待ちも最終結果まで続く
    //（結果でファイルを processed/failed へ振り分けるため）。
    if (result.retryable) {
      const delay = EXTRACT_RETRY_DELAY_MS * job.attempt;
      console.warn(
        `[intake] 抽出を再試行 ${id}（${job.attempt}/${MAX_EXTRACT_ATTEMPTS} 回目失敗・${Math.round(delay / 1000)}秒後）: ${result.error?.split("\n")[0]}`,
      );
      const timer = setTimeout(() => {
        extractionQueue.push({ ...job, attempt: job.attempt + 1 });
      }, delay);
      // 待ちの間にプロセスが終わるのを妨げない（起動時の拾い直しがある）。
      timer.unref?.();
      return;
    }
    inFlight.delete(id);
    job.settle(result);
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
    attempt: 1,
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
 * 起動時の拾い直し — 抽出が途中で消えた行を列へ積み直す。対象は 2 つ:
 *  - IMPORT のままエラーも無い行（＝抽出前にプロセスが落ちた）
 *  - 「もう一度試します」で終わっている行（＝自動再試行の待機中に落ちた）
 * 監視フォルダの孤児 .processing 回収と同じ考え方。ローリングデプロイで一瞬
 * 2 コンテナが並ぶため、**十分に古い行だけ**を対象にする（新コンテナが、
 * 旧コンテナで抽出中の行を横取りしないように）。
 */
export async function requeueStuckExtractions(): Promise<number> {
  const STUCK_MS = 10 * 60_000;
  const staleBefore = new Date(Date.now() - STUCK_MS);
  const rows = await prisma.orderAcceptance.findMany({
    where: {
      status: "IMPORT",
      sourceFileId: { not: null },
      OR: [
        { extractError: null, createdAt: { lt: staleBefore } },
        {
          extractError: { contains: RETRY_PENDING_MARKER },
          updatedAt: { lt: staleBefore },
        },
      ],
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
