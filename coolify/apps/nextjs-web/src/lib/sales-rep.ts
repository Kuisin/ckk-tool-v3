import "server-only";

/**
 * sales-rep.ts — 営業担当（CKK 側の担当者）の唯一の読み書き口。
 *
 * 二層で持つ:
 *   1. 顧客マスタ（app.bp_sales_reps） — 1 顧客に複数の担当候補。`isPrimary`
 *      の 1 名が新規書類の既定値（顧客あたり 1 名に部分 unique index で制限）。
 *   2. 書類（*.sales_rep_id） — 作成時に主担当を複写したスナップショット。
 *      顧客側の担当が替わっても過去書類の担当は動かない。
 *
 * 注文明細（order_lines）は列を持たず、注文請書ヘッダの担当を読む
 * （顧客・作成者と同じ扱い — 行に複写すると乖離するため）。
 */

import { prisma } from "./db";

/** Select の選択肢（Mantine の `data` にそのまま渡せる形）。 */
export interface SalesRepOption {
  value: string;
  label: string;
}

/** 書類に載る営業担当の表示用スナップショット。 */
export interface SalesRepView {
  id: string;
  name: string;
}

type UserLike = { id: string; displayName: string } | null | undefined;

/** 書類の `salesRep` リレーションを表示用に落とす（未設定は null）。 */
export function toSalesRepView(user: UserLike): SalesRepView | null {
  return user ? { id: user.id, name: user.displayName } : null;
}

/**
 * 顧客に登録されている営業担当の候補。
 *
 * `isPrimary` → `sortOrder` → 表示名 の順。書類フォームの Select はこの
 * 一覧から選ばせる（顧客未選択・候補ゼロなら空配列）。
 */
export async function listCustomerSalesReps(
  bpId: string | null | undefined,
): Promise<SalesRepOption[]> {
  if (!bpId) return [];
  const rows = await prisma.bpSalesRep.findMany({
    where: { bpId },
    include: { user: { select: { id: true, displayName: true } } },
    orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }],
  });
  return rows.map((r) => ({ value: r.user.id, label: r.user.displayName }));
}

/**
 * 新規書類の既定営業担当 — 顧客の主担当。主担当が未設定なら候補の先頭
 * （候補が 1 名だけの顧客で毎回選ばせないため）。候補ゼロなら null。
 */
export async function defaultSalesRepId(
  bpId: string | null | undefined,
): Promise<string | null> {
  if (!bpId) return null;
  const row = await prisma.bpSalesRep.findFirst({
    where: { bpId },
    orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }],
    select: { userId: true },
  });
  return row?.userId ?? null;
}

/**
 * 保存する営業担当を決める — **全書類の Server Action はこれを通す**。
 *
 * 明示指定があればそれ。無い場合は、顧客が変わったときだけその顧客の主担当を
 * 入れる（新規作成 = `priorCustomerBpId` が null なので必ず主担当が入る。
 * 取込直後に顧客が確定した瞬間も「変わった」に含まれる）。顧客が同じまま空で
 * 送られてきたのは利用者が意図的に外したときなので、勝手に戻さない。
 */
export async function resolveSalesRepId(
  salesRepId: string | null | undefined,
  customerBpId: string | null | undefined,
  priorCustomerBpId: string | null | undefined,
): Promise<string | null> {
  const explicit = salesRepId?.trim();
  if (explicit) return explicit;
  if (customerBpId && customerBpId !== priorCustomerBpId) {
    return await defaultSalesRepId(customerBpId);
  }
  return null;
}

/**
 * 営業担当の候補として選べるユーザー — 有効な社員アカウント。
 * 顧客マスタ（MS01）の担当一覧エディタが使う。
 */
export async function listSalesRepCandidates(): Promise<SalesRepOption[]> {
  const rows = await prisma.user.findMany({
    where: { isActive: true, group: "EMPLOYEE" },
    orderBy: { username: "asc" },
    select: { id: true, displayName: true },
  });
  return rows.map((u) => ({ value: u.id, label: u.displayName }));
}

/** 顧客に紐づく営業担当の入力 1 件（順序は配列の並び）。 */
export interface SalesRepAssignmentInput {
  userId: string;
  isPrimary: boolean;
}

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

/**
 * 顧客の営業担当一覧を入力どおりに置き換える。
 *
 * 主担当は 0 or 1 名（DB 側にも部分 unique index があるので、先頭の 1 件
 * だけを採用して残りは降格する）。`sortOrder` は配列の並び。
 */
export async function syncCustomerSalesReps(
  tx: Tx,
  bpId: string,
  reps: SalesRepAssignmentInput[],
): Promise<void> {
  const seen = new Set<string>();
  const unique = reps.filter((r) => {
    if (!r.userId || seen.has(r.userId)) return false;
    seen.add(r.userId);
    return true;
  });
  const primaryIndex = unique.findIndex((r) => r.isPrimary);
  // 主担当の指定が無ければ先頭を主担当に繰り上げる（既定値が引けるように）。
  const primaryAt = primaryIndex === -1 && unique.length > 0 ? 0 : primaryIndex;

  await tx.bpSalesRep.deleteMany({
    where: { bpId, userId: { notIn: unique.map((r) => r.userId) } },
  });
  // 部分 unique index（bp あたり主担当 1 名）に引っかからないよう、先に
  // 全件を非主担当へ落としてから主担当を立てる。
  for (const [i, rep] of unique.entries()) {
    const data = { isPrimary: false, sortOrder: i };
    await tx.bpSalesRep.upsert({
      where: { bpId_userId: { bpId, userId: rep.userId } },
      create: { bpId, userId: rep.userId, ...data },
      update: data,
    });
  }
  if (primaryAt >= 0) {
    await tx.bpSalesRep.update({
      where: { bpId_userId: { bpId, userId: unique[primaryAt].userId } },
      data: { isPrimary: true },
    });
  }
}
