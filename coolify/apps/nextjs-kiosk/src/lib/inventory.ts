/**
 * inventory.ts — 在庫引当・予約ロジック（§4・§5・§7）。server-only.
 *
 * 増減は必ず applyTransaction 経由（inventory_transactions が唯一の記録、
 * キャッシュ数量を同一 tx で更新）。実在庫は全工程完了時にのみ動く:
 * - onWorkOrderCompleted: 完成品をロット入庫 + 半製品バケットを入庫、
 *   予約 RESERVED → CONFIRMED。
 * - onDeliveryOrderShipped: DISPATCH は出庫 + 予約 RELEASE。STOCK_STORAGE は
 *   保管拠点へ入庫（請求フロー外）。
 * - reserveProductStock: §4 二段照合 → 引当予約（不足分は指示書分割の材料）。
 *
 * **すべての取引行は入出庫伝票（inventory_movements）に属する。** 伝票は在庫の
 * 増減と同じトランザクションで作られる — applyTransaction が伝票 id を必須で
 * 受け取るので、伝票の無い計上は型で書けない。番号だけは他の書類と同じく
 * トランザクションの外で採番し（allocateDocumentKey("INVENTORY_MOVEMENT")）、
 * 呼び出し側が MovementKey として渡す。
 */

import type { Prisma as PrismaNS } from "../../generated/client/client";
import { getCurrentActorId, recordAudit } from "./audit";
import { prisma } from "./db";
import {
  allocateFromBuckets,
  splitScrapShare,
} from "./inventory-availability-core";
import { encodeInventoryNote } from "./inventory-note-core";
import {
  computeBranchSemiFinishedQuantity,
  computeFinishedQuantity,
  SEMI_FINISHED_ISSUE_STEP_CODE,
  STEP_LINK_STATE_SELECT,
  STEP_STATE_SELECT,
  toStepState,
} from "./workflow-core";

type Tx = PrismaNS.TransactionClient;

/** 入出庫伝票の事由。DB の app."INVENTORY_MOVEMENT_CAUSE" と同じ集合。 */
export type MovementCause =
  | "WORK_ORDER_COMPLETION"
  | "DELIVERY_SHIPMENT"
  | "MATERIAL_RECEIPT"
  | "STOCK_TRANSFER"
  | "STOCK_RESERVATION"
  | "RESERVATION_RELEASE"
  | "ADJUSTMENT"
  /// 手動入出庫（ST06）。業務としてどの型かは movementTypeId が持つ。
  | "MANUAL"
  /// 外注へ出した / 外注から戻った（預け在庫の増減）。
  | "OUTSOURCE_ISSUE"
  | "OUTSOURCE_RETURN"
  /// 出荷後の返品（在庫が戻る）。
  | "SALES_RETURN"
  | "OTHER";

/** allocateDocumentKey("INVENTORY_MOVEMENT") の戻り値。 */
export interface MovementKey {
  yearMonth: string;
  seq: number;
}

export interface MovementInit {
  key: MovementKey;
  cause: MovementCause;
  /** 元書類のテーブル名（audit_logs と同じ多態規約）。 */
  sourceType?: string | null;
  /** 元書類の業務キー（詳細 URL の id と同じ文字列）。 */
  sourceId?: string | null;
  plantId?: number | null;
  /**
   * 手動入出庫（ST06）で選んだ移動タイプ。自動生成の伝票では省く。
   * **cause と役割が違う** — cause は「どの処理が起こしたか」、移動タイプは
   * 業務としてどの型か（利用者が増やせる番号）。
   */
  movementTypeId?: number | null;
  notes?: string;
}

/**
 * 伝票を 1 枚起こす。**呼び出し側の tx の中で**作ること — 在庫だけ動いて伝票が
 * 無い（またはその逆）状態を作らないため。
 */
export async function createMovement(
  tx: Tx,
  init: MovementInit,
): Promise<string> {
  const actor = await getCurrentActorId();
  const row = await tx.inventoryMovement.create({
    data: {
      yearMonth: init.key.yearMonth,
      seq: init.key.seq,
      cause: init.cause,
      sourceType: init.sourceType ?? null,
      sourceId: init.sourceId ?? null,
      plantId: init.plantId ?? null,
      movementTypeId: init.movementTypeId ?? null,
      notes: init.notes,
      createdBy: actor,
    },
    select: { id: true },
  });
  return row.id;
}

/** 最初に必要になったときだけ伝票を起こす遅延オープナー。 */
export type MovementOpener = () => Promise<string>;

/**
 * 伝票の遅延生成。1 件も計上しなかった出来事（良品ゼロの完了、解放すべき予約が
 * 無いキャンセル）で**空の伝票を残さない**ため、最初の applyTransaction まで
 * INSERT を遅らせる。採番だけは先に済んでいるので、その番号は欠番になる
 * — 全書類共通の作法（ロールバックでも番号は飛ぶ）。
 */
export function movementOpener(tx: Tx, init: MovementInit): MovementOpener {
  let id: string | null = null;
  return async () => {
    if (id == null) id = await createMovement(tx, init);
    return id;
  };
}

export interface ApplyTransactionInput {
  inventoryType: "PRODUCT" | "MATERIAL";
  inventoryId: string;
  transactionType: "IN" | "OUT" | "RESERVE" | "RELEASE" | "ADJUST";
  quantity: number; // 正の数（方向は type が決める）
  referenceType?: string;
  referenceId?: string;
  notes?: string;
  /**
   * 台帳が足りなくても**マイナスのまま**計上する（既定 false）。
   *
   * 渡すのは出荷だけ。物はもう出て行っているので、台帳が止めても現実は
   * 止まらない — 止めると「出荷したのに記録が無い」という、あとから誰にも
   * 見えない形の食い違いになる。マイナスは在庫一覧にも棚卸にも**見える形**
   * で残り、数え直せば直る。
   */
  allowNegative?: boolean;
}

/**
 * 在庫取引の適用: 台帳行 + キャッシュ数量/予約数量の更新を同一 tx で行う。
 * IN/OUT → quantity、RESERVE/RELEASE → reserved_quantity、ADJUST → quantity 直加算。
 *
 * `movementId` は必須 — 伝票に属さない計上を作れないようにするための型の門。
 * DB 側は移行完了後に movement_id を NOT NULL にして同じことを二重に守る。
 */
