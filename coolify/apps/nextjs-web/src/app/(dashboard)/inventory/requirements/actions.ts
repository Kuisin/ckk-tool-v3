"use server";

/**
 * actions.ts — 在庫・所要量 (ST03) の Server Action。
 *
 * `SearchSelect`（ItemPicker）はクライアント側から呼ぶので、これだけは
 * `data.ts`（プレーンな server-only モジュール）ではなく "use server" ファイル
 * として分ける（movements/data.ts のような読み取り専用データ取得と違い、
 * クライアントコンポーネントの props として渡す関数が要る）。
 */

import { getLocale } from "next-intl/server";
import { checkPermission } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { itemTypeLabel } from "@/lib/enum-labels";
import { type LocalizedText, localized } from "@/lib/format";
import type { Locale } from "@/lib/i18n";

const LIMIT = 20;

export interface ItemOption {
  value: string;
  label: string;
}

/**
 * 品目（製品・素材 統合）検索 — コード / 名称(ja) / キーワード（match_names）
 * の部分一致。ラベルは「コード 名称（種別）」— SearchSelect は plain な
 * {value,label} しか運べないので、種別は色付きバッジではなく丸括弧の
 * テキストとして埋め込む。
 */
export async function searchItemOptions(query: string): Promise<ItemOption[]> {
  const authz = await checkPermission("inventory", "READ");
  if (!authz.ok) return [];
  const locale = (await getLocale()) as Locale;
  const q = query.trim();
  const rows = await prisma.item.findMany({
    where: {
      isActive: true,
      ...(q
        ? {
            OR: [
              { code: { contains: q, mode: "insensitive" } },
              { name: { path: ["ja"], string_contains: q } },
              { matchNames: { has: q } },
            ],
          }
        : {}),
    },
    orderBy: [{ itemType: "asc" }, { code: "asc" }],
    take: LIMIT,
  });
  return rows.map((r) => ({
    value: String(r.id),
    label: `${r.code ?? "—"} ${localized(r.name as LocalizedText | null)}（${itemTypeLabel(r.itemType, locale)}）`,
  }));
}
