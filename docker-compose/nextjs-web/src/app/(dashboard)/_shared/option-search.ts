"use server";

/**
 * option-search.ts — SearchSelect 用のサーバーサイド検索アクション。
 *
 * 大きいマスタ（製品 4.3万件など）を全件クライアントへ送らず、クエリごとに
 * 上位 LIMIT 件だけ返す。空クエリは先頭 LIMIT 件。
 * 値は内部 id（連番）の文字列、ラベルは表示コード + 名称。
 */

import { checkPermission } from "@/lib/authz";
import { bpMatchesQuery } from "@/lib/bp-search";
import { prisma } from "@/lib/db";
import { formatProductNumber, formatQuoteNumber } from "@/lib/doc-number";
import { type LocalizedText, localized } from "@/lib/format";
import { listCustomerSalesReps } from "@/lib/sales-rep";

const LIMIT = 20;
const F4_LIMIT = 50;

export interface SearchOption {
  value: string;
  label: string;
}

/** F4（詳細検索ポップアップ）の結果行 — ui/F4SearchModal.tsx の F4Row。 */
export interface F4SearchRow {
  value: string;
  label: string;
  cells: string[];
}

const s = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

function productLabel(p: {
  id: number;
  name: unknown;
  yearMonth: string | null;
  seq: number | null;
}): string {
  const code = formatProductNumber(p.yearMonth, p.seq);
  const name = localized(p.name as LocalizedText | null);
  return code ? `${name} ${code}` : name;
}

/** 製品 — 名称(ja) の部分一致（コードは未採番のレガシーが大半のため名称主体）。 */
export async function searchProductOptions(
  query: string,
): Promise<SearchOption[]> {
  const q = query.trim();
  const rows = await prisma.product.findMany({
    where: {
      isActive: true,
      ...(q ? { name: { path: ["ja"], string_contains: q } } : {}),
    },
    orderBy: { id: "asc" },
    take: LIMIT,
  });
  return rows.map((p) => ({ value: String(p.id), label: productLabel(p) }));
}

/**
 * 見積書 — 注文請書から参照する見積を選ぶための検索。
 *
 * 値は表示番号（QOT-YYYYMM-NNNNN）。保存側はこの文字列を複合キーへ戻すので、
 * 手入力していたときと同じ形のまま扱える。
 *
 * `customerBpId` を渡すと **その顧客の見積だけ**に絞る。注文請書では顧客が
 * 先に決まっているので、関係ない見積を選んでしまう事故を防げる。
 * 下書き（DRAFT）の見積も選べる — 受注が先に確定することがあるため。
 */
export async function searchQuoteOptions(
  query: string,
  customerBpId?: string | null,
): Promise<SearchOption[]> {
  const q = query.trim().toUpperCase();
  const rows = await prisma.quote.findMany({
    where: {
      ...(customerBpId ? { customerBpId } : {}),
      // 却下・期限切れは選ばせない（参照しても意味がないため）。
      status: { notIn: ["REJECTED", "EXPIRED"] },
    },
    include: { customerBp: { select: { name: true } } },
    orderBy: [{ yearMonth: "desc" }, { seq: "desc" }],
    take: 200,
  });
  return rows
    .map((r) => {
      const number = formatQuoteNumber(r);
      const customer = localized(r.customerBp?.name as LocalizedText | null);
      return {
        value: number,
        label: customerBpId ? number : `${number} — ${customer}`,
        haystack: `${number} ${customer}`.toUpperCase(),
      };
    })
    .filter((o) => !q || o.haystack.includes(q))
    .slice(0, LIMIT)
    .map(({ value, label }) => ({ value, label }));
}

/** 営業担当セレクトが 1 往復で必要とするもの。 */
export interface SalesRepPicker {
  /** 顧客に登録されている担当者（並びは 主担当 → sortOrder）。 */
  options: SearchOption[];
  /**
   * 取引先マスタで営業担当を編集できるか。未登録の顧客に「登録しに行く」
   * 導線を出してよいかの判定に使う — 権限が無い人に開けない画面への
   * リンクを見せないため。
   */
  canManage: boolean;
}

/**
 * 営業担当 — 指定した顧客に登録されている担当者（app.bp_sales_reps）。
 *
 * 並びは 主担当 → sortOrder なので、**先頭が新規書類の既定値**。顧客を選び
 * 直したときにフォームがこれを呼び、候補と既定値を入れ替える。
 * 顧客未選択・担当未登録なら空配列。
 */
export async function fetchSalesRepPicker(
  customerBpId: string | null,
): Promise<SalesRepPicker> {
  const [options, authz] = await Promise.all([
    listCustomerSalesReps(customerBpId),
    checkPermission("master", "UPDATE"),
  ]);
  return { options, canManage: authz.ok };
}

