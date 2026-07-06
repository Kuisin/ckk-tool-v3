"use server";

/**
 * option-search.ts — SearchSelect 用のサーバーサイド検索アクション。
 *
 * 大きいマスタ（製品 4.3万件など）を全件クライアントへ送らず、クエリごとに
 * 上位 LIMIT 件だけ返す。空クエリは先頭 LIMIT 件（コード順）。
 */

import { prisma } from "@/lib/db";
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

/** 製品 — id または名称(ja) の部分一致。 */
export async function searchProductOptions(
  query: string,
): Promise<SearchOption[]> {
  const q = query.trim();
  const rows = await prisma.product.findMany({
    where: {
      isActive: true,
      ...(q
        ? {
            OR: [
              { id: { contains: q, mode: "insensitive" } },
              { name: { path: ["ja"], string_contains: q } },
            ],
          }
        : {}),
    },
    orderBy: { id: "asc" },
    take: LIMIT,
  });
  return rows.map((p) => ({
    value: p.id,
    label: `${localized(p.name as LocalizedText | null)} ${p.id}`,
  }));
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
      manufacturerCode: { not: null },
      ...(q
        ? {
            OR: [
              { id: { contains: q, mode: "insensitive" } },
              { name: { path: ["ja"], string_contains: q } },
            ],
          }
        : {}),
    },
    orderBy: { id: "asc" },
    take: LIMIT,
  });
  return rows.map((r) => ({
    value: r.id,
    label: `${r.id} — ${localized(r.name as LocalizedText | null)}`,
  }));
}

/** 材種 — id または名称(ja)。 */
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
              { id: { contains: q, mode: "insensitive" } },
              { name: { path: ["ja"], string_contains: q } },
            ],
          }
        : {}),
    },
    orderBy: { id: "asc" },
    take: LIMIT,
  });
  return rows.map((r) => ({
    value: r.id,
    label: localized(r.name as LocalizedText | null),
  }));
}

// ── F4 詳細検索（フィルタ + 結果テーブル、最大 F4_LIMIT 件） ────────────────

/** 製品 F4 — コード / 名称 / 素材コード。columns: 製品コード/名称/素材/単位。 */
export async function f4SearchProducts(
  filters: Record<string, string>,
): Promise<F4SearchRow[]> {
  const code = s(filters.code);
  const name = s(filters.name);
  const material = s(filters.material);
  const rows = await prisma.product.findMany({
    where: {
      isActive: true,
      ...(code ? { id: { contains: code, mode: "insensitive" } } : {}),
      ...(name ? { name: { path: ["ja"], string_contains: name } } : {}),
      ...(material
        ? { materialId: { contains: material, mode: "insensitive" } }
        : {}),
    },
    orderBy: { id: "asc" },
    take: F4_LIMIT,
  });
  return rows.map((p) => {
    const nameJa = localized(p.name as LocalizedText | null);
    return {
      value: p.id,
      label: `${nameJa} ${p.id}`,
      cells: [p.id, nameJa, p.materialId ?? "—", p.unit],
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
      manufacturerCode: manufacturerCode ? manufacturerCode : { not: null },
      ...(shapeCode ? { shapeCode } : {}),
      ...(code ? { id: { contains: code, mode: "insensitive" } } : {}),
      ...(name ? { name: { path: ["ja"], string_contains: name } } : {}),
    },
    include: { manufacturer: true, shape: true },
    orderBy: { id: "asc" },
    take: F4_LIMIT,
  });
  return rows.map((r) => {
    const nameJa = localized(r.name as LocalizedText | null);
    return {
      value: r.id,
      label: `${r.id} — ${nameJa}`,
      cells: [
        r.id,
        r.manufacturer
          ? localized(r.manufacturer.name as LocalizedText | null)
          : "—",
        r.shape ? localized(r.shape.name as LocalizedText | null) : "—",
        nameJa,
      ],
    };
  });
}
