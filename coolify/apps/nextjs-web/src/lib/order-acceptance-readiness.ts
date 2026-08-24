/**
 * order-acceptance-readiness.ts — 注文請書（§2）を先へ進められるかの判定。
 *
 * 承認依頼（DRAFT → REQUESTED）と 確定（APPROVED → COMPLETED）は**同じ
 * 完成条件**を要求する: 顧客が特定済み・明細が 1 件以上・全行に製品と単価。
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
  kind: "customer" | "items" | "product" | "price" | "endUser";
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
    unitPrice: number | null;
  }[];
}

export interface Readiness {
  /** 先へ進められるか。 */
  ok: boolean;
  issues: ReadinessIssue[];
}

/** 行番号の列挙（1 始まり）— 「明細 2, 5 行目」の形にする。 */
const rowList = (rows: number[]): string => rows.join(", ");

export function acceptanceReadiness(input: ReadinessInput): Readiness {
  const issues: ReadinessIssue[] = [];

  if (!input.customerBpId) {
    issues.push({
      kind: "customer",
      message: "顧客が未特定です",
    });
  }

  // ユーザー直送は最終的な届け先（エンドユーザー）が決まっていないと
  // 出荷・納品書まで進めない — 保存時にも強制するが、既存データの
  // 取りこぼしをここで確実に止める。
  if (input.deliveryMethod === "DIRECT_TO_USER" && !input.endUserBpId) {
    issues.push({
      kind: "endUser",
      message: "ユーザー直送ですがエンドユーザーが未指定です",
    });
  }

  if (input.items.length < 1) {
    issues.push({ kind: "items", message: "明細が 1 件もありません" });
    return { ok: false, issues };
  }

  const noProduct: number[] = [];
  const noPrice: number[] = [];
  input.items.forEach((it, i) => {
    if (it.productId == null || it.productId === "") noProduct.push(i + 1);
    if (it.unitPrice == null) noPrice.push(i + 1);
  });
  if (noProduct.length > 0) {
    issues.push({
      kind: "product",
      message: `明細 ${rowList(noProduct)} 行目: 製品が未特定です`,
    });
  }
  if (noPrice.length > 0) {
    issues.push({
      kind: "price",
      message: `明細 ${rowList(noPrice)} 行目: 単価が未入力です`,
    });
  }

  return { ok: issues.length === 0, issues };
}

/** 理由を 1 行にまとめる（API のエラー文・カードの説明用）。 */
export function readinessSummary(issues: ReadinessIssue[], max = 3): string {
  const shown = issues.slice(0, max).map((i) => i.message);
  const rest = issues.length - shown.length;
  return shown.join(" / ") + (rest > 0 ? ` ほか ${rest} 件` : "");
}