/** 顧客（トップレベル CUSTOMER ロール）— BPコード / 名称 / AI照合名。 */
export async function searchCustomerOptions(
  query: string,
): Promise<SearchOption[]> {
  const q = query.trim();
  // 照合キー（AI 用に貯めた表記ゆれ + フリガナ由来）でも探せるようにする。
  // 配列の部分一致は Prisma の where で書けないので、候補を絞ってから
  // lib/bp-search の共通判定でふるいにかける（件数が少ないマスタなので十分）。
  const rows = await prisma.businessPartner.findMany({
    where: {
      isActive: true,
      parentId: null,
      roleAssignments: { some: { role: "CUSTOMER", isActive: true } },
    },
    orderBy: { bpCode: "asc" },
  });
  return rows
    .filter((r) =>
      bpMatchesQuery(
        {
          bpCode: r.bpCode,
          nameJa: localized(r.name as LocalizedText | null),
          nameKana: r.nameKana,
          shortName: r.shortName,
          matchNames: r.matchNames,
          matchNamesAuto: r.matchNamesAuto,
        },
        q,
      ),
    )
    .slice(0, LIMIT)
    .map((r) => ({
      value: r.id,
      label: localized(r.name as LocalizedText | null),
    }));
}

/** 変換済（コード構成あり）材種のみ — 素材ビルダーの親材種ピッカー用。 */
export async function searchStructuredMaterialTypeOptions(
  query: string,
): Promise<SearchOption[]> {
  const q = query.trim();
  const rows = await prisma.materialType.findMany({
    where: {
      isActive: true,
      code: { not: null },
      ...(q
        ? {
            OR: [
              { code: { contains: q, mode: "insensitive" } },
              { name: { path: ["ja"], string_contains: q } },
            ],
          }
        : {}),
    },
    orderBy: { code: "asc" },
    take: LIMIT,
  });
  return rows.map((r) => ({
    value: String(r.id),
    label: `${r.code} — ${localized(r.name as LocalizedText | null)}`,
  }));
}

/** 材種 — code または名称(ja)。 */
export async function searchMaterialTypeOptions(
  query: string,
): Promise<SearchOption[]> {
  const q = query.trim();
  const rows = await prisma.materialType.findMany({
    where: {
      isActive: true,
      ...(q
        ? {
            OR: [
              { code: { contains: q, mode: "insensitive" } },
              { name: { path: ["ja"], string_contains: q } },
            ],
          }
        : {}),
    },
    orderBy: { id: "asc" },
    take: LIMIT,
  });
  return rows.map((r) => ({
    value: String(r.id),
    label: localized(r.name as LocalizedText | null),
  }));
}

// ── F4 詳細検索（フィルタ + 結果テーブル、最大 F4_LIMIT 件） ────────────────

/** 製品 F4 — 名称 / 素材コード。columns: 製品コード/名称/素材/単位。 */
export async function f4SearchProducts(
  filters: Record<string, string>,
): Promise<F4SearchRow[]> {
  const name = s(filters.name);
  const materialType = s(filters.materialType);
  const rows = await prisma.product.findMany({
    where: {
      isActive: true,
      ...(name ? { name: { path: ["ja"], string_contains: name } } : {}),
      ...(materialType
        ? {
            materialType: {
              code: { contains: materialType, mode: "insensitive" },
            },
          }
        : {}),
    },
    include: { materialType: true },
    orderBy: { id: "asc" },
    take: F4_LIMIT,
  });
  return rows.map((p) => {
    const nameJa = localized(p.name as LocalizedText | null);
    return {
      value: String(p.id),
      label: productLabel(p),
      cells: [
        formatProductNumber(p.yearMonth, p.seq) ?? "未採番",
        nameJa,
        p.materialType?.code ?? "—",
        p.unit,
      ],
    };
  });
}

/** 顧客 F4 — BPコード / 名称・かな。columns: BPコード/名称/かな。 */
export async function f4SearchCustomers(
  filters: Record<string, string>,
): Promise<F4SearchRow[]> {
  const code = s(filters.code);
  const name = s(filters.name);
  const rows = await prisma.businessPartner.findMany({
    where: {
      isActive: true,
      parentId: null,
      roleAssignments: { some: { role: "CUSTOMER", isActive: true } },
      ...(code ? { bpCode: { contains: code, mode: "insensitive" } } : {}),
    },
    orderBy: { bpCode: "asc" },
  });
  // 名前欄は照合キー込みで判定する（読み・ローマ字・㈱ 表記でも当たる）。
  return rows
    .filter((r) =>
      bpMatchesQuery(
        {
          nameJa: localized(r.name as LocalizedText | null),
          nameEn: (r.name as { en?: string } | null)?.en ?? null,
          nameKana: r.nameKana,
          shortName: r.shortName,
          matchNames: r.matchNames,
          matchNamesAuto: r.matchNamesAuto,
        },
        name ?? "",
      ),
    )
    .slice(0, F4_LIMIT)
    .map((r) => {
      const nameJa = localized(r.name as LocalizedText | null);
      return {
        value: r.id,
        label: nameJa,
        cells: [r.bpCode ?? "—", nameJa, r.nameKana ?? "—"],
      };
    });
}