export async function applyTransaction(
  tx: Tx,
  movementId: string,
  input: ApplyTransactionInput,
): Promise<void> {
  const actor = await getCurrentActorId();
  await tx.inventoryTransaction.create({
    data: {
      movementId,
      inventoryType: input.inventoryType,
      inventoryId: input.inventoryId,
      transactionType: input.transactionType,
      quantity: input.quantity,
      referenceType: input.referenceType,
      referenceId: input.referenceId,
      notes: input.notes,
      createdBy: actor,
    },
  });

  const deltaQty =
    input.transactionType === "IN"
      ? input.quantity
      : input.transactionType === "OUT"
        ? -input.quantity
        : input.transactionType === "ADJUST"
          ? input.quantity
          : 0;
  const deltaReserved =
    input.transactionType === "RESERVE"
      ? input.quantity
      : input.transactionType === "RELEASE"
        ? -input.quantity
        : 0;

  // 減算（OUT / RELEASE / 負の ADJUST）は残量ガード付き条件更新 —
  // 同時実行でも負在庫にならない（DB の CHECK 制約より手前で明確に失敗）。
  const data = {
    ...(deltaQty !== 0 ? { quantity: { increment: deltaQty } } : {}),
    ...(deltaReserved !== 0
      ? { reservedQuantity: { increment: deltaReserved } }
      : {}),
  };
  const guard = {
    ...(deltaQty < 0 && !input.allowNegative
      ? { quantity: { gte: -deltaQty } }
      : {}),
    ...(deltaReserved < 0 ? { reservedQuantity: { gte: -deltaReserved } } : {}),
  };
  // 在庫は 1 表（app.item_inventory）。**inventoryType はもう書き込み先を選ばない**
  // — 台帳の区分として行に残るだけで、製品・素材で表が分かれていた頃の名残り。
  //
  // custody-scope: id 1 件への加減算。どのバケットかは呼び出し側が決めて
  // いる（預けバケットへの計上もここを通る）。
  const updated = await tx.itemInventory.updateMany({
    where: { id: input.inventoryId, ...guard },
    data,
  });
  if (updated.count !== 1) {
    // 呼び出し側（onDeliveryOrderShippedTx の catch）が message を
    // decodeInventoryNote() で判別して表示用に翻訳する — 生の日本語を
    // messageに残すと string.startsWith() の判定が壊れる。
    throw new Error(
      encodeInventoryNote("insufficientStock", {
        transactionType: input.transactionType,
        quantity: input.quantity,
      }),
    );
  }
}

/**
 * 在庫の失敗メッセージに載せる品目の名乗り。
 *
 * **コードであって内部 id ではない。** 品目 id は密な連番なので、画面に出した
 * ところで受け取った人には何のことか分からず、しかも別の品目の id と区別が
 * つかない。コード（PRD-… / 素材コード）なら検索できる。コードが空の品目は
 * 無いはずだが、念のため id へ落とす。
 */
async function itemLabel(tx: Tx, itemId: number): Promise<string> {
  const row = await tx.item.findUnique({
    where: { id: itemId },
    select: { code: true },
  });
  return row?.code ?? String(itemId);
}

/**
 * 在庫バケットの取得 or 作成（品目 × 拠点 × 保管場所 × 棚 × ロット × 半製品）。
 *
 * **保管場所・棚の既定は「未割当」（null）** — 指示書完了・入荷のような
 * システム入庫は必ず未割当へ入り、場所への配置は在庫移動（ST01）で行う、
 * という元からの約束。引数を省けば従来どおり。
 *
 * ただし**人が場所を指定して動かす経路（手動入出庫 ST06）は渡してくる**。
 * そこで落とすと、利用者が選んだ棚が黙って無視されて未割当に積まれる
 * （画面は成功と言い、在庫は違う場所に出る）ので、受け取れるようにしてある。
 *
 * 製品用・素材用に分かれていた 2 本（と、その間を埋めていた継ぎ目
 * ensureItemBucket）を 1 本にした。**品目種別で分岐しない**のが統合の意味。
 *
 * 単位は行に持つ。既存バケットと違う単位で足そうとしたら**足さずに失敗する** —
 * 「本」の台帳に「kg」を足すと数量の意味が消える。message は構造化ノート
 * （unitMismatch）で、呼び出し側が自分の言語に翻訳する。
 */
export async function ensureItemInventory(
  tx: Tx,
  data: {
    itemId: number;
    plantId: number | null;
    /** 単位。省略時は品目マスタの単位。 */
    unit?: string;
    /** ロット = 指示書番号（素材は null）。 */
    lotNumber?: number | null;
    isSemiFinished?: boolean;
    sourceStepId?: string | null;
    /** 省略 = 未割当。手動入出庫だけが指定する。 */
    storageLocationId?: number | null;
    shelfId?: number | null;
    /**
     * 預け先（外注先が持っている分）。省略 = 自社の在庫。
     * **入れたバケットは自社在庫ではない** — 手持ち・引当・出荷・棚卸から
     * 外れる（読み出し側が `custodyBpId: null` で絞る）。
     */
    custodyBpId?: string | null;
  },
): Promise<string> {
  const bucket = {
    itemId: data.itemId,
    plantId: data.plantId,
    lotNumber: data.lotNumber ?? null,
    isSemiFinished: data.isSemiFinished ?? false,
    storageLocationId: data.storageLocationId ?? null,
    shelfId: data.shelfId ?? null,
    custodyBpId: data.custodyBpId ?? null,
  };

  const unit =
    data.unit ??
    (
      await tx.item.findUniqueOrThrow({
        where: { id: data.itemId },
        select: { unit: true },
      })
    ).unit;

  const assertUnit = (row: { id: string; unit: string }): string => {
    if (row.unit !== unit) {
      throw new Error(
        encodeInventoryNote("unitMismatch", {
          expected: row.unit,
          actual: unit,
        }),
      );
    }
    return row.id;
  };

  // custody-scope: `bucket` に custodyBpId が入っている（省略時は null =
  // 自社）。鍵そのものなので、ここで別に絞る余地は無い。
  const existing = await tx.itemInventory.findFirst({
    where: bucket,
    select: { id: true, unit: true },
  });
  if (existing) return assertUnit(existing);
  try {
    const row = await tx.itemInventory.create({
      data: { ...bucket, unit, sourceStepId: data.sourceStepId ?? null },
      select: { id: true },
    });
    return row.id;
  } catch (e) {
    // 同時 ensure の一意制約競合（NULLS NOT DISTINCT index）→ 再取得
    if ((e as { code?: string }).code === "P2002") {
      // custody-scope: 同上（同じ鍵での引き直し）。
      const again = await tx.itemInventory.findFirst({
        where: bucket,
        select: { id: true, unit: true },
      });
      if (again) return assertUnit(again);
    }
    throw e;
  }
}

/** 返ってきた 1 行（出荷明細の品目・ロットに対応する）。 */
export interface DeliveryReturnLine {
  itemId: number;
  lotNumber: number | null;
  quantity: number;
}

/**
 * 出荷後の返品を在庫に戻す（逆仕訳の伝票 1 枚）。
 *
 * **出荷書は動かさない。** 出したという事実は返品では消えない — 状態を
 * DRAFT へ戻すような「無かったこと」にする作りにすると、納品書も請求も
 * 巻き戻す話になり、伝票の意味が変わる。ここは在庫だけを戻す。
 *
 * 戻す先は**出荷元の拠点の、同じロット**。保管場所は未割当（システム入庫の
 * 既定）— 返品の品をどの棚へ置くかは人が決めることなので、在庫移動で運ぶ。
 */
export async function onDeliveryOrderReturnedTx(
  tx: Tx,
  key: { yearMonth: string; seq: number },
  movementKey: MovementKey,
  args: { lines: readonly DeliveryReturnLine[]; plantId: number | null },
): Promise<void> {
  const ref = `DOR-${key.yearMonth}-${String(key.seq).padStart(5, "0")}`;
  const openMovement = movementOpener(tx, {
    key: movementKey,
    cause: "SALES_RETURN",
    sourceType: "delivery_orders",
    sourceId: ref,
    plantId: args.plantId,
  });
  for (const line of args.lines) {
    if (line.quantity <= 0) continue;
    const inventoryId = await ensureItemInventory(tx, {
      itemId: line.itemId,
      plantId: args.plantId,
      lotNumber: line.lotNumber,
      isSemiFinished: false,
    });
    await applyTransaction(tx, await openMovement(), {
      inventoryType: "PRODUCT",
      inventoryId,
      transactionType: "IN",
      quantity: line.quantity,
      referenceType: "delivery_order",
      referenceId: ref,
      notes: encodeInventoryNote("salesReturned", { ref }),
    });
  }
}

