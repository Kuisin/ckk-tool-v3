/**
 * intake.ts — 注文請書の自動取込パイプライン。server-only.
 *
 * 入口は 2 つ:
 *  - 監視フォルダ（INTAKE_DIR）: instrumentation.ts のポーラーが定期スキャン
 *    → ingestIntakeFile + 抽出（結果を待ってファイルを processed/failed へ動かす）
 *  - 画面からの優先取込（UPLOAD）: ingestAndQueueExtraction —
 *    保存 + 採番だけ同期で行い、**抽出は待ち行列へ積んで即返す**
 *
 * **1 通の注文書 = 1 行**。採番した時点でファイル名に番号を焼き込み
 * （`ORD-YYYYMM-NNNNN-<元名>`）、再取込・孤児回収でファイルが戻ってきても
 * 採番からやり直さず、その行の抽出（metadata）だけを更新する。
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
 * （lib/bp-match）・製品（lib/product-match）を**表記ゆれを吸収して**突合
 * → DRAFT + 明細。どちらも 1 件に絞れたときだけ入れ、絞れなければ候補を
 * 画面に出して人に選ばせる。
 *
 * 突合は**学習済みの表記が最優先**（app.match_aliases / lib/match-aliases）。
 * 人が画面で結び付けた「この表記はこのマスタ」は 1 表記 = 1 マスタで貯まって
 * いるので、推測（表記ゆれの段階的突合）より先に見る。人が一度決めたものを
 * 機械が上書きしない、という順序。
 *
 * 失敗時は IMPORT のまま extract_error を記録する。メッセージは
 * lib/intake-extract-error で**分類**して「何が起きたか / 原因 / 対処 / 詳細」
 * の形にする（以前は「po-extract HTTP 502」だけで、原因も対処も分からなかった）。
 * 直る見込みのある失敗（接続不可・5xx・タイムアウト・AI が形式を外した）は
 * 自動で最大 3 回まで試し直す（INTAKE_EXTRACT_MAX_ATTEMPTS）。壊れたファイルの
 * ような直らない失敗は 1 回で諦める。人からの再抽出は回数を 1 から数え直す。
 */

import {
  mkdir,
  readdir,
  readFile,
  rename,
  stat,
  utimes,
} from "node:fs/promises";
import path from "node:path";
import { AiProviderConfigError, aiConfigHeaders } from "./ai-provider";
import { APPROVAL_TARGET } from "./approval-targets";
import { firstStepGroupId } from "./approvals";
import { getCurrentActorId, recordAudit } from "./audit";
import {
  type BpMatchable,
  type BpMatchResult,
  matchBusinessPartnerName,
} from "./bp-match";
import { prisma } from "./db";
import { formatDocNumber, formatProductNumber } from "./doc-number";
import { systematicFileName } from "./file-naming";
import { type LocalizedText, localized } from "./format";
import {
  intakeFileName,
  type NormalizedExtraction,
  normalizeExtraction,
  parseIntakeFileNumber,
} from "./intake-core";
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
import { aliasKeyFor } from "./match-alias-core";
import { aliasesByTarget, findAlias, noteAliasHit } from "./match-aliases";
import { label } from "./messages";
import { notifyApprovalGroup } from "./notifications";
import { allocateDocumentKey } from "./numbering";
import { linesReplaceBlockReason } from "./order-line-core";
import { isOwnCompany } from "./own-company";
import { PO_EXTRACT_URL } from "./po-extract";
import {
  matchProductName,
  type ProductMatchable,
  type ProductMatchCandidate,
  type ProductMatchResult,
  searchProbes,
} from "./product-match";
import { putObject } from "./storage";
import { createTaskQueue } from "./task-queue";

