/**
 * data.ts — 入出庫伝票 (PD07) のサーバーサイド取得・マッピング。
 *
 * inventory_movements は指示書と同型 — uuid を主キーに、表示番号
 * MOV-YYYYMM-NNNNN は (year_month, seq) から導出（lib/doc-number.ts）。
 * 明細（inventory_transactions.movement_id 逆参照）の inventoryId は
 * product_inventory / material_inventory の**バケット id**を指す多態参照
 * （inventoryType が決める）なので、詳細では2回のバッチ findMany で解決する
 * （N+1 回避）。Prisma Decimal（明細の quantity）はここで Number() へ変換
 * してからクライアントへ渡す。
 */

import { ownOrPlantWhere, rowInScope } from "@ckk/authz-core";
import type {
  MovementDetail,
  MovementLineRow,
  MovementRow,
} from "@/components/inventory/movements/model";
import { checkPermission } from "@/lib/authz";
import { type Prisma, prisma } from "@/lib/db";
import {
  type DocKey,
  formatMovementNumber,
  parseDocKey,
} from "@/lib/doc-number";
import { type LocalizedText, localized } from "@/lib/format";
import { storageLabelOf } from "../products/data";

export {
  fetchPlantOptions,
  type Option,
} from "../../production/work-orders/data";

// 一覧クエリの取得上限（他の一覧と同じ方針 — DataTable はクライアントページング）。
//
// **この画面は他のどの一覧より早く上限に当たる。** 伝票は在庫が動くたびに 1 枚
// 出るので、見積書や発注書のような「人が起こす書類」とは桁が違う。黙って切ると
// 台帳として嘘をつくことになるので、切れたことを画面に出す（truncated）。
// 本気で足りなくなったらサーバー側ページングへ移すこと — そのときは他の一覧も
// 一緒に直す話になるので、ここだけ先に別方式にはしていない。
const LIST_FETCH_CAP = 1000;

// InventoryMovement.createdBy は生の uuid 列（User への relation は無い —
// 移行期間中に null で INSERT され得るため、他書類のような createdByUser
// include ではなくバッチ findMany で名前を引く。
const MOVEMENT_INCLUDE = {
  plant: true,
  _count: { select: { lines: true } },
};

function findRow(key: DocKey) {
  return prisma.inventoryMovement.findUnique({
    where: { yearMonth_seq: { yearMonth: key.yearMonth, seq: key.seq } },
    include: MOVEMENT_INCLUDE,
  });
}

type MovementDbRow = NonNullable<Awaited<ReturnType<typeof findRow>>>;

function mapMovement(
  r: MovementDbRow,
  createdByName: string | null,
): MovementRow {
  const number = formatMovementNumber({ yearMonth: r.yearMonth, seq: r.seq });
  return {
    id: number,
    movementNumber: number,
    cause: r.cause,
    plantId: r.plantId,
    plantName: r.plant
      ? `${r.plant.code} ${localized(r.plant.name as LocalizedText | null)}`
      : null,
    sourceType: r.sourceType,
    sourceId: r.sourceId,
    lineCount: r._count.lines,
    notes: r.notes,
    createdByName,
    createdAt: r.createdAt.toISOString(),
  };
}

/** createdBy（uuid 列, User への relation 無し）→ 表示名のバッチ解決。 */
async function resolveCreatedByNames(
  createdByIds: readonly (string | null)[],
): Promise<Map<string, string>> {
  const ids = [...new Set(createdByIds.filter((id): id is string => !!id))];
  if (ids.length === 0) return new Map();
  const users = await prisma.user.findMany({
    where: { id: { in: ids } },
    select: { id: true, displayName: true },
  });
  return new Map(users.map((u) => [u.id, u.displayName]));
}

export interface MovementListResult {
  rows: MovementRow[];
  /** 取得上限で切れたか（= まだ古い伝票がある）。 */
  truncated: boolean;
}

/** 一覧 (PD07) — 新しい順。スコープ（RBAC）: 拠点 OR 自分の作成分。 */
export async function fetchInventoryMovements(): Promise<MovementListResult> {
  const authz = await checkPermission("inventory", "READ");
  if (!authz.ok) return { rows: [], truncated: false };
  const rows = await prisma.inventoryMovement.findMany({
    take: LIST_FETCH_CAP,
    where: ownOrPlantWhere(authz.access, authz.userId, {
      plantColumn: "plantId",
      ownColumn: "createdBy",
    }) as Prisma.InventoryMovementWhereInput,
    include: MOVEMENT_INCLUDE,
    orderBy: [{ yearMonth: "desc" }, { seq: "desc" }],
  });
  const names = await resolveCreatedByNames(rows.map((r) => r.createdBy));
  return {
    rows: rows.map((r) => mapMovement(r, names.get(r.createdBy ?? "") ?? null)),
    truncated: rows.length === LIST_FETCH_CAP,
  };
}

/** 詳細 (PD27) — id = 導出文書番号 MOV-YYYYMM-NNNNN。未存在・不正形式は null。 */
export async function fetchInventoryMovement(
  id: string,
): Promise<MovementDetail | null> {
  const key = parseDocKey(id, "MOV");
  if (!key) return null;
  const authz = await checkPermission("inventory", "READ");
  if (!authz.ok) return null;
  const row = await findRow(key);
  if (!row) return null;
  if (
    !rowInScope(
      authz.access,
      { plantIds: [row.plantId], createdBy: row.createdBy },
      authz.userId,
    )
  ) {
    return null;
  }

  const txRows = await prisma.inventoryTransaction.findMany({
    where: { movementId: row.id },
    orderBy: { createdAt: "asc" },
  });

  // 在庫は 1 表（app.item_inventory）になったので、種別で 2 回引く必要はない。
  // 明細 1 行ずつ引くと N+1 になるので、まとめて 1 回。
  const bucketIds = [...new Set(txRows.map((t) => t.inventoryId))];
  const buckets = bucketIds.length
    ? // custody-scope: / owner-scope: 伝票の明細が指しているバケットを引くだけ。
      // 外注の預けバケットも顧客の預り品もそのまま出す（伝票がそれを指している）。
      await prisma.itemInventory.findMany({
        where: { id: { in: bucketIds } },
        include: { item: true, storageLocation: true, shelf: true },
      })
    : [];
  const bucketMap = new Map(buckets.map((b) => [b.id, b]));

  const lines: MovementLineRow[] = txRows.map((t) => {
    const bucket = bucketMap.get(t.inventoryId);
    return {
      id: t.id,
      transactionType: t.transactionType,
      inventoryType: t.inventoryType,
      itemName: bucket
        ? localized(bucket.item.name as LocalizedText | null)
        : "—",
      lotNumber: bucket?.lotNumber ?? null,
      locationLabel: bucket ? storageLabelOf(bucket) : null,
      quantity: Number(t.quantity),
      // バケットが引けない行は品目名も "—" になる。単位だけ勝手に補うと
      // その単位で計上されたように読めるので、分からないものは空にする。
      unit: bucket?.unit ?? "",
      notes: t.notes,
    };
  });

  const names = await resolveCreatedByNames([row.createdBy]);
  return {
    ...mapMovement(row, names.get(row.createdBy ?? "") ?? null),
    lines,
  };
}