// ─── 外注の預け在庫 ─────────────────────────────────────────────────────────
//
// 「いまこの外注先が何本持っているか」に答えるための台帳。**自社在庫の別の
// 置き場ではない** — 仕掛品はそもそも台帳に無いので、外注へ出すときに
// 自社在庫から引ける行が存在しない。引き算の相手がいないのに移動として
// 書くと、出したことのない在庫を出したことにしてしまう。
//
// なので預けバケット（custody_bp_id 付き）への IN / OUT だけで閉じる。
// 自社在庫の集計からは読み出し側が外す（`custodyBpId: null`）。

/**
 * 外注の預けバケット。ロット = 指示書番号。
 *
 * **拠点は「出した拠点」を入れる。** 物は社外にあるので拠点を持たせない案も
 * あったが、持たせないと拠点スコープの利用者（`plantWhere`）からこの行が
 * 丸ごと消え、自分の拠点が出した預け在庫を誰も見られなくなる。自社在庫と
 * 混ざらないのは custody_bp_id が別バケットにするからで、拠点とは関係ない。
 */
async function custodyBucket(
  tx: Tx,
  args: {
    itemId: number;
    supplierBpId: string;
    lotNumber: number;
    plantId: number | null;
  },
): Promise<string> {
  return ensureItemInventory(tx, {
    itemId: args.itemId,
    plantId: args.plantId,
    lotNumber: args.lotNumber,
    custodyBpId: args.supplierBpId,
  });
}

export interface OutsourceMoveArgs {
  workOrderId: string;
  workOrderNumber: number;
  itemId: number;
  supplierBpId: string;
  /** 出した（戻った）本数。 */
  quantity: number;
  /** 出した拠点（伝票の拠点。バケットは社外なので持たない）。 */
  plantId?: number | null;
}

/**
 * 外注へ出した分を預け在庫に載せる。伝票 id を返す（計上しなければ null）。
 *
 * 呼び出し側はこの id を工程に控えること — **日付の有無では判断できない**。
 * 依頼日は後から直せるので、直すたびに預け在庫が増えてしまう。
 */
export async function onOutsourceIssueTx(
  tx: Tx,
  movementKey: MovementKey,
  args: OutsourceMoveArgs,
): Promise<string | null> {
  if (args.quantity <= 0) return null;
  const openMovement = movementOpener(tx, {
    key: movementKey,
    cause: "OUTSOURCE_ISSUE",
    sourceType: "work_orders",
    sourceId: String(args.workOrderNumber),
    plantId: args.plantId ?? null,
  });
  const movementId = await openMovement();
  await applyTransaction(tx, movementId, {
    inventoryType: "PRODUCT",
    inventoryId: await custodyBucket(tx, {
      itemId: args.itemId,
      supplierBpId: args.supplierBpId,
      lotNumber: args.workOrderNumber,
      plantId: args.plantId ?? null,
    }),
    transactionType: "IN",
    quantity: args.quantity,
    referenceType: "work_order",
    referenceId: args.workOrderId,
    notes: encodeInventoryNote("outsourceIssued", {
      workOrderNumber: args.workOrderNumber,
    }),
  });
  return movementId;
}

/**
 * 外注から戻った分を預け在庫から落とす。伝票 id を返す。
 *
 * 預けた数より多くは戻せない（台帳が負になる）。多く入力されたら**あるだけ**
 * 落として警告に留める — 戻ってきた物を「受け取れない」と言うほうが嘘になる。
 */
export async function onOutsourceReturnTx(
  tx: Tx,
  movementKey: MovementKey,
  args: OutsourceMoveArgs,
): Promise<string | null> {
  if (args.quantity <= 0) return null;
  const bucketId = await custodyBucket(tx, {
    itemId: args.itemId,
    supplierBpId: args.supplierBpId,
    lotNumber: args.workOrderNumber,
    plantId: args.plantId ?? null,
  });
  const held = Number(
    (
      await tx.itemInventory.findUnique({
        where: { id: bucketId },
        select: { quantity: true },
      })
    )?.quantity ?? 0,
  );
  const take = Math.min(held, args.quantity);
  if (take <= 0) return null;
  if (take < args.quantity) {
    console.warn(
      // i18n-ignore — サーバーログのみ（画面には出ない）
      `[inventory] 外注戻りが預け数を超えている（${args.quantity} > ${held}）: WO #${args.workOrderNumber}`,
    );
  }
  const openMovement = movementOpener(tx, {
    key: movementKey,
    cause: "OUTSOURCE_RETURN",
    sourceType: "work_orders",
    sourceId: String(args.workOrderNumber),
    plantId: args.plantId ?? null,
  });
  const movementId = await openMovement();
  await applyTransaction(tx, movementId, {
    inventoryType: "PRODUCT",
    inventoryId: bucketId,
    transactionType: "OUT",
    quantity: take,
    referenceType: "work_order",
    referenceId: args.workOrderId,
    notes: encodeInventoryNote("outsourceReturned", {
      workOrderNumber: args.workOrderNumber,
    }),
  });
  return movementId;
}

/**
 * 半製品出しの `lot_text` から、狙いのロット番号を読む。
 *
 * 自由記入の欄（工程マスタの既定は入力欄を出さない）なので、**当たれば
 * 優先する程度**にしか使わない。読めなければ null を返して古いロットから
 * 食べる — ここで失敗させると、書き方の揺れで完了できない指示書ができる。
 */