/**
 * この文言は監視フォルダのポーラー（instrumentation.ts）からも呼ばれ、
 * リクエスト外では next-intl の `getTranslations()` が使えない
 * （`getCurrentPreferences()` の `auth()` がリクエストスコープ前提 —
 * lib/audit.ts の `getCurrentActorId` が同じ理由で try/catch している）。
 * そのため `lib/messages.ts` の locale 明示 API を "ja" 固定で使う
 * （enum-labels.ts と同じ約束。挙動はこれまでと変わらない）。
 */
const L = (key: string, fallback: string, vars?: Record<string, unknown>) =>
  label(key, "ja", fallback, vars);

/**
 * 取込結果の通知先 — 注文請書フローの 1 段目の承認グループ。
 * フロー未設定なら黙って何もしない（取込自体は成立させる）。
 */
async function notifyIntakeGroup(
  input: Parameters<typeof notifyApprovalGroup>[1],
): Promise<void> {
  const groupId = await firstStepGroupId("order_acceptances");
  if (groupId == null) return;
  await notifyApprovalGroup(groupId, input);
}

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
  // どのモデルで読むかは SY0E の設定で決まる（既定 = ローカル ollama = ヘッダ無し）。
  let aiHeaders: Record<string, string>;
  try {
    aiHeaders = await aiConfigHeaders();
  } catch (e) {
    // プロバイダに届く前に落ちている（鍵が変わった等）。再試行しても直らない。
    if (e instanceof AiProviderConfigError) {
      throw new ExtractFailureError({
        summary: L(
          "settings.orderIntake.pipeline.aiConfigUnreadable",
          "AI プロバイダの設定を読めませんでした", // i18n-ignore
        ),
        cause: e.message,
        hint: L(
          "settings.orderIntake.pipeline.aiConfigHint",
          "システム設定 → AI プロバイダ（SY0E）でトークンを設定し直してください", // i18n-ignore
        ),
        detail: "ai provider config unavailable",
        retryable: false,
      });
    }
    throw e;
  }
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
      headers: aiHeaders,
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

/**
 * ファイルを保存し IMPORT 行を作る（抽出はまだ）。
 *
 * **ここを通るたびに新しい番号の行が増える** — 再取込・再抽出では絶対に
 * 呼ばないこと（原本は 1 通につき 1 行。metadata だけ更新する）。
 */
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
    throw new Error(
      L(
        "settings.orderIntake.pipeline.storageSaveFailed",
        "ストレージ（SeaweedFS）への保存に失敗しました", // i18n-ignore
      ),
    );
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
      label: L(
        "settings.orderIntake.pipeline.sourceAttachmentLabel",
        "取込元（原本）", // i18n-ignore
      ),
      uploadedBy: actor,
      isLocked: true,
    },
  });
  await recordAudit({
    action: "CREATE",
    tableName: "order_acceptances",
    recordId: formatDocNumber("ORD", { yearMonth, seq }),
    after: {
      note: L(
        "settings.orderIntake.pipeline.ingestedNote",
        "取込（{source}）: {filename}", // i18n-ignore
        {
          source:
            input.source === "FOLDER"
              ? L("settings.orderIntake.pipeline.sourceFolder", "監視フォルダ") // i18n-ignore
              : L("settings.orderIntake.pipeline.sourceUpload", "優先取込"), // i18n-ignore
          filename: input.filename,
        },
      ),
    },
  });
  return { yearMonth, seq, fileId: fileRow.id };
}

/**
 * 突合の対象になる取引先（有効・トップレベル）を全部読む。
 *
 * 配列列（match_names）の**部分一致は Prisma の where で書けない**し、
 * 表記ゆれの吸収は SQL より JS の方が素直に書ける。有効な取引先は数百件なので、
 * 1 通の取込につき 1 回この全件読みで十分（顧客ピッカーも同じやり方）。
 *
 * `expectedRole` は「その場面で自動確定してよいのはどのロールか」。注文請書は
 * 顧客（既定）、購買側の取込（lib/purchase-intake）は仕入先。**プールから
 * 落とすのではなく自動確定だけを止める** — 顧客ロールしか無い相手が仕入先
 * として印字されていることは実際にあるので、候補には出して人に選ばせる。
 */
