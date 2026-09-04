import type { getTranslations } from "next-intl/server";

/**
 * order-acceptance-readiness.ts — 注文請書（§2）を先へ進められるかの判定。
 *
 * 承認依頼（DRAFT → REQUESTED）と 確定（APPROVED → COMPLETED）は**同じ
 * 完成条件**を要求する: 顧客が特定済み・明細が 1 件以上・全行に製品と単価
 * （数量は 1 以上・単価は 0 以上 — 取込の読み違いで 0 や負が入った行を止める）。
 * 以前は確定のときにだけ全行を検査していたため、製品未特定のまま承認まで
 * 進んでしまい、確定の段になって「差し戻してもらってください」となっていた。
 * 入口（承認依頼）で止める方が、直す人＝内容を知っている人のままで済む。
 *
 * 純ロジック（I/O なし）— サーバー（actions.ts）は依頼を弾くために、画面は
 * ボタンを押せなくして理由を出すために、**同じ関数**を使う。
 */

/** 未完成の理由 1 件（画面にも API のエラーにもそのまま出る）。 */
export interface ReadinessIssue {
  /** 種別 — 表示の出し分け用。 */
  kind: "customer" | "items" | "product" | "quantity" | "price" | "endUser";
  /** 人が読む説明。 */
  message: string;
}

export interface ReadinessInput {
  customerBpId: string | null;
  /** 配送方法（通常配送 / ユーザー直送）。 */
  deliveryMethod: "NORMAL" | "DIRECT_TO_USER";
  /** エンドユーザー（最終需要家）— ユーザー直送では必須。 */
  endUserBpId: string | null;
  items: {
    /** 製品マスタ突合済みか（null = 未特定）。 */
    productId: string | number | null;
    quantity: number;
    unitPrice: number | null;
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

  // ユーザー直送は最終的な届け先（エンドユーザー）が決まっていないと
  // 出荷・納品書まで進めない — 保存時にも強制するが、既存データの
  // 取りこぼしをここで確実に止める。
  if (input.deliveryMethod === "DIRECT_TO_USER" && !input.endUserBpId) {
    issues.push({
      kind: "endUser",
      message: tr("sales.orderAcceptanceReadiness.directToUserButEndUserNot"),
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
  input.items.forEach((it, i) => {
    if (it.productId == null || it.productId === "") noProduct.push(i + 1);
    if (!(it.quantity >= 1)) badQuantity.push(i + 1);
    if (it.unitPrice == null) noPrice.push(i + 1);
    else if (it.unitPrice < 0) negativePrice.push(i + 1);
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
