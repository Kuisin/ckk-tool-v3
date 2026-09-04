/**
 * master-refs.ts — マスタ削除前の「参照されているか」を 1 か所で数える。
 *
 * Prisma の省略可能な関連（`Foo?`）は既定で **ON DELETE SET NULL** なので、
 * マスタ行を消しても DB は止めない — 参照側の列が黙って null になり、注文明細の
 * 製品・指示書の素材・作業実績の場所が「不明」に化ける。RESTRICT の関連は
 * DB が P2003 で止めるが、SET NULL / CASCADE は**アプリが数えて拒否する**しかない。
 *
 * 各マスタの削除 Server Action は `countMasterReferences(kind, ids)` を呼び、
 * `total > 0` なら「参照があるため削除できません」で返す（無効化は従来どおり）。
 * どの関連を数えるかは下の `MASTER_REFERENCES` が唯一の定義で、
 * `master-refs.test.ts` が Prisma スキーマ（prisma/schema/*.prisma）から
 * SET NULL / CASCADE の関連を導き、**ここに無い関連があれば落ちる** —
 * 関連を足したときに数え忘れを構造的に防ぐ。数えないと決めた関連は理由付きで
 * `IGNORED_REFERENCES` に書く。
 */

import { type Prisma, prisma } from "@/lib/db";

/** 参照側 1 本 = (Prisma モデル名, 外部キーのフィールド名)。 */
export interface MasterReference {
  model: Prisma.ModelName;
  field: string;
}

/** 参照される側のマスタ（Prisma モデル名で識別）。 */
export type MasterTarget =
  | "Product"
  | "BusinessPartner"
  | "Plant"
  | "Material"
  | "WorkLocation"
  | "ApprovalGroup";

/**
 * 削除 Server Action が渡す「何を消すか」。
 *   branch            = 支店（親を持つ取引先）。参照の集合は取引先と同じ —
 *                       支店も customerBpId / shipToBpId 等に入り得る。
 *   workLocationGroup = 作業場所グループ。配下の場所（CASCADE で一緒に消える）
 *                       の参照をまとめて数える。
 */
export type MasterKind =
  | "product"
  | "businessPartner"
  | "branch"
  | "plant"
  | "material"
  | "workLocation"
  | "workLocationGroup"
  | "approvalGroup";

export const KIND_TARGET: Record<MasterKind, MasterTarget> = {
  product: "Product",
  businessPartner: "BusinessPartner",
  branch: "BusinessPartner",
  plant: "Plant",
  material: "Material",
  workLocation: "WorkLocation",
  workLocationGroup: "WorkLocation",
  approvalGroup: "ApprovalGroup",
};

function ref(model: Prisma.ModelName, field: string): MasterReference {
  return { model, field };
}

/**
 * 数える関連。SET NULL（省略可能な関連の既定）と CASCADE のうち、消えると
 * 業務記録が欠ける／黙って消えるもの。RESTRICT の関連も一部含める
 * （価格表・見積明細など）— DB の P2003 より前に、同じ文言で止めるため。
 */
export const MASTER_REFERENCES: Record<
  MasterTarget,
  ReadonlyArray<MasterReference>
> = {
  Product: [
    ref("PriceListEntry", "productId"), // RESTRICT（従来からのガード）
    ref("QuoteItem", "productId"), // RESTRICT（従来からのガード）
    ref("OrderLine", "productId"),
    ref("DesignFile", "productId"),
    ref("DesignRequest", "productId"),
    ref("Estimate", "productId"),
    ref("InspectionTemplate", "productId"),
  ],
  BusinessPartner: [
    // 販売
    ref("Estimate", "customerBpId"),
    ref("PriceListEntry", "customerBpId"),
    ref("Quote", "customerBpId"),
    ref("Quote", "customerBranchBpId"),
    ref("OrderAcceptance", "customerBpId"),
    ref("OrderAcceptance", "customerBranchBpId"),
    ref("OrderAcceptance", "shipToBpId"),
    ref("OrderAcceptance", "endUserBpId"),
    ref("OrderLine", "endUserBpId"),
    // 出荷・請求
    ref("DeliveryOrder", "customerBpId"),
    ref("DeliveryOrder", "customerBranchBpId"),
    ref("DeliveryNote", "recipientBpId"),
    ref("DeliveryNote", "recipientBranchBpId"),
    ref("DeliveryNote", "endUserBpId"),
    ref("Invoice", "customerBpId"),
    ref("Invoice", "customerBranchBpId"),
    ref("BillingClosing", "customerBpId"),
    // 購買・製造
    ref("MaterialPurchaseOrder", "supplierBpId"),
    ref("MaterialReceipt", "supplierBpId"),
    ref("WorkOrderStep", "supplierBpId"),
    ref("ProductProcessRoute", "customerBpId"),
    ref("ProductProcessRouteVersionStep", "supplierBpId"),
    // 設計
    ref("DesignFile", "customerBpId"),
    ref("DesignRequest", "customerBpId"),
    // マスタ内部・ポータル
    ref("BpCustomerAttrs", "billingBpId"),
    ref("BusinessPartner", "parentId"),
    ref("PortalGrant", "bpId"),
  ],
  Plant: [
    ref("ProductInventory", "plantId"),
    ref("MaterialInventory", "plantId"),
    ref("WorkOrderStep", "plantId"),
    ref("ProductProcessRouteVersionStep", "plantId"),
    ref("OrderAcceptance", "assignedPlantId"),
    ref("DeliveryOrder", "fromPlantId"),
    ref("MaterialPurchaseOrderItem", "plantId"),
    ref("MaterialReceipt", "plantId"),
    ref("PurchaseRequestItem", "plantId"),
    ref("WorkLocationGroup", "plantId"),
    ref("KioskDevice", "plantId"),
    ref("DisplayDevice", "plantId"),
  ],
  Material: [ref("WorkOrder", "materialId")],
  WorkLocation: [
    ref("WorkOrderStepPlan", "workLocationId"),
    ref("WorkOrderStepActual", "workLocationId"),
    ref("KioskDevice", "defaultWorkLocationId"),
    ref("OrderAcceptance", "shippingWorkLocationId"),
    // CASCADE — 工程の許可作業場所リンクが黙って消える
    ref("ProcessStepWorkLocation", "workLocationId"),
  ],
  ApprovalGroup: [ref("InspectionTemplate", "approvalGroupId")],
};