export async function loadBpMatchPool(
  expectedRole: "CUSTOMER" | "VENDOR" = "CUSTOMER",
): Promise<BpMatchable[]> {
  // 学習した表記（人が結び付けた実績）も照合キーに混ぜる。取引先は数百件
  // なので、まとめて 1 回引いて突き合わせる。
  const learned = await aliasesByTarget("business_partners");
  const rows = await prisma.businessPartner.findMany({
    where: { isActive: true, parentId: null },
    select: {
      id: true,
      bpCode: true,
      name: true,
      nameKana: true,
      shortName: true,
      matchNames: true,
      matchNamesAuto: true,
      roleAssignments: {
        where: { role: expectedRole, isActive: true },
        select: { role: true },
      },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    label: localized(r.name as LocalizedText | null),
    bpCode: r.bpCode,
    nameJa: localized(r.name as LocalizedText | null),
    nameKana: r.nameKana,
    shortName: r.shortName,
    // 人が登録した別名 + 学習した表記。どちらも「この会社の書かれ方」。
    matchNames: [...r.matchNames, ...(learned.get(r.id) ?? [])],
    matchNamesAuto: r.matchNamesAuto,
    hasExpectedRole: r.roleAssignments.length > 0,
  }));
}

/**
 * 顧客突合。判定規則そのものは lib/bp-match（純ロジック・テスト付き）。
 *
 * 注文書は相手の視点で書かれているため、AI が向きを取り違えると**自社名**が
 * 顧客として来る。自社は顧客になり得ないので、突合そのものを行わない
 * （画面側は「向きが逆」の案内を出す — lib/intake-review）。
 */
export async function matchCustomer(
  name: string | null,
): Promise<BpMatchResult> {
  const empty: BpMatchResult = { matched: null, candidates: [] };
  if (!name || isOwnCompany(name)) return empty;

  // 1. 学習済み（人がこの表記をこの取引先へ結び付けた実績）— 1 表記 = 1 社
  //    なので迷う余地が無い。推測より人の判断を優先する。
  const learned = await findAlias("business_partners", name);
  if (learned) {
    const bp = await prisma.businessPartner.findFirst({
      where: { id: learned.targetId, isActive: true },
      select: { id: true, name: true },
    });
    if (bp) {
      void noteAliasHit(
        "business_partners",
        aliasKeyFor("business_partners", name),
      );
      return {
        matched: {
          id: bp.id,
          label: localized(bp.name as LocalizedText | null),
          matchedKey: learned.alias,
          confidence: "exact",
        },
        candidates: [],
      };
    }
    // マスタが消えている / 無効になった学習は無視して推測へ落とす。
  }

  // 2. 表記ゆれを吸収した段階的突合（lib/bp-match）。
  return matchBusinessPartnerName(name, await loadBpMatchPool());
}

/**
 * 1 回の probe で DB から取る候補の上限。
 * 緩い probe（先頭数文字）は大きなマスタで大量に当たるので、必ず頭を押さえる。
 */
const PRODUCT_PROBE_LIMIT = 40;
/** probe をまたいで貯める候補の総上限。 */
const PRODUCT_CANDIDATE_LIMIT = 120;

type ProductRow = {
  id: number;
  yearMonth: string | null;
  seq: number | null;
  name: unknown;
  legacyKey: string | null;
  matchNames: string[];
};

const toMatchable = (r: ProductRow): ProductMatchable => {
  const code = formatProductNumber(r.yearMonth, r.seq);
  const nameJa = localized(r.name as LocalizedText | null);
  return {
    id: String(r.id),
    label: code ? `${nameJa} ${code}` : nameJa,
    nameJa,
    code,
    legacyKey: r.legacyKey,
    keywords: r.matchNames,
  };
};

