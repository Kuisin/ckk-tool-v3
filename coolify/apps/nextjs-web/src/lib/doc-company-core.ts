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

/**
 * 注文請書 1 件 = 法人 1 つ（利用者の決定）。明細の担当拠点は、どれも注文請書の
 * 法人に属していなければならない — 番号も発行元も請書ごとに 1 つなので、
 * 別の法人の拠点が混ざると、その行だけ「誰の書類か」が食い違う。
 *
 * 戻り値: 法人が合わない明細の行番号（1 始まり）。拠点の無い行は見ない。
 * 拠点が法人に属していない（null）ときは既定の法人として比べる
 * （書類の発行元の決め方と同じ — lib/own-company-core.ts）。
 */
export function linesOutsideCompany(
  orderCompanyId: number,
  lines: readonly { hasPlant: boolean; plantCompanyId?: Id }[],
  defaultId: number | null,
): number[] {
  const out: number[] = [];
  lines.forEach((line, i) => {
    if (!line.hasPlant) return;
    const companyId = line.plantCompanyId ?? defaultId;
    if (companyId !== orderCompanyId) out.push(i + 1);
  });
  return out;
}

/**
 * 取込（IMPORT）で作る注文請書。取込の時点では担当拠点も明細も無いので、
 * **取込口**が法人を決める（利用者の決定: 取込口ごとに自社法人 1 つ）。
 *   フォルダ取込（メール・外部連携を含む）… 取込口の法人 → 既定
 *   画面からのアップロード … 入れた人の法人（所属拠点が 1 社に決まるとき）
 *                              → 取込口の法人 → 既定
 */
export function companyForIntake(
  input: {
    source: "FOLDER" | "UPLOAD";
    channelCompanyId?: Id;
    uploaderCompanyId?: Id;
  },
  defaultId: number | null,
): number | null {
  return resolveOwnCompanyId(
    input.source === "UPLOAD"
      ? [input.uploaderCompanyId, input.channelCompanyId]
      : [input.channelCompanyId],
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

// ── 発行会社（拠点を持たない書類）───────────────────────────────────────────
//
// 見積書・価格試算・価格表は拠点を持たないので、拠点から法人を決められない。
// 利用者の決定: 作成フォームに「発行会社」を置く。
//   - 初期値: 作成者の所属拠点の法人が 1 つならそれ、そうでなければ既定の法人
//   - 欄を出すのは、所属拠点が**2 つ以上の法人にまたがる人だけ**（1 社にしか
//     属さない人には選ぶものが無い）
//   - サーバーが検証する（画面を通らない要求で他社の書類を作らせない）

export interface IssuingCompanyChoice {
  /** 選べる法人（作成者の所属拠点の法人。重複なし・出現順）。 */
  companyIds: number[];
  /** 初期値。既定の法人も無ければ null（DB の既定値に任せる）。 */
  prefill: number | null;
  /** 欄を出すか（2 つ以上の法人にまたがるときだけ）。 */
  selectable: boolean;
}

/**
 * 作成者の所属拠点の法人 id（拠点の並び順。法人に属さない拠点は null）→ 選択肢。
 * 法人に属さない拠点は既定の法人として数える（書類の発行元の決め方と同じ）。
 */
export function issuingCompanyChoice(
  userPlantCompanyIds: readonly Id[],
  defaultId: number | null,
): IssuingCompanyChoice {
  const companyIds: number[] = [];
  for (const raw of userPlantCompanyIds) {
    const id = raw ?? defaultId;
    if (id != null && !companyIds.includes(id)) companyIds.push(id);
  }
  return {
    companyIds,
    prefill: companyIds.length === 1 ? companyIds[0] : defaultId,
    selectable: companyIds.length > 1,
  };
}

/**
 * フォームから来た発行会社を検証して確定する。
 *   - 未指定 … 初期値
 *   - 選べる人 … 自分の所属拠点の法人のどれか
 *   - 選べない人 … 初期値と同じ値だけ（別の法人を指定してきたら拒否）
 */
export function resolveIssuingCompanyId(
  choice: IssuingCompanyChoice,
  requested: Id,
): { ok: true; id: number | null } | { ok: false } {
  if (requested == null) return { ok: true, id: choice.prefill };
  const allowed = choice.selectable ? choice.companyIds : [choice.prefill];
  return allowed.includes(requested)
    ? { ok: true, id: requested }
    : { ok: false };
}

/**
 * Prisma の create data へ渡す形。null（既定の法人すら無い）なら列を渡さず、
 * DB の既定値に任せる — NOT NULL 制約がそこで落とすので、黙って空の法人の
 * 書類はできない。
 */
export function ownCompanyData(id: number | null): { ownCompanyId?: number } {
  return id == null ? {} : { ownCompanyId: id };
}
