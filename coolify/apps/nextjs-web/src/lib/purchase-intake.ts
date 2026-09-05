import "server-only";

/**
 * purchase-intake.ts — 購買側の書類取込（仕入先の見積書・素材の納品書）。server-only.
 *
 * 販売側の注文請書取込（lib/intake.ts）の購買版。違いは 2 つだけ:
 *
 *   1. **相手は顧客ではなく仕入先**（VENDOR ロール）。プールを作るときに
 *      期待ロールを渡す（lib/intake の `loadBpMatchPool("VENDOR")`）。
 *   2. **引き当てるのは製品ではなく素材**（lib/material-match）。素材マスタは
 *      製品ほど大きくないので probe の梯子を作らず、有効な素材を全件読んで
 *      JS で突合する。
 *
 * 販売側と違って**行を先に作らない**。注文請書は原本 1 通 = 1 行（IMPORT）を
 * 採番してから抽出するが、こちらは「画面で押して読ませ、結果でフォームを
 * 埋める」だけなので、保存されるまで DB には何も残らない。だから採番も
 * 再試行の列も要らず、失敗はその場で画面に返す。
 *
 * どのモデルで読むかは SY0E の設定が決める（既定 = ローカル ollama =
 * ヘッダ無し）。OCR は常にローカル。
 */

import { getLocale, getTranslations } from "next-intl/server";
import { AiProviderConfigError, aiConfigHeaders } from "./ai-provider";
import { matchBusinessPartnerName } from "./bp-match";
import { prisma } from "./db";
import { type LocalizedText, localized } from "./format";
import type { Locale } from "./i18n";
import { loadBpMatchPool } from "./intake";
import type { ExtractFailure } from "./intake-extract-error";
import {
  classifyHttpFailure,
  classifyLocalFailure,
  classifyNetworkFailure,
  classifyTimeoutFailure,
} from "./intake-extract-error";
import {
  type AliasLearning,
  aliasKeyFor,
  aliasLearning,
} from "./match-alias-core";
import {
  aliasesByTarget,
  findAlias,
  noteAliasHit,
  saveAliasLearnings,
} from "./match-aliases";
import type { MaterialMatchable } from "./material-match";
import { matchMaterial } from "./material-match";
import { isOwnCompany } from "./own-company";
import { PO_EXTRACT_URL } from "./po-extract";
import type {
  MaterialDeliveryDraft,
  MaterialOrderDraft,
  NormalizedMaterialDelivery,
  NormalizedMaterialOrder,
  PurchaseExtractedItem,
  PurchaseIntakeLine,
  SupplierMatch,
} from "./purchase-intake-core";
import {
  normalizeMaterialDelivery,
  normalizeMaterialOrder,
} from "./purchase-intake-core";

// 画面（client component）も同じ型を使う。置き場は純モジュール側。
export type {
  MaterialDeliveryDraft,
  MaterialOrderDraft,
  PurchaseIntakeLine,
} from "./purchase-intake-core";

/**
 * 抽出の待ち上限（既定 15 分 / PURCHASE_EXTRACT_TIMEOUT_MS）。
 * 3 段パイプライン（OCR + vision + LLM）が GPU の順番待ちに入ることがある。
 */
const EXTRACT_TIMEOUT_MS = Number(
  process.env.PURCHASE_EXTRACT_TIMEOUT_MS ??
    process.env.INTAKE_EXTRACT_TIMEOUT_MS ??
    15 * 60_000,
);

/** 分類済みの失敗。route が 502 + 構造化 JSON にして返す。 */
export class PurchaseExtractError extends Error {
  constructor(readonly failure: ExtractFailure) {
    super(failure.summary);
    this.name = "PurchaseExtractError";
  }
}

/** po-extract の書類種別。 */
type PurchaseDocType = "purchase-order" | "material-delivery";

/**
 * po-extract を 1 回叩いて生 JSON を返す。失敗は必ず PurchaseExtractError
 * （分類済み）にする — 画面は cause / hint / retryable をそのまま出せる。
 */