/**
 * キーワード（match_names）に probe を含む製品 id。
 *
 * 名称は 1 つしか持てないので、相手の呼び方はマスタ MS04 の「キーワード」に
 * 貯める（取引先の match_names と同じ考え方）。配列列は Prisma の where で
 * 部分一致を書けないため、`unnest + ILIKE` の生 SQL で id だけ引き、
 * 名称の probe と OR で足す。当たり方の判定はプールに入れたあと
 * lib/product-match が行う — キーワードも名称と同じ段階（完全 → 正規化 →
 * 頭から → 一部）で評価される。
 */
async function productIdsByKeyword(
  probe: string,
  limit: number,
): Promise<number[]> {
  const q = probe.trim();
  if (!q) return [];
  const like = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  const rows = await prisma.$queryRaw<{ id: number }[]>`
    SELECT id FROM app.products
    WHERE is_active
      AND EXISTS (SELECT 1 FROM unnest(match_names) AS k WHERE k ILIKE ${like})
    ORDER BY id
    LIMIT ${limit}`;
  return rows.map((r) => r.id);
}

/**
 * 製品突合。**製品マスタは大きい**（数万件を見込む）ので、取引先のように全件を
 * 読んで突合することはできない。lib/product-match の probe を**具体的な順に
 * 1 つずつ**引き、決まった時点で止める（＝広い probe は必要になるまで投げない）。
 *
 *   1. PRD コード / 旧品番 の直接照合（あれば 1 発で決まる）
 *   2. 学習済みの表記（app.match_aliases — 人が結び付けた実績）
 *   3. probe で候補を取り、段階的突合（lib/text-match）にかける
 *
 * probe は名称（name.ja）とキーワード（match_names）の両方に当てる。相手の
 * 呼び方は名称と違うのが普通で、そのためにキーワード欄がある。
 *
 * 1 件に絞れなければ**候補**を返す。画面が明細行の下に出して人が選ぶ。
 */
export async function matchProduct(
  code: string | null,
  text: string | null,
): Promise<ProductMatchResult> {
  const empty: ProductMatchResult = { matched: null, candidates: [] };
  const select = {
    id: true,
    yearMonth: true,
    seq: true,
    name: true,
    legacyKey: true,
    matchNames: true,
  } as const;

  // 1. コードで直接引く — 製品コード（PRD-YYYYMM-NNNN）と旧品番。
  //    旧品番は注文書に相手の品番として印字されることがある。
  for (const raw of [code, text]) {
    const key = raw?.trim();
    if (!key) continue;
    const m = /^PRD-?(\d{6})-?(\d{1,4})$/i.exec(key);
    const row = m
      ? await prisma.product.findFirst({
          where: { yearMonth: m[1], seq: Number(m[2]) },
          select,
        })
      : await prisma.product.findFirst({
          where: { isActive: true, legacyKey: key },
          select,
        });
    if (row) {
      const hit = toMatchable(row);
      return {
        matched: {
          id: hit.id,
          label: hit.label,
          matchedKey: m ? (hit.code ?? key) : key,
          confidence: "exact",
        },
        candidates: [],
      };
    }
  }

  if (!text?.trim()) return empty;

  // 2. 学習済み（人がこの品名をこの製品へ結び付けた実績）を先に見る。
  //    製品マスタは大きく、推測は同族に弱い — 人が一度決めたものが最も確か。
  const learned = await findAlias("products", text);
  if (learned) {
    const row = await prisma.product.findFirst({
      where: { id: Number(learned.targetId), isActive: true },
      select,
    });
    if (row) {
      void noteAliasHit("products", aliasKeyFor("products", text));
      const hit = toMatchable(row);
      return {
        matched: {
          id: hit.id,
          label: hit.label,
          matchedKey: learned.alias,
          confidence: "exact",
        },
        candidates: [],
      };
    }
    // マスタが消えている / 無効になった学習は無視して推測へ落とす。
  }

  // 3. probe を具体的な順に投げ、決まったら止める。
  const pool = new Map<string, ProductMatchable>();
  let last: ProductMatchResult = empty;
  for (const probe of searchProbes(text)) {
    const keywordIds = await productIdsByKeyword(probe, PRODUCT_PROBE_LIMIT);
    const rows = await prisma.product.findMany({
      where: {
        isActive: true,
        OR: [
          { name: { path: ["ja"], string_contains: probe } },
          ...(keywordIds.length > 0 ? [{ id: { in: keywordIds } }] : []),
        ],
      },
      orderBy: { id: "asc" },
      take: PRODUCT_PROBE_LIMIT,
      select,
    });
    for (const r of rows) {
      const m = toMatchable(r);
      if (!pool.has(m.id)) pool.set(m.id, m);
    }
    if (rows.length === 0) continue;
    last = matchProductName(text, [...pool.values()]);

    // probe が上限まで埋まった = **広すぎて切り捨てが起きている**。
    // 切り捨てられた行の中に同じくらい当たるものが居たかもしれないので、
    // 「1 件に絞れた」とは言えない。自動確定はやめ、候補として出す。
    if (rows.length >= PRODUCT_PROBE_LIMIT) {
      return last.matched
        ? { matched: null, candidates: [last.matched] }
        : last;
    }
    if (last.matched) return last;
    if (pool.size >= PRODUCT_CANDIDATE_LIMIT) break;
  }
  return last;
}