/**
 * 変換済材種 F4 — メーカー / 形状（select）+ コード / 名称（text）。
 * columns: 材種コード/メーカー/形状/名称。素材ビルダーの親材種選択用。
 */
export async function f4SearchStructuredMaterialTypes(
  filters: Record<string, string>,
): Promise<F4SearchRow[]> {
  const manufacturerCode = s(filters.manufacturerCode);
  const shapeCode = s(filters.shapeCode);
  const code = s(filters.code);
  const name = s(filters.name);
  const rows = await prisma.materialType.findMany({
    where: {
      isActive: true,
      code: code
        ? { not: null, contains: code, mode: "insensitive" }
        : { not: null },
      ...(manufacturerCode ? { manufacturerCode } : {}),
      ...(shapeCode ? { shapeCode } : {}),
      ...(name ? { name: { path: ["ja"], string_contains: name } } : {}),
    },
    include: { manufacturer: true, shape: true },
    orderBy: { code: "asc" },
    take: F4_LIMIT,
  });
  return rows.map((r) => {
    const nameJa = localized(r.name as LocalizedText | null);
    return {
      value: String(r.id),
      label: `${r.code} — ${nameJa}`,
      cells: [
        r.code ?? "—",
        r.manufacturer
          ? localized(r.manufacturer.name as LocalizedText | null)
          : "—",
        r.shape ? localized(r.shape.name as LocalizedText | null) : "—",
        nameJa,
      ],
    };
  });
}

/** 工程マスタ検索（依存編集・ワークフロービルダー用）。value = 内部 id。 */
export async function searchProcessStepOptions(
  query: string,
): Promise<SearchOption[]> {
  const q = query.trim();
  const rows = await prisma.processStepCatalog.findMany({
    where: {
      isActive: true,
      ...(q
        ? {
            OR: [
              { code: { contains: q, mode: "insensitive" } },
              { name: { path: ["ja"], string_contains: q } },
            ],
          }
        : {}),
    },
    orderBy: { sortOrder: "asc" },
    take: LIMIT,
  });
  return rows.map((r) => ({
    value: String(r.id),
    label: `${localized(r.name as LocalizedText | null)}（${r.code}）`,
  }));
}

/** ユーザー検索（承認グループのメンバー選択用）。value = uuid。 */
export async function searchUserOptions(
  query: string,
): Promise<SearchOption[]> {
  const q = query.trim();
  const rows = await prisma.user.findMany({
    where: {
      isActive: true,
      ...(q
        ? {
            OR: [
              { displayName: { contains: q, mode: "insensitive" } },
              { username: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    orderBy: { username: "asc" },
    take: LIMIT,
  });
  return rows.map((r) => ({
    value: r.id,
    label: `${r.displayName}（${r.username}）`,
  }));
}

/** 注文明細検索（指示書ビルダー用）。value = uuid、label = 番号 + 製品 + 数量。 */
export async function searchOrderLineOptions(
  query: string,
): Promise<SearchOption[]> {
  const q = query.trim();
  const rows = await prisma.orderLine.findMany({
    where: {
      // 確定済み（枝番あり）のみ — 未確定の明細は公開番号を持たない
      branch: { not: null },
      // PARTIAL_SHIPPED を含める — 一部出荷済みの注文明細へ追加出荷できる
      status: {
        in: ["DRAFT", "CONFIRMED", "IN_PRODUCTION", "PARTIAL_SHIPPED"],
      },
      ...(q
        ? {
            OR: [
              {
                acceptance: {
                  customerOrderRef: { contains: q, mode: "insensitive" },
                },
              },
              { product: { name: { path: ["ja"], string_contains: q } } },
              {
                acceptance: {
                  customerBp: { name: { path: ["ja"], string_contains: q } },
                },
              },
            ],
          }
        : {}),
    },
    include: { product: true },
    orderBy: [
      { acceptanceYearMonth: "desc" },
      { acceptanceSeq: "desc" },
      { branch: "asc" },
    ],
    take: LIMIT,
  });
  const { orderLineNumberOf } = await import("@/lib/doc-number");
  return rows.map((r) => ({
    value: r.id,
    label: `${orderLineNumberOf(r) ?? "—"} ${localized(r.product?.name as LocalizedText | null)}（${r.quantity}）`,
  }));
}

/** 素材検索（指示書の使用素材）。value = 内部 id、label = コード + 名称。 */
export async function searchMaterialOptions(
  query: string,
): Promise<SearchOption[]> {
  const q = query.trim();
  const rows = await prisma.material.findMany({
    where: {
      isActive: true,
      ...(q
        ? {
            OR: [
              { code: { contains: q, mode: "insensitive" } },
              { name: { path: ["ja"], string_contains: q } },
            ],
          }
        : {}),
    },
    orderBy: { code: "asc" },
    take: LIMIT,
  });
  return rows.map((r) => ({
    value: String(r.id),
    label: `${r.code}（${localized(r.name as LocalizedText | null)}）`,
  }));
}
