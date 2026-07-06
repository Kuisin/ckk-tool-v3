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

export interface SearchOption {
  value: string;
  label: string;
}

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
