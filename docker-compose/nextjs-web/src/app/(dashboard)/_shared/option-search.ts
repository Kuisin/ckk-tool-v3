"use server";

/**
 * option-search.ts — SearchSelect 用のサーバーサイド検索アクション。
 *
 * 大きいマスタ（製品 4.3万件など）を全件クライアントへ送らず、クエリごとに
 * 上位 LIMIT 件だけ返す。空クエリは先頭 LIMIT 件。
 * 値は内部 id（連番）の文字列、ラベルは表示コード + 名称。
 */

import { prisma } from "@/lib/db";
import { formatProductNumber } from "@/lib/doc-number";
import { type LocalizedText, localized } from "@/lib/format";

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

/** 顧客（トップレベル CUSTOMER ロール）— BPコード / 名称 / AI照合名。 */
export async function searchCustomerOptions(
  query: string,
): Promise<SearchOption[]> {
  const q = query.trim();
  const rows = await prisma.businessPartner.findMany({
    where: {
      isActive: true,
      parentId: null,
      roleAssignments: { some: { role: "CUSTOMER" } },
      ...(q
        ? {
            OR: [
              { bpCode: { contains: q, mode: "insensitive" } },
              { name: { path: ["ja"], string_contains: q } },
              { matchNames: { has: q } },
            ],
          }
        : {}),
    },
    orderBy: { bpCode: "asc" },
    take: LIMIT,
  });
  return rows.map((r) => ({
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
      roleAssignments: { some: { role: "CUSTOMER" } },
      ...(code ? { bpCode: { contains: code, mode: "insensitive" } } : {}),
      ...(name
        ? {
            OR: [
              { name: { path: ["ja"], string_contains: name } },
              { nameKana: { contains: name, mode: "insensitive" } },
              { matchNames: { has: name } },
            ],
          }
        : {}),
    },
    orderBy: { bpCode: "asc" },
    take: F4_LIMIT,
  });
  return rows.map((r) => {
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

/** 注文請書検索（指示書ビルダー用）。value = uuid、label = 番号 + 製品 + 数量。 */
export async function searchSalesOrderOptions(
  query: string,
): Promise<SearchOption[]> {
  const q = query.trim();
  const rows = await prisma.salesOrder.findMany({
    where: {
      status: { in: ["DRAFT", "CONFIRMED", "IN_PRODUCTION"] },
      ...(q
        ? {
            OR: [
              { customerOrderRef: { contains: q, mode: "insensitive" } },
              { product: { name: { path: ["ja"], string_contains: q } } },
              { customerBp: { name: { path: ["ja"], string_contains: q } } },
            ],
          }
        : {}),
    },
    include: { product: true, customerBp: true },
    orderBy: [{ yearMonth: "desc" }, { seq: "desc" }, { branch: "asc" }],
    take: LIMIT,
  });
  const { formatSalesOrderNumber } = await import("@/lib/doc-number");
  return rows.map((r) => ({
    value: r.id,
    label: `${formatSalesOrderNumber(r)} ${localized(r.product.name as LocalizedText | null)}（${r.quantity}）`,
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