function parseLotHint(lotText: string | null | undefined): number | null {
  if (!lotText) return null;
  const m = lotText.match(/\d+/);
  if (!m) return null;
  const n = Number.parseInt(m[0], 10);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

/**
 * 半製品在庫からの投入分を落とす（完了時）。
 *
 * 取り方は **狙いのロット優先 → 古いロットから**（ロット番号 = 指示書番号なので
 * 昇順が先入れ先出しになる）。拠点が分かっていればその拠点のバケットだけ —
 * 別拠点の半製品を黙って食べると、そちらの棚卸が合わなくなる。
 *
 * 出した数は「完成して戻る分（付け替え）」と「廃棄」に割って 2 行で記録する
 * （splitScrapShare）。合計は同じだが、割らないと廃棄が台帳に現れない。
 *
 * 台帳が足りないときは**あるだけ落として完了は止めない** — 素材消費と同じ方針。
 * 止めると、現場では終わっている指示書が画面の上だけ終われなくなる。
 */
async function consumeSemiFinishedStock(
  tx: Tx,
  openMovement: MovementOpener,
  args: {
    workOrderId: string;
    workOrderNumber: number;
    itemId: number;
    plantId: number | null;
    quantity: number;
    scrap: number;
    lotHint: number | null;
  },
): Promise<void> {
  const buckets = await tx.itemInventory.findMany({
    where: {
      itemId: args.itemId,
      isSemiFinished: true,
      quantity: { gt: 0 },
      // 自社の棚にある半製品だけ。外注が預かっている分は投入できない。
      custodyBpId: null,
      ...(args.plantId != null ? { plantId: args.plantId } : {}),
    },
    select: { id: true, lotNumber: true, quantity: true },
    orderBy: [{ lotNumber: "asc" }, { updatedAt: "asc" }],
  });
  const ordered =
    args.lotHint == null
      ? buckets
      : [...buckets].sort(
          (a, b) =>
            Number(b.lotNumber === args.lotHint) -
            Number(a.lotNumber === args.lotHint),
        );

  let left = args.quantity;
  let reassignLeft = Math.max(0, args.quantity - args.scrap);
  for (const bucket of ordered) {
    if (left <= 0) break;
    const take = Math.min(left, Number(bucket.quantity));
    if (take <= 0) continue;
    const share = splitScrapShare(take, reassignLeft);
    for (const [quantity, key] of [
      [share.reassign, "semiFinishedConsumed"],
      [share.scrap, "semiFinishedScrapped"],
    ] as const) {
      if (quantity <= 0) continue;
      await applyTransaction(tx, await openMovement(), {
        inventoryType: "PRODUCT",
        inventoryId: bucket.id,
        transactionType: "OUT",
        quantity,
        referenceType: "work_order",
        referenceId: args.workOrderId,
        notes: encodeInventoryNote(key, {
          workOrderNumber: args.workOrderNumber,
        }),
      });
    }
    reassignLeft -= share.reassign;
    left -= take;
  }
  if (left > 0) {
    console.warn(
      // i18n-ignore — サーバーログのみ（画面には出ない）
      `[inventory] 半製品の消費を一部スキップ（台帳残不足 残 ${left}）: WO #${args.workOrderNumber}`,
    );
  }
}

/**
 * 全工程完了フック: 最終工程の良品をロット入庫、半製品バケット合計を半製品
 * 入庫。completeStepExecution から呼ぶ。
 * - MANUFACTURE: **この WO の**製品予約を CONFIRMED に（割当明細の予約には
 *   触らない — それは姉妹の在庫分指示書が消費する。割当なしは入庫のみ）。
 * - FROM_STOCK（在庫分）: 受注へ引当済みの在庫ロットを消費（RELEASE + OUT）
 *   して自ロットの IN と相殺する（付け替え — 二重計上を防ぐ）。
 *   在庫分は割当 1 件のみ（work-order-alloc-core の不変条件）。
 */
export async function onWorkOrderCompleted(
  workOrderId: string,
  movementKey: MovementKey,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await onWorkOrderCompletedTx(tx, workOrderId, movementKey);
  });
}

/**
 * onWorkOrderCompleted の tx コア — 指示書の COMPLETED 遷移と**同一**
 * トランザクションで呼ぶ（completeStepExecution / kiosk step-execution）。
 * 計上が失敗すれば遷移ごと巻き戻るので、「COMPLETED なのに在庫が無く、
 * 巻き戻しも拒否される」状態を作らない。
 */