async function callPoExtract(
  docType: PurchaseDocType,
  file: File,
): Promise<unknown> {
  const endpoint = `${PO_EXTRACT_URL}/extract/${docType}`;
  const locale = (await getLocale()) as Locale;

  let aiHeaders: Record<string, string>;
  try {
    aiHeaders = await aiConfigHeaders();
  } catch (e) {
    // プロバイダに届く前に落ちている（鍵が変わった等）。再試行しても直らない。
    if (e instanceof AiProviderConfigError) {
      const tr = await getTranslations();
      throw new PurchaseExtractError({
        summary: e.message,
        hint: tr("purchase.intake.aiConfigHint"),
        detail: "ai provider config unavailable",
        retryable: false,
      });
    }
    throw e;
  }

  const form = new FormData();
  form.append("file", file, file.name || "upload.pdf");

  let res: Response;
  try {
    res = await fetch(endpoint, {
      method: "POST",
      headers: aiHeaders,
      body: form,
      signal: AbortSignal.timeout(EXTRACT_TIMEOUT_MS),
    });
  } catch (e) {
    if (e instanceof Error && e.name === "TimeoutError") {
      throw new PurchaseExtractError(
        classifyTimeoutFailure(EXTRACT_TIMEOUT_MS, locale),
      );
    }
    throw new PurchaseExtractError(classifyNetworkFailure(e, endpoint, locale));
  }

  if (!res.ok) {
    const body = await res.text().catch(() => null);
    throw new PurchaseExtractError(
      classifyHttpFailure(res.status, body, locale),
    );
  }

  try {
    return (await res.json()) as unknown;
  } catch (e) {
    throw new PurchaseExtractError(classifyLocalFailure(e, "response", locale));
  }
}

// ── 素材の突合 ────────────────────────────────────────────────────────────

/**
 * 突合の対象になる素材（有効）を全部読む。
 *
 * 素材マスタは材種 × 直径 × 全長の組合せで数千件。製品（数万件を見込む）と
 * 違って全件を JS へ持ってこられるので、取引先と同じやり方にする — 1 回の
 * 取込で 1 度だけ読み、行数ぶんの突合をこの 1 つのプールに対して行う。
 */
export async function loadMaterialMatchPool(): Promise<MaterialMatchable[]> {
  // 学習した表記（人が結び付けた実績）も照合キーに混ぜる。
  const learned = await aliasesByTarget("materials");
  const rows = await prisma.material.findMany({
    where: { isActive: true },
    orderBy: { code: "asc" },
    select: {
      id: true,
      code: true,
      name: true,
      manufacturerModel: true,
      matchNames: true,
      unit: true,
    },
  });
  return rows.map((r) => {
    const id = String(r.id);
    const nameJa = localized(r.name as LocalizedText | null);
    return {
      id,
      label: `${r.code}（${nameJa}）`,
      code: r.code,
      nameJa,
      manufacturerModel: r.manufacturerModel,
      // 人が登録したキーワード + 学習した表記。どちらも「この素材の書かれ方」。
      keywords: [...r.matchNames, ...(learned.get(id) ?? [])],
      unit: r.unit,
    };
  });
}

/**
 * 学習済み（人がこの表記をこの素材へ結び付けた実績）を先に見る。
 * 推測より人の判断を優先する — 販売側の matchProduct と同じ順序。
 */
async function learnedMaterial(
  text: string | null,
  pool: readonly MaterialMatchable[],
): Promise<MaterialMatchable | null> {
  const key = text?.trim();
  if (!key) return null;
  const learned = await findAlias("materials", key);
  if (!learned) return null;
  const hit = pool.find((m) => m.id === learned.targetId);
  if (!hit) return null; // マスタが消えている / 無効になった学習は無視する
  void noteAliasHit("materials", aliasKeyFor("materials", key));
  return hit;
}

async function matchLines(
  items: readonly PurchaseExtractedItem[],
  pool: readonly MaterialMatchable[],
): Promise<PurchaseIntakeLine[]> {
  const out: PurchaseIntakeLine[] = [];
  for (const item of items) {
    const learned =
      (await learnedMaterial(item.materialText, pool)) ??
      (await learnedMaterial(item.materialCode, pool));
    if (learned) {
      out.push({
        ...item,
        materialId: learned.id,
        materialLabel: learned.label,
        materialUnit: learned.unit ?? null,
        candidates: [],
      });
      continue;
    }
    const r = matchMaterial(item.materialCode, item.materialText, pool);
    const hit = r.matched
      ? (pool.find((m) => m.id === r.matched?.id) ?? null)
      : null;
    out.push({
      ...item,
      materialId: r.matched?.id ?? null,
      materialLabel: r.matched?.label ?? null,
      materialUnit: hit?.unit ?? null,
      candidates: r.candidates,
    });
  }
  return out;
}

/**
 * 仕入先の突合。**自社名は仕入先になり得ない**ので突合そのものを行わない
 * （AI が向きを取り違えたときに、自社を仕入先として掴まないため）。
 */
async function matchSupplier(name: string | null): Promise<SupplierMatch> {
  const empty: SupplierMatch = {
    supplierBpId: null,
    supplierLabel: null,
    supplierCandidates: [],
  };
  if (!name || isOwnCompany(name)) return empty;

  // 1. 学習済み（1 表記 = 1 社なので迷う余地が無い）。
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
        supplierBpId: bp.id,
        supplierLabel: localized(bp.name as LocalizedText | null),
        supplierCandidates: [],
      };
    }
  }

  // 2. 表記ゆれを吸収した段階的突合（期待ロールは仕入先）。
  const r = matchBusinessPartnerName(name, await loadBpMatchPool("VENDOR"));
  return {
    supplierBpId: r.matched?.id ?? null,
    supplierLabel: r.matched?.label ?? null,
    supplierCandidates: r.candidates,
  };
}

