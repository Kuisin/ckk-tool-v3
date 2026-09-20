import type { getTranslations } from "next-intl/server";

/**
 * order-acceptance-readiness.ts — 注文請書（§2）を先へ進められるかの判定。
 *
 * 承認依頼（DRAFT → REQUESTED）と 確定（APPROVED → COMPLETED）は**同じ
 * 完成条件**を要求する: 顧客が特定済み・明細が 1 件以上・全行に製品と単価
 * （数量は 1 以上・単価は 0 以上 — 取込の読み違いで 0 や負が入った行を止める）・
 * ユーザー直送の行にはエンドユーザーが入っている。
 * 以前は確定のときにだけ全行を検査していたため、製品未特定のまま承認まで
 * 進んでしまい、確定の段になって「差し戻してもらってください」となっていた。
 * 入口（承認依頼）で止める方が、直す人＝内容を知っている人のままで済む。
 *
 * 配送（出荷先・配送方法・エンドユーザー・担当拠点・出荷作業場所）は
 * **明細ごと**に持つ（§8） — 1 通の注文書の中で行ごとに届け先が違う注文が
 * あるため。ヘッダには残っていない。
 *
 * 純ロジック（I/O なし）— サーバー（actions.ts）は依頼を弾くために、画面は
 * ボタンを押せなくして理由を出すために、**同じ関数**を使う。
 */

/** 未完成の理由 1 件（画面にも API のエラーにもそのまま出る）。 */
export interface ReadinessIssue {
  /** 種別 — 表示の出し分け用。 */
  kind:
    | "customer"
    | "items"
    | "product"
    | "quantity"
    | "price"
    | "endUser"
    | "externalProduct";
  /** 人が読む説明。 */
  message: string;
}

export interface ReadinessInput {
  customerBpId: string | null;
  items: {
    /** 製品（品目 items.id）が決まっているか（null = 未特定）。 */
    itemId: string | number | null;
    quantity: number;
    unitPrice: number | null;
    /** 配送方法（通常配送 / ユーザー直送）。行ごとに持つ（§8）。 */
    deliveryMethod: "NORMAL" | "DIRECT_TO_USER";
    /** エンドユーザー（最終需要家）— その行がユーザー直送では必須。 */
    endUserBpId: string | null;
    /** 注文種別。他社製品の行は REGRIND でなければならない。 */
    orderType?: string;
    /** 選んだ品目が他社製品（再研磨専用）か。未指定 = 判定しない。 */
    isExternalProduct?: boolean;
  }[];
}

export interface Readiness {
  /** 先へ進められるか。 */
  ok: boolean;
  issues: ReadinessIssue[];
}

type Tr = Awaited<ReturnType<typeof getTranslations>>;

/** 行番号の列挙（1 始まり）— 「明細 2, 5 行目」の形にする。 */
const rowList = (rows: number[]): string => rows.join(", ");