export async function onWorkOrderCompletedTx(
  tx: Tx,
  workOrderId: string,
  movementKey: MovementKey,
): Promise<void> {
  const wo = await tx.workOrder.findUniqueOrThrow({
    where: { id: workOrderId },
    // 工程はエンジンが読む列 + 入庫先の解決に使う plantId だけ
    // （STEP_STATE_SELECT — workflow-core 参照）。全列 SELECT は列追加のたび
    // migration 前の DB で P2022 に落ちる。
    include: {
      steps: {
        select: {
          ...STEP_STATE_SELECT,
          plantId: true,
          // 半製品からの投入を落とすのに要る 2 つ。code は開始工程の判別、
          // lotText はどのロットを出したかの手掛かり（自由記入なので当たれば
          // 優先する程度に使う）。
          lotText: true,
          processStep: { select: { code: true } },
        },
        orderBy: { sortOrder: "asc" },
      },
      stepLinks: { select: STEP_LINK_STATE_SELECT },
      orderLineLinks: {
        select: { orderLineId: true },
        orderBy: { sortOrder: "asc" },
      },
    },
  });
  const linkedLineIds = wo.orderLineLinks.map((l) => l.orderLineId);
  // 完成数 = 良品がどこにも流れない COMPLETED 工程の残良品合計。
  // sortOrder 最大では分岐合流 DAG（合流先が手前に並ぶ場合）で誤るため、
  // グラフ集計の純関数（workflow-core computeFinishedQuantity）で判定する
  // （監査 #15。終端工程から分岐した場合の残良品もここで拾う）。
  const engineSteps = wo.steps.map(toStepState);
  const engineLinks = wo.stepLinks;
  const finishedQty = computeFinishedQuantity(engineSteps, engineLinks);
  // 半製品 = 全工程の半製品バケット合計 + 「半製品在庫で終わる分岐」の終端良品。
  // 後者は完成数に入らない（computeFinishedQuantity が除外している）ので、
  // ここで拾わないと行き場を失う。
  const semiTotal =
    wo.steps.reduce((sum, s) => sum + (s.outputDefectSemiFinished ?? 0), 0) +
    computeBranchSemiFinishedQuantity(engineSteps, engineLinks);
  // 廃棄された数（全工程の合計）。**在庫から投入した指示書でだけ**台帳に
  // 現れる — 製造分の仕掛品は元々台帳に無いので、そこでの廃棄は在庫の
  // 出来事ではない（素材は予約ぶんを丸ごと消費済み。ここで廃棄も引くと
  // 二重に減る）。
  const scrapTotal = wo.steps.reduce(
    (sum, s) => sum + (s.outputDefectScrap ?? 0),
    0,
  );
  const plantId = wo.steps.find((s) => s.plantId != null)?.plantId ?? null;

  // この完了で動く在庫はすべて 1 枚の伝票に入る（完成品の入庫・半製品の入庫・
  // 材料の消費・在庫分の付け替え）。1 回の出来事だから 1 枚。
  const openMovement = movementOpener(tx, {
    key: movementKey,
    cause: "WORK_ORDER_COMPLETION",
    sourceType: "work_orders",
    sourceId: String(wo.workOrderNumber),
    plantId,
  });

  if (finishedQty > 0) {
    const invId = await ensureItemInventory(tx, {
      itemId: wo.productItemId,
      plantId,
      lotNumber: wo.workOrderNumber,
      isSemiFinished: false,
    });
    await applyTransaction(tx, await openMovement(), {
      inventoryType: "PRODUCT",
      inventoryId: invId,
      transactionType: "IN",
      quantity: finishedQty,
      referenceType: "work_order",
      referenceId: wo.id,
      notes: encodeInventoryNote("workOrderCompletedFinished", {
        workOrderNumber: wo.workOrderNumber,
      }),
    });
  }
  if (semiTotal > 0) {
    const semiStep =
      wo.steps.find((s) => (s.outputDefectSemiFinished ?? 0) > 0) ??
      wo.steps.find((s) => s.branchStockDisposition === "SEMI_FINISHED");
    const invId = await ensureItemInventory(tx, {
      itemId: wo.productItemId,
      plantId,
      lotNumber: wo.workOrderNumber,
      isSemiFinished: true,
      sourceStepId: semiStep?.id ?? null,
    });
    await applyTransaction(tx, await openMovement(), {
      inventoryType: "PRODUCT",
      inventoryId: invId,
      transactionType: "IN",
      quantity: semiTotal,
      referenceType: "work_order",
      referenceId: wo.id,
      notes: encodeInventoryNote("workOrderCompletedSemiFinished", {
        workOrderNumber: wo.workOrderNumber,
      }),
    });
  }
  // ── 半製品からの投入を在庫から落とす ─────────────────────────────────
  //
  // 半製品在庫は**増える一方だった**。出す工程（半製品出し）は受入数を記録
  // するのに、その数を在庫から引く経路がどこにも無く、棚卸で「説明のつかない
  // 差異」として消しても翌月また同じだけ積み上がる。
  //
  // 落とすのは完了時 — 素材の消費と同じ。在庫は全工程完了時にしか動かさない
  // のがこの台帳の約束で、半製品だけ先に落とすと巻き戻せない中間状態ができる。
  const semiIssueStep = wo.steps.find(
    (s) =>
      s.processStep?.code === SEMI_FINISHED_ISSUE_STEP_CODE &&
      s.status !== "CANCELLED",
  );
  const semiIssueQty = semiIssueStep?.inputQuantity ?? 0;
  if (semiIssueStep && semiIssueQty > 0) {
    await consumeSemiFinishedStock(tx, openMovement, {
      workOrderId: wo.id,
      workOrderNumber: wo.workOrderNumber,
      itemId: wo.productItemId,
      plantId,
      quantity: semiIssueQty,
      scrap: scrapTotal,
      lotHint: parseLotHint(semiIssueStep.lotText),
    });
  }

  // ── 外注に預けたままの分を戻す ─────────────────────────────────────────
  //
  // 全工程が完了しているなら、外注へ出した物は戻っている（戻らなければ
  // その工程は完了できない）。入荷日を入れ忘れただけで預け在庫が永久に
  // 残ると、「外注先が何を持っているか」の答えが嘘になる。
  //
  // この行の事由は OUTSOURCE_RETURN ではなく **完了の伝票の中**に入る —
  // 1 回の出来事（完了）で起きたことだから。戻したこと自体は備考で分かる。
  const openCustody = await tx.itemInventory.findMany({
    where: {
      itemId: wo.productItemId,
      lotNumber: wo.workOrderNumber,
      custodyBpId: { not: null },
      quantity: { gt: 0 },
    },
    select: { id: true, quantity: true },
  });
  for (const bucket of openCustody) {
    await applyTransaction(tx, await openMovement(), {
      inventoryType: "PRODUCT",
      inventoryId: bucket.id,
      transactionType: "OUT",
      quantity: Number(bucket.quantity),
      referenceType: "work_order",
      referenceId: wo.id,
      notes: encodeInventoryNote("outsourceReturnedOnCompletion", {
        workOrderNumber: wo.workOrderNumber,
      }),
    });
  }
  if (openCustody.length > 0) {
    // 工程からも伝票を辿れるようにしておく（戻りの印がないままだと、
    // あとから入荷日を入れたときに二重で戻してしまう）。
    await tx.workOrderStep.updateMany({
      where: {
        workOrderId: wo.id,
        outsourceIssueMovementId: { not: null },
        outsourceReturnMovementId: null,
      },
      data: { outsourceReturnMovementId: await openMovement() },
    });
  }

  // 素材予約の消費（監査 P2-1）: この WO の MATERIAL 予約を RELEASE +
  // OUT（実消費）。台帳が実態より少ない場合は OUT をスキップして警告
  // （完了を止めない — 素材台帳は運用中に追いつく）。
  const materialReservations = await tx.inventoryReservation.findMany({
    where: {
      workOrderId: wo.id,
      inventoryType: "MATERIAL",
      status: "RESERVED",
    },
  });
  for (const r of materialReservations) {
    await applyTransaction(tx, await openMovement(), {
      inventoryType: "MATERIAL",
      inventoryId: r.inventoryId,
      transactionType: "RELEASE",
      quantity: Number(r.quantity),
      referenceType: "work_order",
      referenceId: wo.id,
      notes: encodeInventoryNote(
        "workOrderCompletedMaterialReservationReleased",
        {
          workOrderNumber: wo.workOrderNumber,
        },
      ),
    });
    // PG は tx 内エラー後の継続が不可のため、残量を事前確認してから OUT。
    // 台帳が実態より少なければ残量分だけ消費（不足分は警告のみ — 完了を
    // 止めない。素材台帳は運用で追いつく）。
    const inv = await tx.itemInventory.findUnique({
      where: { id: r.inventoryId },
      select: { quantity: true },
    });
    const consume = Math.min(Number(inv?.quantity ?? 0), Number(r.quantity));
    if (consume > 0) {
      await applyTransaction(tx, await openMovement(), {
        inventoryType: "MATERIAL",
        inventoryId: r.inventoryId,
        transactionType: "OUT",
        quantity: consume,
        referenceType: "work_order",
        referenceId: wo.id,
        notes: encodeInventoryNote("workOrderMaterialConsumed", {
          workOrderNumber: wo.workOrderNumber,
        }),
      });
    }
    if (consume < Number(r.quantity)) {
      console.warn(
        // i18n-ignore — サーバーログのみ（画面には出ない）
        `[inventory] 素材消費を一部スキップ（台帳残不足 ${consume}/${Number(r.quantity)}）: WO #${wo.workOrderNumber}`,
      );
    }
    await tx.inventoryReservation.update({
      where: { id: r.id },
      data: { status: "RELEASED", releasedAt: new Date() },
    });
  }

  if (wo.type === "FROM_STOCK" && linkedLineIds.length > 0) {
    // 在庫分（FROM_STOCK）: 受注へ引当済みの在庫ロットから受入数分を消費
    // （RELEASE + OUT）— 上の自ロット IN との付け替えで二重計上を防ぐ。
    // 引当/台帳が不足しても完了は止めない（警告のみ — 素材消費と同方針）。
    // 在庫分は割当 1 件のみなので linkedLineIds[0] がその明細。
    const head = wo.steps.find((s) => s.status !== "CANCELLED");
    let needed = head?.inputQuantity ?? wo.plannedQuantity;
    // 出した数のうち、完成して入り直す分（付け替え）の残り。ここを超えた分は
    // **廃棄**として別の行で記録する。以前は全部が付け替えの顔をしていたので、
    // 在庫から出した品が現場で割れても台帳には「出庫 10 / 入庫 7」としか
    // 残らず、3 本の行方を後から言えなかった。
    let reassignLeft = Math.max(0, needed - scrapTotal);
    // 旧バグ（製造分の完了が姉妹の在庫分予約まで CONFIRMED に倒していた）
    // で残った行も消費対象に含める — RESERVED | CONFIRMED の両方を読む。
    const productReservations = await tx.inventoryReservation.findMany({
      where: {
        orderLineId: linkedLineIds[0],
        inventoryType: "PRODUCT",
        status: { in: ["RESERVED", "CONFIRMED"] },
      },
      orderBy: { reservedAt: "asc" },
    });
    for (const r of productReservations) {
      if (needed <= 0) break;
      const inv = await tx.itemInventory.findUnique({
        where: { id: r.inventoryId },
        select: { quantity: true },
      });
      const take = Math.min(
        needed,
        Number(r.quantity),
        Number(inv?.quantity ?? 0),
      );
      if (take > 0) {
        await applyTransaction(tx, await openMovement(), {
          inventoryType: "PRODUCT",
          inventoryId: r.inventoryId,
          transactionType: "RELEASE",
          quantity: take,
          referenceType: "work_order",
          referenceId: wo.id,
          notes: encodeInventoryNote("fromStockConsumedReleased", {
            workOrderNumber: wo.workOrderNumber,
          }),
        });
        const share = splitScrapShare(take, reassignLeft);
        for (const [quantity, key] of [
          [share.reassign, "fromStockConsumedReassigned"],
          [share.scrap, "fromStockScrapped"],
        ] as const) {
          if (quantity <= 0) continue;
          await applyTransaction(tx, await openMovement(), {
            inventoryType: "PRODUCT",
            inventoryId: r.inventoryId,
            transactionType: "OUT",
            quantity,
            referenceType: "work_order",
            referenceId: wo.id,
            notes: encodeInventoryNote(key, {
              workOrderNumber: wo.workOrderNumber,
            }),
          });
        }
        reassignLeft -= share.reassign;
      }
      if (take >= Number(r.quantity)) {
        await tx.inventoryReservation.update({
          where: { id: r.id },
          data: { status: "RELEASED", releasedAt: new Date() },
        });
      } else if (take > 0) {
        await tx.inventoryReservation.update({
          where: { id: r.id },
          data: { quantity: Number(r.quantity) - take },
        });
      }
      needed -= take;
    }
    if (needed > 0) {
      console.warn(
        // i18n-ignore — サーバーログのみ（画面には出ない）
        `[inventory] 在庫分消費を一部スキップ（引当/台帳不足 残 ${needed}）: WO #${wo.workOrderNumber}`,
      );
    }
  } else {
    // 予約 → 確定（§7: 全工程完了時）。**この指示書の予約だけ**を確定する。
    // 割当明細（orderLineId）で広げてはいけない — 明細の製品在庫予約
    // （reserveProductStock）は姉妹の在庫分（FROM_STOCK）指示書が消費する
    // もので、製造分がそれを CONFIRMED に倒すと在庫分の完了時に RESERVED
    // 行が見つからず、付け替えできずにロットを二重計上していた。
    await tx.inventoryReservation.updateMany({
      where: {
        workOrderId: wo.id,
        inventoryType: "PRODUCT",
        status: "RESERVED",
      },
      data: { status: "CONFIRMED", confirmedAt: new Date() },
    });
  }
}

