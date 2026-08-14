// Access → Prisma where 断片 / 行述語（純粋関数）。
//
// 使い方（一覧クエリ）:
//   const where = { AND: [baseWhere, plantWhere(access, "plantId")] }
// 使い方（詳細・アクション前の行チェック）:
//   if (!rowInScope(access, { plantIds: [row.plantId], createdBy: row.createdBy }, userId)) deny
//
// 併用規則: 可視 ⇔ ALL ∨ 行の拠点 ∈ plantIds ∨ (own ∧ createdBy = 自分)

import type { Access } from "./types";

/** どの行にも一致しない Prisma where（空 OR は常に偽） */
export const NEVER: { OR: never[] } = { OR: [] };

/** ALL のとき null（無制限）、SCOPED のとき拠点 id 集合 */
export function plantIdSet(access: Access): ReadonlySet<number> | null {
  return access.kind === "ALL" ? null : access.plantIds;
}

/** 拠点列での行フィルタ。ALL → {}（制約なし）。∅ → in: []（0 件、fail-closed） */
export function plantWhere(
  access: Access,
  column = "plantId",
): Record<string, unknown> {
  if (access.kind === "ALL") return {};
  return { [column]: { in: [...access.plantIds] } };
}

/** created_by 列での OWN フィルタ。OWN grant が無い SCOPED は NEVER */
export function ownWhere(
  access: Access,
  userId: string,
  column = "createdBy",
): Record<string, unknown> {
  if (access.kind === "ALL") return {};
  return access.own ? { [column]: userId } : NEVER;
}

/**
 * 拠点 OR OWN の複合フィルタ（推奨形）。
 * plantClause は列名でなく where 断片の生成関数 — ネスト
 * （steps: { some: { plantId: { in } } } 等）に対応するため。
 */
export function ownOrPlantWhere(
  access: Access,
  userId: string,
  options: {
    /** 拠点 id 配列 → where 断片。省略時は plantColumn を使う */
    plantClause?: (plantIds: number[]) => Record<string, unknown>;
    plantColumn?: string;
    ownColumn?: string;
  } = {},
): Record<string, unknown> {
  if (access.kind === "ALL") return {};
  const branches: Record<string, unknown>[] = [];
  const plantIds = [...access.plantIds];
  if (plantIds.length > 0) {
    const clause =
      options.plantClause?.(plantIds) ??
      ({ [options.plantColumn ?? "plantId"]: { in: plantIds } } as Record<
        string,
        unknown
      >);
    branches.push(clause);
  }
  if (access.own) {
    branches.push({ [options.ownColumn ?? "createdBy"]: userId });
  }
  if (branches.length === 0) return NEVER;
  if (branches.length === 1) return branches[0] as Record<string, unknown>;
  return { OR: branches };
}

/**
 * 取得済みの 1 行がスコープ内か（詳細ページ・アクション用）。
 * plantIds は行が属する拠点（複数可 — 指示書は工程経由なので配列）。
 * null 拠点（未設定行）は SCOPED ユーザーには不可視（fail-closed）。
 */
export function rowInScope(
  access: Access,
  row: {
    plantIds?: readonly (number | null)[];
    createdBy?: string | null;
  },
  userId: string,
): boolean {
  if (access.kind === "ALL") return true;
  const inPlant =
    row.plantIds?.some((id) => id !== null && access.plantIds.has(id)) ?? false;
  const isOwn =
    access.own && row.createdBy !== null && row.createdBy === userId;
  return inPlant || isOwn;
}
