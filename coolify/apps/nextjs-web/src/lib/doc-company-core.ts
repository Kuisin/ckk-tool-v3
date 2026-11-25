/**
 * doc-company-core.ts — 書類の発行元（自社法人）を作成時に決める規則。純粋関数。
 *
 * 番号設計 PR-B で、番号を持つ書類はすべて own_company_id（NOT NULL）を持つ。
 * PR-C で番号は「自社法人 × 会計年度」ごとの連番になるので、**書類の法人は
 * 番号を払い出す前（= 作成時）に決まっていなければならず、以後は変えない**
 * （DB トリガー app.own_company_id_immutable）。
 *
 * 規則は全種別で同じ形: **上流の書類の法人 → 拠点の法人 → 既定の法人**。
 * 種別ごとに違うのは「何が上流で、どの拠点を見るか」だけなので、それを
 * 関数 1 つずつに書き下してある。決め方そのものは
 * lib/own-company-core.ts resolveOwnCompanyId（最初に見つかった法人が勝つ）。
 *
 * 既存行の埋め戻し（migration 20261126190000_doc_uuid_keys_own_company）も
 * 同じ順で書いてある — どちらかを直すときは両方を直す。
 *
 * 戻り値の null は「既定の法人も無い」— 呼び出し側は値を渡さず、DB の既定値
 * （app.default_own_company_id()）に任せる（{@link ownCompanyData}）。
 */

import { resolveOwnCompanyId } from "@/lib/own-company-core";

type Id = number | null | undefined;

/** 上流も拠点も持たない書類（見積書・価格試算・価格表・フォーム回答・社内文書）。 */
export function companyForUnplacedDoc(defaultId: number | null): number | null {
  return defaultId;
}

/** 注文請書: 担当拠点 → 明細の担当拠点（並び順）→ 見積書 → 既定。 */
export function companyForOrderAcceptance(
  input: {
    assignedPlantCompanyId?: Id;
    linePlantCompanyIds?: readonly Id[];
    quoteCompanyId?: Id;
  },
  defaultId: number | null,
): number | null {
  return resolveOwnCompanyId(
    [
      input.assignedPlantCompanyId,
      ...(input.linePlantCompanyIds ?? []),
      input.quoteCompanyId,
    ],
    defaultId,
  );
}

/** 設計依頼書: 見積書 → 注文明細の注文請書 → 既定。 */
export function companyForDesignRequest(
  input: { quoteCompanyId?: Id; orderAcceptanceCompanyId?: Id },
  defaultId: number | null,
): number | null {
  return resolveOwnCompanyId(
    [input.quoteCompanyId, input.orderAcceptanceCompanyId],
    defaultId,
  );
}

/** 指示書: 割当てた注文明細の注文請書（割当の並び順）→ 既定。 */
export function companyForWorkOrder(
  input: { orderAcceptanceCompanyIds?: readonly Id[] },
  defaultId: number | null,
): number | null {
  return resolveOwnCompanyId(input.orderAcceptanceCompanyIds ?? [], defaultId);
}

/**
 * 出荷書: 出荷元拠点 → 明細の注文明細の担当拠点（並び順）→ 既定。
 * 請求書の束ね（lib/own-companies.ts shipmentOwnCompanyId）と同じ順 —
 * 同じ出荷から作る納品書・請求書が別の法人にならないようにするため。
 */
export function companyForDeliveryOrder(
  input: { fromPlantCompanyId?: Id; linePlantCompanyIds?: readonly Id[] },
  defaultId: number | null,
): number | null {
  return resolveOwnCompanyId(
    [input.fromPlantCompanyId, ...(input.linePlantCompanyIds ?? [])],
    defaultId,
  );
}

/** 納品書: 出荷書の法人（出荷書は必ず持つ）。 */
export function companyForDeliveryNote(input: {
  deliveryOrderCompanyId: number;
}): number {
  return input.deliveryOrderCompanyId;
}

/** 会計文書: 請求書の法人（請求書は必ず持つ）。 */
export function companyForAccountingDocument(input: {
  invoiceCompanyId: number;
}): number {
  return input.invoiceCompanyId;
}

/** 素材発注書・購買依頼: 明細の入荷先 / 希望拠点（並び順）→ 既定。 */
export function companyForPurchaseDoc(
  input: { linePlantCompanyIds?: readonly Id[] },
  defaultId: number | null,
): number | null {
  return resolveOwnCompanyId(input.linePlantCompanyIds ?? [], defaultId);
}

/** 入出庫伝票・棚卸: 拠点 → 既定。 */
export function companyForPlantDoc(
  input: { plantCompanyId?: Id },
  defaultId: number | null,
): number | null {
  return resolveOwnCompanyId([input.plantCompanyId], defaultId);
}

/**
 * Prisma の create data へ渡す形。null（既定の法人すら無い）なら列を渡さず、
 * DB の既定値に任せる — NOT NULL 制約がそこで落とすので、黙って空の法人の
 * 書類はできない。
 */
export function ownCompanyData(id: number | null): { ownCompanyId?: number } {
  return id == null ? {} : { ownCompanyId: id };
}