/** 台帳が足りない 1 行ぶん（確認ダイアログと、出荷後の警告の材料）。 */
export interface ShipShortage {
  /** 品目の内部 id。画面から 在庫・所要量 (ST03) へ飛ぶのに使う。 */
  itemId: number;
  /** 品目コード（PRD-… / 素材コード）。画面にはこれを出す。 */
  item: string;
  lotNumber: number | null;
  /** 台帳に無い本数（出せば、この分だけマイナスになる）。 */
  shortfall: number;
}

/** 出荷 1 行ぶんの引き当ての計画（実際に引くのも、数えるだけなのも同じ計算）。 */
interface DispatchPlanLine {
  item: {
    itemId: number;
    lotNumber: number | null;
    quantity: number;
    orderLineId: string | null;
  };
  /** 実在するバケット（無ければ空。**ここでは作らない**）。 */
  buckets: { id: string; quantity: number; reservedQuantity: number }[];
  steps: { bucketId: string; take: number }[];
  shortfall: number;
}

/**
 * 発送（DISPATCH）の各行が、どのバケットから何本引けるかを数える。
 *
 * **出荷そのものと、出荷前の確認が同じ関数を通る。** 別々に書くと、
 * 「確認では足りていたのに出荷したらマイナスになった」（またはその逆）が
 * 起きる — 引ける数の定義（予約を除いた分 + 自分の予約）は 1 か所にしか
 * 置けない。
 */
async function planDispatchLines(
  tx: Tx,
  so: {
    fromPlantId: number | null;
    items: {
      itemId: number;
      lotNumber: number | null;
      quantity: number;
      orderLineId: string | null;
    }[];
  },
): Promise<DispatchPlanLine[]> {
  const plans: DispatchPlanLine[] = [];
  for (const item of so.items) {
    // ロットは保管場所×棚で複数バケットに分かれ得るため、残量のある行から順に。
    //
    // **ロットを指定していない行は、どのロットから出してもよい。** 以前は
    // `lotNumber: null` で引いていたので「ロット無しのバケット」しか当たらず、
    // 製品在庫は指示書番号をロットに持つため該当が 1 行も無く、**ロットを
    // 選ばずに作った出荷書は必ず在庫ゼロ扱い**になっていた（利用者が dev で
    // 踏んだ「在庫台帳がありません」がこれ）。指定が無いのは「どれでもよい」
    // であって「ロット無しのものだけ」ではない。
    //
    // 取る順は 未割当（ロット無し）→ 古いロットから（= 先入れ先出し）。
    // 拠点は**出荷元に限る** — 別の拠点にある物を黙って出したことにすると、
    // そちらの棚卸が合わなくなる（出荷元が未設定のときだけ拠点を問わない）。
    const anyLot = item.lotNumber == null;
    const buckets = (
      await tx.itemInventory.findMany({
        where: {
          itemId: item.itemId,
          ...(anyLot ? {} : { lotNumber: item.lotNumber }),
          ...(anyLot && so.fromPlantId != null
            ? { plantId: so.fromPlantId }
            : {}),
          isSemiFinished: false,
          // 外注が預かっている分からは出荷できない（手元に無い）。
          custodyBpId: null,
        },
        select: { id: true, quantity: true, reservedQuantity: true },
        orderBy: anyLot
          ? [
              { lotNumber: { sort: "asc", nulls: "first" } },
              { quantity: "desc" },
            ]
          : [{ quantity: "desc" }],
      })
    ).map((r) => ({
      id: r.id,
      quantity: Number(r.quantity),
      reservedQuantity: Number(r.reservedQuantity),
    }));

    // 引ける数は **quantity ではなく「予約を除いた分 + 自分の予約」**。
    // quantity をそのまま取ると、他の注文明細（FROM_STOCK の引当など）が
    // 押さえている在庫を先に出荷したほうが食べてしまい、あとから相手が
    // 在庫不足で出せなくなる。判定は lib/inventory-availability-core.ts。
    const ownReserved = new Map<string, number>();
    if (item.orderLineId && buckets.length > 0) {
      const mine = await tx.inventoryReservation.groupBy({
        by: ["inventoryId"],
        where: {
          orderLineId: item.orderLineId,
          inventoryType: "PRODUCT",
          status: { in: ["RESERVED", "CONFIRMED"] },
          inventoryId: { in: buckets.map((r) => r.id) },
        },
        _sum: { quantity: true },
      });
      for (const m of mine) {
        ownReserved.set(m.inventoryId, Number(m._sum.quantity ?? 0));
      }
    }
    const { steps, shortfall } = allocateFromBuckets(
      buckets,
      item.quantity,
      ownReserved,
    );
    plans.push({ item, buckets, steps, shortfall });
  }
  return plans;
}

/**
 * 出荷したら足りなくなる分を数える（**書き込まない**）。
 *
 * 出荷の確認ダイアログが使う — 押す前に「何が何本足りないか」を見せ、
 * そのうえで進むかどうかを人に決めてもらうため。
 */
export async function previewDeliveryShortagesTx(
  tx: Tx,
  key: { yearMonth: string; seq: number },
): Promise<ShipShortage[]> {
  const so = await tx.deliveryOrder.findUniqueOrThrow({
    where: { yearMonth_seq: key },
    include: { items: true },
  });
  if (so.type !== "DISPATCH") return [];
  const plans = await planDispatchLines(tx, so);
  const shortages: ShipShortage[] = [];
  for (const plan of plans) {
    if (plan.shortfall <= 0) continue;
    shortages.push({
      itemId: plan.item.itemId,
      item: await itemLabel(tx, plan.item.itemId),
      lotNumber: plan.item.lotNumber,
      shortfall: plan.shortfall,
    });
  }
  return shortages;
}

/**
 * 出荷フック: DISPATCH は SO ロット在庫から出庫 + 予約解除。STOCK_STORAGE は
 * 保管入庫（予備製作分）。shipDeliveryOrder から呼ぶ。
 */