/**
 * SET NULL / CASCADE だが**意図して数えない**関連。テストはここに載っていれば
 * 見逃しとみなさない。足すときは理由を書くこと。
 */
export const IGNORED_REFERENCES: ReadonlyArray<
  MasterReference & { target: MasterTarget; reason: string }
> = [
  {
    // 取引先自身の属性行（CASCADE）。deleteBps が他の属性行と一緒に明示的に消す
    target: "BusinessPartner",
    model: "BpSalesRep",
    field: "bpId",
    reason: "own attribute rows (CASCADE); deleteBps removes them explicitly",
  },
  {
    // グループ自身のメンバー行（CASCADE）
    target: "ApprovalGroup",
    model: "ApprovalGroupMember",
    field: "groupId",
    reason: "own member rows (CASCADE)",
  },
  {
    // グループ自身の代理設定（CASCADE）
    target: "ApprovalGroup",
    model: "ApprovalDelegate",
    field: "groupId",
    reason: "own delegate rows (CASCADE)",
  },
  {
    // 承認依頼は依頼時点の flow_snapshot（グループ名込み）を持つ履歴。
    // スキーマが明示的に onDelete: SetNull と宣言している
    target: "ApprovalGroup",
    model: "ApprovalRequest",
    field: "groupId",
    reason: "history row carrying flow_snapshot; schema declares SetNull",
  },
];

export interface MasterReferenceCount {
  /** 参照行の合計。0 なら削除してよい。 */
  total: number;
  /** `Model.field` → 件数（0 件のものは含めない）。 */
  byTable: Record<string, number>;
}

export function referenceKey(r: { model: string; field: string }): string {
  return `${r.model}.${r.field}`;
}

type CountDelegate = {
  count: (args: { where: Record<string, unknown> }) => Promise<number>;
};

function delegateFor(model: Prisma.ModelName): CountDelegate {
  const name = model.charAt(0).toLowerCase() + model.slice(1);
  return (prisma as unknown as Record<string, CountDelegate>)[name];
}

async function resolveIds(
  kind: MasterKind,
  ids: ReadonlyArray<number | string>,
): Promise<ReadonlyArray<number | string>> {
  if (kind !== "workLocationGroup") return ids;
  const rows = await prisma.workLocation.findMany({
    where: { groupId: { in: ids.map((id) => Number(id)) } },
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

/**
 * マスタ行 `ids` を参照している行を、`MASTER_REFERENCES` の関連ごとに数える。
 * すべての削除 Server Action が同じ問いをここに投げる。
 */
export async function countMasterReferences(
  kind: MasterKind,
  ids: ReadonlyArray<number | string>,
): Promise<MasterReferenceCount> {
  const targetIds = await resolveIds(kind, ids);
  if (targetIds.length === 0) return { total: 0, byTable: {} };
  const refs = MASTER_REFERENCES[KIND_TARGET[kind]];
  const counts = await Promise.all(
    refs.map((r) =>
      delegateFor(r.model).count({
        where: { [r.field]: { in: [...targetIds] } },
      }),
    ),
  );
  const byTable: Record<string, number> = {};
  let total = 0;
  refs.forEach((r, i) => {
    const n = counts[i] ?? 0;
    if (n > 0) byTable[referenceKey(r)] = n;
    total += n;
  });
  return { total, byTable };
}