// ── 公開 API ──────────────────────────────────────────────────────────────

/** 仕入先の見積書 / 注文請書 / 発注書控え → 素材発注書の下書き。 */
export async function extractMaterialOrder(
  file: File,
): Promise<MaterialOrderDraft> {
  const raw = await callPoExtract("purchase-order", file);
  const locale = (await getLocale()) as Locale;
  let normalized: NormalizedMaterialOrder;
  try {
    // 「数量を読み取れませんでした」等の印は利用者の言語で残す。
    normalized = normalizeMaterialOrder(raw, locale);
  } catch (e) {
    throw new PurchaseExtractError(
      classifyLocalFailure(e, "normalize", locale),
    );
  }
  const { items, ...header } = normalized;
  const pool = await loadMaterialMatchPool();
  return {
    ...header,
    ...(await matchSupplier(header.supplierName)),
    lines: await matchLines(items, pool),
  };
}

/** 素材の納品書 → 素材入荷の下書き。 */
export async function extractMaterialDelivery(
  file: File,
): Promise<MaterialDeliveryDraft> {
  const raw = await callPoExtract("material-delivery", file);
  const locale = (await getLocale()) as Locale;
  let normalized: NormalizedMaterialDelivery;
  try {
    normalized = normalizeMaterialDelivery(raw, locale);
  } catch (e) {
    throw new PurchaseExtractError(
      classifyLocalFailure(e, "normalize", locale),
    );
  }
  const { items, ...header } = normalized;
  const pool = await loadMaterialMatchPool();
  return {
    ...header,
    ...(await matchSupplier(header.supplierName)),
    lines: await matchLines(items, pool),
  };
}

// ── 学習 ──────────────────────────────────────────────────────────────────

/** 保存された 1 行のうち、学習に関係する部分。 */
export interface PurchaseAliasLine {
  /** 抽出された品名（印字されたまま）。手入力なら null。 */
  materialText: string | null;
  /** 抽出された品番（印字されたまま）。 */
  materialCode: string | null;
  /** 保存された素材 id（未選択は null）。 */
  materialId: string | null;
}

/**
 * 保存できたあとに「この表記はこのマスタのことだ」を貯める（best-effort）。
 *
 * 販売側（match-alias-core の `aliasLearnings`）と違って**保存前後の比較は
 * しない**。購買側の取込は下書きを作るだけで「前の状態」が DB に無く、
 * 人はフォームを保存する時点で必ず 1 回は目を通しているため、保存された
 * 組み合わせをそのまま人の判断として扱ってよい。
 *
 * 品名と品番の両方を覚える — 次に同じ仕入先から同じ書式が来たとき、どちらで
 * 引いても当たるようにするため。**1 表記 = 1 マスタ**なので、後から別の素材へ
 * 結び直せばその行が移る（最後の訂正が勝つ）。
 *
 * ここで失敗しても保存は成功させる（学習は次回を楽にする副産物）。
 */
export async function learnPurchaseAliases(input: {
  /** 抽出された仕入先名（印字されたまま）。手入力なら null。 */
  extractedSupplierName: string | null;
  /** 保存された仕入先 id。 */
  supplierBpId: string | null;
  lines: readonly PurchaseAliasLine[];
  actorId: string | null;
}): Promise<void> {
  const learnings: AliasLearning[] = [];

  const supplier = aliasLearning(
    "business_partners",
    input.supplierBpId,
    input.extractedSupplierName,
  );
  if (supplier) learnings.push(supplier);

  // 同じ表記が別々の素材に結ばれている書類は、どちらを覚えるべきか決められない
  // ので**その表記だけ**捨てる（曖昧なものを覚えると害の方が大きい）。
  const byText = new Map<string, string | null>();
  for (const line of input.lines) {
    if (!line.materialId) continue;
    for (const raw of [line.materialText, line.materialCode]) {
      const text = raw?.trim();
      if (!text) continue;
      const seen = byText.get(text);
      if (seen === undefined) byText.set(text, line.materialId);
      else if (seen !== line.materialId) byText.set(text, null);
    }
  }
  for (const [text, materialId] of byText) {
    if (!materialId) continue;
    const learning = aliasLearning("materials", materialId, text);
    if (learning) learnings.push(learning);
  }

  if (learnings.length === 0) return;
  try {
    await saveAliasLearnings(learnings, input.actorId);
  } catch {
    // 学習の失敗で保存を巻き戻さない（saveAliasLearnings 自身も握り潰す）。
  }
}