export function acceptanceReadiness(input: ReadinessInput, tr: Tr): Readiness {
  const issues: ReadinessIssue[] = [];

  if (!input.customerBpId) {
    issues.push({
      kind: "customer",
      message: tr("sales.orderAcceptanceReadiness.customerNotIdentified"),
    });
  }

  if (input.items.length < 1) {
    issues.push({
      kind: "items",
      message: tr("sales.orderAcceptanceReadiness.noLineItems"),
    });
    return { ok: false, issues };
  }

  const noProduct: number[] = [];
  const badQuantity: number[] = [];
  const noPrice: number[] = [];
  const negativePrice: number[] = [];
  // ユーザー直送の行はエンドユーザーが決まっていないと出荷・納品書まで
  // 進めない — 保存時にも強制するが、既存データの取りこぼしをここで
  // 確実に止める。配送方法は行ごとなので、他の行チェックと同じ行番号方式。
  const noEndUser: number[] = [];
  // 他社製品（再研磨専用）は注文種別が再研磨の行にしか載せられない。
  const externalNotRegrind: number[] = [];
  input.items.forEach((it, i) => {
    if (it.itemId == null || it.itemId === "") noProduct.push(i + 1);
    if (it.isExternalProduct && it.orderType !== "REGRIND")
      externalNotRegrind.push(i + 1);
    if (!(it.quantity >= 1)) badQuantity.push(i + 1);
    if (it.unitPrice == null) noPrice.push(i + 1);
    else if (it.unitPrice < 0) negativePrice.push(i + 1);
    if (it.deliveryMethod === "DIRECT_TO_USER" && !it.endUserBpId)
      noEndUser.push(i + 1);
  });
  if (noProduct.length > 0) {
    issues.push({
      kind: "product",
      message: tr("sales.orderAcceptanceReadiness.lineProductNotIdentified", {
        rows: rowList(noProduct),
      }),
    });
  }
  if (badQuantity.length > 0) {
    issues.push({
      kind: "quantity",
      message: tr("sales.orderAcceptanceReadiness.lineQuantityInvalid", {
        rows: rowList(badQuantity),
      }),
    });
  }
  if (noPrice.length > 0) {
    issues.push({
      kind: "price",
      message: tr("sales.orderAcceptanceReadiness.lineUnitPriceNotEntered", {
        rows: rowList(noPrice),
      }),
    });
  }
  if (negativePrice.length > 0) {
    issues.push({
      kind: "price",
      message: tr("sales.orderAcceptanceReadiness.lineUnitPriceNegative", {
        rows: rowList(negativePrice),
      }),
    });
  }
  if (externalNotRegrind.length > 0) {
    issues.push({
      kind: "externalProduct",
      message: tr(
        "sales.orderAcceptanceReadiness.externalProductRequiresRegrind",
        { rows: rowList(externalNotRegrind) },
      ),
    });
  }
  if (noEndUser.length > 0) {
    issues.push({
      kind: "endUser",
      message: tr("sales.orderAcceptanceReadiness.lineEndUserNotIdentified", {
        rows: rowList(noEndUser),
      }),
    });
  }

  return { ok: issues.length === 0, issues };
}

/** 理由を 1 行にまとめる（API のエラー文・カードの説明用）。 */
export function readinessSummary(
  issues: ReadinessIssue[],
  tr: Tr,
  max = 3,
): string {
  const shown = issues.slice(0, max).map((i) => i.message);
  const rest = issues.length - shown.length;
  return (
    shown.join(" / ") +
    (rest > 0
      ? ` ${tr("sales.orderAcceptanceReadiness.andNMore", { count: rest })}`
      : "")
  );
}

// ── 出荷先が使える書類か（配送方法との関係） ────────────────────────────────

/**
 * 出荷先（ship_to）を指定できるのは**通常配送のときだけ**。
 *
 * ユーザー直送の届け先はエンドユーザー（end_user）で、そこに出荷先を併記すると
 * 届け先が 2 つある書類になる — 出荷書確定時の納品書自動作成は届け先を 1 件に
 * 決め打つ（planAutoDeliveryNotes）し、取引先ポータルの可視性も ship_to を
 * 見る（lib/portal-documents）。どちらも「もう一方は無視する」という黙った
 * 選択になるので、書けないようにする方を選ぶ。
 *
 * 画面はこの規則で欄を灰色にし、Server Action は保存時に値を落とす —
 * 画面の入力は信用しない（灰色の欄は古いタブや API 直叩きでは灰色ではない）。
 */
export function shipToApplies(
  deliveryMethod: "NORMAL" | "DIRECT_TO_USER",
): boolean {
  return deliveryMethod !== "DIRECT_TO_USER";
}

/** 配送方法に合わない出荷先を落とす（ユーザー直送 → 常に null）。 */
export function normalizeShipToBpId(
  deliveryMethod: "NORMAL" | "DIRECT_TO_USER",
  shipToBpId: string | null,
): string | null {
  return shipToApplies(deliveryMethod) ? shipToBpId : null;
}

/**
 * 明細の配送欄（§8）に何か値が入っているか — 既定（通常配送・全欄未指定）
 * かどうかの判定。行エディタが「配送」節を既定で畳むか開くかに使う
 * （値が入っている行だけ開いた状態で出す）。
 */
export function hasLineDelivery(line: {
  shipToBpId?: string | null;
  deliveryMethod?: "NORMAL" | "DIRECT_TO_USER";
  endUserBpId?: string | null;
  assignedPlantId?: string | number | null;
  shippingWorkLocationId?: string | number | null;
}): boolean {
  return Boolean(
    line.shipToBpId ||
      (line.deliveryMethod && line.deliveryMethod !== "NORMAL") ||
      line.endUserBpId ||
      line.assignedPlantId ||
      line.shippingWorkLocationId,
  );
}