/**
 * 未突合の品名たちに対する**候補だけ**をまとめて出す（画面用）。
 *
 * matchProduct の probe 梯子は 1 品名あたり数クエリ投げる。取込は 1 書類 1 回
 * なのでそれでよいが、詳細画面は開くたびに明細の行数ぶん走ることになり、
 * 大きな製品マスタでは重い。こちらは**全行の probe をまとめて 1 クエリ**にし、
 * 得られた 1 つのプールに対して各行を突合する。
 */
export async function suggestProducts(
  texts: string[],
): Promise<Map<string, ProductMatchCandidate[]>> {
  const wanted = [...new Set(texts.map((t) => t.trim()).filter(Boolean))];
  const out = new Map<string, ProductMatchCandidate[]>();
  if (wanted.length === 0) return out;

  const probes = [...new Set(wanted.flatMap(searchProbes))];
  // キーワード側も 1 クエリでまとめて引く（生 SQL は probe ごとなので、
  // 画面 1 回ぶんの本数に収まるよう上限を全体で分け合う）。
  const keywordIds = [
    ...new Set(
      (
        await Promise.all(
          probes.map((probe) =>
            productIdsByKeyword(probe, PRODUCT_PROBE_LIMIT),
          ),
        )
      ).flat(),
    ),
  ];
  const rows = await prisma.product.findMany({
    where: {
      isActive: true,
      OR: [
        ...probes.map((probe) => ({
          name: { path: ["ja"], string_contains: probe } as const,
        })),
        ...(keywordIds.length > 0 ? [{ id: { in: keywordIds } }] : []),
      ],
    },
    orderBy: { id: "asc" },
    take: PRODUCT_CANDIDATE_LIMIT,
    select: {
      id: true,
      yearMonth: true,
      seq: true,
      name: true,
      legacyKey: true,
      matchNames: true,
    },
  });
  const pool = rows.map(toMatchable);
  for (const text of wanted) {
    const r = matchProductName(text, pool);
    // matched は「絞れた」ということなので候補は出さない（画面は突合済みの
    // 行に何も出さない）。ここで拾うのは絞れなかった分だけ。
    out.set(text, r.matched ? [] : r.candidates);
  }
  return out;
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
        summary: L(
          "settings.orderIntake.pipeline.noSourceFile",
          "取込元ファイルがありません", // i18n-ignore
        ),
        cause: L(
          "settings.orderIntake.pipeline.noSourceFileCause",
          "この注文請書には原本（PDF・画像）が紐付いていません", // i18n-ignore
        ),
        hint: L(
          "settings.orderIntake.pipeline.noSourceFileHint",
          "「手入力に切り替え」で内容を入力するか、ファイルを取り直して取込してください", // i18n-ignore
        ),
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

    // 候補止まり（略称など複数当たり）のときは顧客を入れない — 画面が候補を
    // 出し直すので、黙って 1 件に決めてしまうより人に選ばせる。
    const customerBpId =
      (await matchCustomer(norm.customerName)).matched?.id ?? null;
    const items = await Promise.all(
      norm.items.map(async (it, i) => {
        // 製品も同じ考え方 — 候補止まりなら入れず、画面で選ばせる。
        const product = await matchProduct(it.productCode, it.productText);
        return {
          productId: product.matched ? Number(product.matched.id) : null,
          productText: it.productText ?? it.productCode,
          orderType: it.orderType,
          quantity: it.quantity,
          unitPrice: it.unitPrice,
          deliveryDate: it.deliveryDate ? new Date(it.deliveryDate) : null,
          notes: it.notes,
          sortOrder: i,
        };
      }),
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
    const matchState = customerBpId
      ? L("settings.orderIntake.pipeline.matched", "一致") // i18n-ignore
      : L("settings.orderIntake.pipeline.unmatched", "未特定"); // i18n-ignore
    await recordAudit({
      action: "UPDATE",
      tableName: "order_acceptances",
      recordId: number,
      after: {
        note: L(
          "settings.orderIntake.pipeline.extractionCompletedNote",
          "自動抽出完了（明細 {count} 件・顧客{matchState}）", // i18n-ignore
          { count: items.length, matchState },
        ),
      },
    });
    // 取込結果を注文請書フローの 1 段目のグループ（受注確認の担当者）へ通知
    // — ベストエフォート
    void notifyIntakeGroup({
      type: "INTAKE",
      title: L(
        "settings.orderIntake.pipeline.intakeNotificationTitle",
        "注文請書 {number} を自動取込しました", // i18n-ignore
        { number },
      ),
      message: L(
        "settings.orderIntake.pipeline.intakeNotificationMessage",
        "明細 {count} 件・顧客{matchState} — 内容を確認してください", // i18n-ignore
        { count: items.length, matchState },
      ),
      // 取り込んだその 1 件を開く（一覧から探し直させない）
      linkPath: APPROVAL_TARGET.order_acceptances.href(number),
    }).catch((err: unknown) =>
      console.error(
        L(
          "settings.orderIntake.pipeline.notifyFailedLog",
          "[intake] 取込通知に失敗:", // i18n-ignore
        ),
        err,
      ),
    );
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
        L(
          "settings.orderIntake.pipeline.extractionFailedNote",
          "自動抽出失敗（{attempt}/{maxAttempts} 回目）: {summary}", // i18n-ignore
          { attempt, maxAttempts, summary: failure.summary },
        ) + (failure.detail ? ` — ${failure.detail}` : ""),
    },
  });
  if (notify) {
    void notifyIntakeGroup({
      type: "INTAKE",
      title: L(
        "settings.orderIntake.pipeline.intakeFailedNotificationTitle",
        "注文請書 {number} の自動抽出に失敗しました", // i18n-ignore
        { number },
      ),
      message: [failure.summary, failure.hint].join(" / ").slice(0, 200),
      // 失敗した 1 件を開く（詳細画面が extract_error を読み戻して表示する）
      linkPath: APPROVAL_TARGET.order_acceptances.href(number),
    }).catch((err: unknown) =>
      console.error(
        L(
          "settings.orderIntake.pipeline.notifyFailedLog",
          "[intake] 取込通知に失敗:", // i18n-ignore
        ),
        err,
      ),
    );
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
        L(
          "settings.orderIntake.pipeline.retryingLog",
          "[intake] 抽出を再試行 {id}（{attempt}/{maxAttempts} 回目失敗・{seconds}秒後）: {errorFirstLine}", // i18n-ignore
          {
            id,
            attempt: job.attempt,
            maxAttempts: MAX_EXTRACT_ATTEMPTS,
            seconds: Math.round(delay / 1000),
            errorFirstLine: result.error?.split("\n")[0] ?? "",
          },
        ),
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
      console.error(
        L(
          "settings.orderIntake.pipeline.jobCrashedLog",
          "[intake] 抽出ジョブが異常終了 {id}", // i18n-ignore
          { id: jobId(job.key) },
        ),
        error,
      ),
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
    console.error(
      L(
        "settings.orderIntake.pipeline.extractFailedLog",
        "[intake] 抽出に失敗 {id}", // i18n-ignore
        { id: jobId(key) },
      ),
      e,
    ),
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
 * 取込のみ（保存 + 採番）。抽出は呼び出し側が列へ積む。
 * 監視フォルダは、採番できた時点でファイル名に番号を焼き込みたいので、
 * 取込と抽出を分けて呼ぶ（scanIntakeFolder 参照）。
 */
export async function ingestIntakeFile(input: {
  filename: string;
  bytes: Buffer;
  contentType: string;
  source: "FOLDER" | "UPLOAD";
}): Promise<{ yearMonth: string; seq: number; number: string }> {
  const { yearMonth, seq } = await ingestFile(input);
  return {
    yearMonth,
    seq,
    number: formatDocNumber("ORD", { yearMonth, seq }),
  };
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
    console.warn(
      L(
        "settings.orderIntake.pipeline.requeuedLog",
        "[intake] 未抽出の {count} 件を再投入しました", // i18n-ignore
        { count: rows.length },
      ),
    );
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

/** 名前に焼き込まれた番号から「続き」を判定した結果。 */
type ScanTarget =
  | { kind: "new" } // 新規取込（採番から）
  | { kind: "resume"; key: ExtractionKey; name: string } // 既存行の抽出やり直し
  | { kind: "done"; number: string }; // 既に人が引き取り済み — 触らない

/**
 * ファイル名 `ORD-YYYYMM-NNNNN-<元名>` から、その行の続きかどうかを見る。
 *
 * **二重登録を防ぐ唯一の関門** — 失敗の再取込（SY0C）や孤児 .processing の
 * 回収でファイルは何度でも待ちへ戻ってくる。番号を見ずに取り込むと、そのたびに
 * 採番・files 行・添付が増え、同じ注文書が別番号で何通も並ぶ。
 * 行が実在するときだけ「続き」として扱い、原本は作り直さず抽出だけやり直す。
 */
async function scanTargetFor(name: string): Promise<ScanTarget> {
  const parsed = parseIntakeFileNumber(name);
  if (!parsed) return { kind: "new" };
  const key = { yearMonth: parsed.yearMonth, seq: parsed.seq };
  const row = await prisma.orderAcceptance.findUnique({
    where: { yearMonth_seq: key },
    select: { status: true, sourceFileId: true },
  });
  // 行が消えている / 原本を持たない行（手入力）→ 名前の番号は残骸。新規扱い。
  if (!row || !row.sourceFileId) return { kind: "new" };
  // IMPORT 以外は人が引き取ったあと（下書き・確定済み）。抽出は上書きしない。
  if (row.status !== "IMPORT") return { kind: "done", number: parsed.number };
  return { kind: "resume", key, name };
}

/**
 * INTAKE_DIR を 1 回スキャン: 対象拡張子のファイルを .processing に改名して
 * クレーム → 取込・抽出 → processed/（失敗は failed/）へ移動。
 * 逐次処理（GPU の抽出は 1 件ずつ）。再入は no-op。
 *
 * 採番したら**まずファイル名に番号を焼き込む**（`ORD-…-元名.processing`）。
 * 抽出の途中でコンテナが落ちても、回収されたファイルは同じ行の続きとして
 * 処理され、番号を採り直さない。
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
    // 戻して再スキャン対象にする。名前に番号が焼き込まれていれば
    // （＝採番済み）scanTargetFor が同じ行の続きとして拾うので、
    // 回収で番号が増えることはない。
    const ORPHAN_MS = 10 * 60_000;
    for (const name of entries) {
      if (!name.endsWith(".processing")) continue;
      const full = path.join(dir, name);
      const info = await stat(full).catch(() => null);
      if (!info?.isFile()) continue;
      if (Date.now() - info.mtimeMs < ORPHAN_MS) continue;
      const original = full.slice(0, -".processing".length);
      await rename(full, original).catch(() => {});
      console.warn(
        L(
          "settings.orderIntake.pipeline.orphanRecoveredLog",
          "[intake] 孤児 .processing を回収: {name}", // i18n-ignore
          { name },
        ),
      );
    }

    for (const name of entries) {
      const ext = path.extname(name).toLowerCase();
      if (!ALLOWED_EXT.has(ext)) continue;
      const full = path.join(dir, name);
      const info = await stat(full).catch(() => null);
      if (!info?.isFile()) continue;
      // 書き込み途中のファイルを避ける（最終更新から 5 秒待つ）
      if (Date.now() - info.mtimeMs < 5_000) continue;

      let claimed = `${full}.processing`;
      try {
        await rename(full, claimed); // 原子的クレーム
      } catch {
        continue; // 他プロセスが先に取った
      }
      // rename は mtime を更新しない。10 分以上待たされたファイルをクレーム
      // した直後に、隣のコンテナの孤児回収（上）が「古い .processing」と見て
      // 元の名前に戻してしまうと同じ PDF が 2 回登録される。クレーム時刻を
      // mtime に刻んで、回収の判定を「クレームからの経過」にする。
      const now = new Date();
      await utimes(claimed, now, now).catch(() => {});
      // 移動先で使う名前（採番後は ORD-… 付き）。失敗時の退避にも使う。
      let filed = name;
      try {
        const target = await scanTargetFor(name);
        if (target.kind === "done") {
          // 既に引き取られた注文請書。取り込み直すと二重になるので置くだけ。
          await rename(claimed, path.join(processedDir, name));
          console.log(
            L(
              "settings.orderIntake.pipeline.alreadyImportedSkipLog",
              "[intake] {name} → {number} (取込済み・スキップ)", // i18n-ignore
              { name, number: target.number },
            ),
          );
          continue;
        }

        let key: ExtractionKey;
        if (target.kind === "resume") {
          key = target.key;
        } else {
          const bytes = await readFile(claimed);
          const ingested = await ingestIntakeFile({
            filename: name,
            bytes,
            contentType: MIME_BY_EXT[ext] ?? "application/octet-stream",
            source: "FOLDER",
          });
          key = { yearMonth: ingested.yearMonth, seq: ingested.seq };
          // 抽出の前に番号を名前へ焼き込む — ここで落ちても続きから再開できる。
          const numbered = intakeFileName(ingested.number, name);
          const renamed = path.join(dir, `${numbered}.processing`);
          try {
            await rename(claimed, renamed);
            claimed = renamed;
            filed = numbered;
          } catch (err) {
            // 改名できなくても取込は続ける。ただし番号が名前に乗らないので、
            // この 1 件は孤児回収で新規として拾われ得る（要調査のため警告）。
            console.warn(
              L(
                "settings.orderIntake.pipeline.numberBurnFailedLog",
                "[intake] 番号の焼き込みに失敗: {name}", // i18n-ignore
                { name },
              ),
              err,
            );
          }
        }

        const result = await runExtractionSerialized(key);
        const dest = result.status === "DRAFT" ? processedDir : failedDir;
        await rename(claimed, path.join(dest, filed));
        console.log(`[intake] ${name} → ${result.number} (${result.status})`);
      } catch (e) {
        console.error(`[intake] ${name} failed`, e);
        // 番号付きの名前で退避する（再取込が同じ行の続きとして走るように）。
        await rename(claimed, path.join(failedDir, filed)).catch(() => {});
      }
    }
  } finally {
    scanning = false;
  }
}