export async function onDeliveryOrderShipped(
  key: { yearMonth: string; seq: number },
  movementKey: MovementKey,
): Promise<ShipShortage[]> {
  return prisma.$transaction(async (tx) =>
    onDeliveryOrderShippedTx(tx, key, movementKey),
  );
}

/**
 * onDeliveryOrderShipped の tx コア — 出荷アクションの状態遷移と同一
 * トランザクションで呼べる。
 *
 * **在庫が足りなくても出荷は止めない。** 以前は台帳が足りなければ例外にして
 * いたが、物が出て行ったあとに記録だけ拒んでも現実は変わらず、「出荷したのに
 * 台帳に無い」という誰にも見えない食い違いが残るだけだった。足りない分は
 * マイナスのまま計上し（備考で区別できる）、不足の一覧を返す — 呼び出し側は
 * それを利用者への警告にする。マイナスは在庫一覧にも棚卸にも見えるので直せる。
 */
export async function onDeliveryOrderShippedTx(
  tx: Tx,
  key: { yearMonth: string; seq: number },
  movementKey: MovementKey,
): Promise<ShipShortage[]> {
  const so = await tx.deliveryOrder.findUniqueOrThrow({
    where: { yearMonth_seq: key },
    include: { items: true },
  });
  const ref = `DOR-${key.yearMonth}-${String(key.seq).padStart(5, "0")}`;
  /** 台帳が足りないまま出した分。呼び出し側が利用者へ警告する。 */
  const shortages: ShipShortage[] = [];
  // 出庫・在庫保管の入庫・予約解除は 1 回の出荷の中身なので 1 枚にまとめる。
  const openMovement = movementOpener(tx, {
    key: movementKey,
    cause: "DELIVERY_SHIPMENT",
    sourceType: "delivery_orders",
    sourceId: ref,
    plantId: so.fromPlantId,
  });
  // 発送の引き当ては**出荷前の確認と同じ関数**で計算する（planDispatchLines）。
  const dispatchPlans =
    so.type === "DISPATCH" ? await planDispatchLines(tx, so) : [];
  for (const [index, item] of so.items.entries()) {
    if (so.type === "DISPATCH") {
      const plan = dispatchPlans[index];
      for (const step of plan.steps) {
        await applyTransaction(tx, await openMovement(), {
          inventoryType: "PRODUCT",
          inventoryId: step.bucketId,
          transactionType: "OUT",
          quantity: step.take,
          referenceType: "delivery_order",
          referenceId: ref,
          notes: encodeInventoryNote("shipped", { ref }),
        });
      }
      // 足りなかった分も**出したことにする**。物は出て行ったので、ここで
      // 止めても現実は変わらない。引く先は最初のバケット（= その品目・
      // ロットの代表。1 行も無ければ作る）で、台帳はマイナスになる — それが
      // 「合っていない」という事実の、見える置き場所になる。
      if (plan.shortfall > 0) {
        const bucketId =
          plan.buckets[0]?.id ??
          (await ensureItemInventory(tx, {
            itemId: item.itemId,
            plantId: so.fromPlantId,
            lotNumber: item.lotNumber,
            isSemiFinished: false,
          }));
        await applyTransaction(tx, await openMovement(), {
          inventoryType: "PRODUCT",
          inventoryId: bucketId,
          transactionType: "OUT",
          quantity: plan.shortfall,
          allowNegative: true,
          referenceType: "delivery_order",
          referenceId: ref,
          // 備考で普通の出庫と分ける。伝票を見れば「どの行が在庫無しで
          // 出たのか」が読める。
          notes: encodeInventoryNote("shippedWithoutStock", { ref }),
        });
        shortages.push({
          itemId: item.itemId,
          item: await itemLabel(tx, item.itemId),
          lotNumber: item.lotNumber,
          shortfall: plan.shortfall,
        });
      }
    } else {
      // STOCK_STORAGE: 保管拠点へ入庫（請求フロー外の予備分）
      const invId = await ensureItemInventory(tx, {
        itemId: item.itemId,
        plantId: so.fromPlantId,
        lotNumber: item.lotNumber,
        isSemiFinished: false,
      });
      await applyTransaction(tx, await openMovement(), {
        inventoryType: "PRODUCT",
        inventoryId: invId,
        transactionType: "IN",
        quantity: item.quantity,
        referenceType: "delivery_order",
        referenceId: ref,
        notes: encodeInventoryNote("stockStorage", { ref }),
      });
    }
  }
  // 出荷で注文明細の予約を解除（§4 予約 → 出荷 RELEASE）。
  // 部分出荷では出荷数分だけ按分して解放する（全量解放すると未出荷分の
  // 引当が他受注に奪われる — 監査 P1-2/P1-7）。RELEASE 取引を積んで
  // キャッシュ reserved_quantity も戻す。
  //
  // 1 出荷書は複数の注文明細を束ねられるので、**明細行ごと**に集計して
  // その明細の予約だけを解放する。出荷書単位で合算すると、他の注文明細の
  // 引当まで巻き込んで解放してしまう。
  if (so.type === "DISPATCH") {
    const shippedByLine = new Map<string, number>();
    for (const item of so.items) {
      if (!item.orderLineId) continue;
      shippedByLine.set(
        item.orderLineId,
        (shippedByLine.get(item.orderLineId) ?? 0) + item.quantity,
      );
    }
    for (const [orderLineId, shipped] of shippedByLine) {
      let remainingToRelease = shipped;
      const reservations = await tx.inventoryReservation.findMany({
        where: {
          orderLineId,
          status: { in: ["RESERVED", "CONFIRMED"] },
        },
        orderBy: { reservedAt: "asc" },
      });
      for (const r of reservations) {
        if (remainingToRelease <= 0) break;
        const release = Math.min(Number(r.quantity), remainingToRelease);
        await applyTransaction(tx, await openMovement(), {
          inventoryType: r.inventoryType,
          inventoryId: r.inventoryId,
          transactionType: "RELEASE",
          quantity: release,
          referenceType: "delivery_order",
          referenceId: ref,
          notes: encodeInventoryNote("shippedReservationReleased", { ref }),
        });
        if (release >= Number(r.quantity)) {
          await tx.inventoryReservation.update({
            where: { id: r.id },
            data: { status: "RELEASED", releasedAt: new Date() },
          });
        } else {
          // 部分解放: 残量を予約に残す
          await tx.inventoryReservation.update({
            where: { id: r.id },
            data: { quantity: { decrement: release } },
          });
        }
        remainingToRelease -= release;
      }
    }
  }
  return shortages;
}

/**
 * 受注キャンセル時の予約解放（監査 P1-1）: SO の生きている予約を全量
 * RELEASE し、reserved_quantity キャッシュも戻す。tx 内で呼ぶ。
 */
export async function releaseOrderLineReservations(
  tx: Tx,
  orderLineId: string,
  reason: string,
  openMovement: MovementOpener,
): Promise<number> {
  const reservations = await tx.inventoryReservation.findMany({
    where: { orderLineId, status: { in: ["RESERVED", "CONFIRMED"] } },
  });
  for (const r of reservations) {
    await applyTransaction(tx, await openMovement(), {
      inventoryType: r.inventoryType,
      inventoryId: r.inventoryId,
      transactionType: "RELEASE",
      quantity: Number(r.quantity),
      referenceType: "order_line",
      referenceId: orderLineId,
      notes: reason,
    });
    await tx.inventoryReservation.update({
      where: { id: r.id },
      data: { status: "RELEASED", releasedAt: new Date() },
    });
  }
  return reservations.length;
}

/**
 * 指示書キャンセル時の予約解放: この指示書（work_order_id）が持つ生きている
 * 予約（承認時の素材予約など）を全量 RELEASE し、reserved_quantity キャッシュも
 * 戻す。CONFIRMED は全工程完了時にしか付かず、完了済みはキャンセルできないので
 * RESERVED だけを見る。tx 内で呼ぶ。
 */
export async function releaseWorkOrderReservations(
  tx: Tx,
  workOrderId: string,
  reason: string,
  openMovement: MovementOpener,
): Promise<number> {
  const reservations = await tx.inventoryReservation.findMany({
    where: { workOrderId, status: "RESERVED" },
  });
  for (const r of reservations) {
    await applyTransaction(tx, await openMovement(), {
      inventoryType: r.inventoryType,
      inventoryId: r.inventoryId,
      transactionType: "RELEASE",
      quantity: Number(r.quantity),
      referenceType: "work_order",
      referenceId: workOrderId,
      notes: reason,
    });
    await tx.inventoryReservation.update({
      where: { id: r.id },
      data: { status: "RELEASED", releasedAt: new Date() },
    });
  }
  return reservations.length;
}

/**
 * 素材入荷フック: 入荷拠点の素材在庫へ入庫。
 *
 * `tx` を渡すと**その同じトランザクションで**計上する — 入荷行の作成と在庫の
 * 計上が別 tx だと、間で落ちたときに「入荷はあるのに在庫が無い」が残る
 * （onWorkOrderCompletedTx と同じ理由）。省略時は自前の tx を開く（後追いの
 * 再計上用）。
 *
 * 冪等: 同じ入荷（referenceType material_receipt / referenceId = 入荷 id）の
 * IN が既に台帳にあれば何もしない — 再実行やリトライで二重計上しない。
 */
export async function onMaterialReceipt(
  receiptId: string,
  tx: Tx,
  openMovement: MovementOpener,
): Promise<void> {
  return onMaterialReceiptTx(tx, receiptId, openMovement);
}

async function onMaterialReceiptTx(
  tx: Tx,
  receiptId: string,
  openMovement: MovementOpener,
): Promise<void> {
  const r = await tx.materialReceipt.findUniqueOrThrow({
    where: { id: receiptId },
  });
  const posted = await tx.inventoryTransaction.findFirst({
    where: {
      inventoryType: "MATERIAL",
      transactionType: "IN",
      referenceType: "material_receipt",
      referenceId: r.id,
    },
    select: { id: true },
  });
  if (posted) return;
  const invId = await ensureItemInventory(tx, {
    itemId: r.itemId,
    plantId: r.plantId,
    unit: r.unit,
  });
  await applyTransaction(tx, await openMovement(), {
    inventoryType: "MATERIAL",
    inventoryId: invId,
    transactionType: "IN",
    quantity: Number(r.quantity),
    referenceType: "material_receipt",
    referenceId: r.id,
    notes: encodeInventoryNote("materialReceived"),
  });
}

export interface StockCheckResult {
  /** 照合①: 在庫レコードの有無。 */
  hasRecord: boolean;
  /** 利用可能数（quantity − reserved の合計、完成品のみ）。 */
  available: number;
  /** 引当できた数量。 */
  reservedNow: number;
  /** 不足数（製造分）。 */
  shortage: number;
}

/**
 * §4 製品在庫照合 + 引当予約。受注数量に対し在庫を確認し、可能な分を
 * RESERVE（他受注との重複割当を防止）。不足分は呼び出し側で MANUFACTURE
 * 指示書を作る（FROM_STOCK/MANUFACTURE の分割は指示書作成 UI 側）。
 */
export async function reserveProductStock(
  orderLineId: string,
  movementKey: MovementKey,
): Promise<StockCheckResult> {
  const so = await prisma.orderLine.findUniqueOrThrow({
    where: { id: orderLineId },
  });
  // 確定前（枝番なし・品目未特定）の明細は引当対象にならない。
  if (so.branch == null || so.itemId == null) {
    throw new Error(encodeInventoryNote("onlyConfirmedLinesCanBeStockChecked"));
  }
  const itemId = so.itemId;

  return prisma.$transaction(async (tx) => {
    const openMovement = movementOpener(tx, {
      key: movementKey,
      cause: "STOCK_RESERVATION",
      sourceType: "order_lines",
      sourceId: orderLineId,
    });
    // 対象行をロック（FOR UPDATE）— 同時照合による二重引当を防ぐ（監査 P1-3）。
    // ロック取得後に読む値が確定値になる。
    await tx.$queryRaw`
      SELECT id FROM app.item_inventory
      WHERE item_id = ${itemId} AND is_semi_finished = false
      FOR UPDATE`;
    const rows = (
      await tx.itemInventory.findMany({
        // 引き当てられるのは自社の在庫だけ。
        where: { itemId, isSemiFinished: false, custodyBpId: null },
        orderBy: { lotNumber: "asc" },
      })
    ).map((r) => ({
      ...r,
      quantity: Number(r.quantity),
      reservedQuantity: Number(r.reservedQuantity),
    }));
    const hasRecord = rows.length > 0;
    const available = rows.reduce(
      (sum, r) => sum + Math.max(0, r.quantity - r.reservedQuantity),
      0,
    );
    // 冪等: 同じ明細に生きている予約（RESERVED | CONFIRMED）があれば、その分は
    // もう引当済みなので差し引く — 二重呼び出し（再照合・二重送信）で
    // 受注数量を超えて予約しない。
    const existing = await tx.inventoryReservation.aggregate({
      where: {
        orderLineId,
        inventoryType: "PRODUCT",
        status: { in: ["RESERVED", "CONFIRMED"] },
      },
      _sum: { quantity: true },
    });
    const alreadyReserved = Number(existing._sum.quantity ?? 0);
    let remaining = Math.max(0, so.quantity - alreadyReserved);
    let reservedNow = 0;

    for (const row of rows) {
      if (remaining <= 0) break;
      const free = row.quantity - row.reservedQuantity;
      if (free <= 0) continue;
      const take = Math.min(free, remaining);
      await applyTransaction(tx, await openMovement(), {
        inventoryType: "PRODUCT",
        inventoryId: row.id,
        transactionType: "RESERVE",
        quantity: take,
        referenceType: "order_line",
        referenceId: orderLineId,
        notes: encodeInventoryNote("reservedByStockCheck"),
      });
      await tx.inventoryReservation.create({
        data: {
          inventoryType: "PRODUCT",
          inventoryId: row.id,
          orderLineId,
          quantity: take,
          status: "RESERVED",
          reservedAt: new Date(),
        },
      });
      remaining -= take;
      reservedNow += take;
    }

    await recordAudit({
      action: "UPDATE",
      tableName: "order_lines",
      recordId: `ORD-${so.acceptanceYearMonth}-${String(so.acceptanceSeq).padStart(5, "0")}-${String(so.branch).padStart(2, "0")}`,
      // so は findUniqueOrThrow 済みの行 — PK が既に手元にあるので直接渡す
      // （キオスク側にはこのテーブル向けの解決レジストリが無いため必須）。
      recordKey: so.id,
      after: {
        note: encodeInventoryNote("stockCheckReservedAndShortage", {
          reservedNow,
          shortage: remaining,
        }),
        available,
      },
    });

    return { hasRecord, available, reservedNow, shortage: remaining };
  });
}
