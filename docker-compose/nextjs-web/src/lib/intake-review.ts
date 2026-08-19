/**
 * intake-review.ts — 抽出結果 × 保存済みデータ の**項目ごとの突合レビュー**。純ロジック。
 *
 * 取込の流れは「文字を読む → 項目ごとにマスタを引く → 引けなかったものを人が直す」。
 * 最後の 1 段のために、**何を読み取って・何が引けなかったか**を項目単位で出す。
 *
 * これが無いと、たとえば顧客が引けなかったとき画面には「未特定」としか出ず、
 * *読めなかったのか* *読めたが未登録なのか* が分からない（前者は書類を見て手入力、
 * 後者は取引先マスタに登録、と対処が違う）。抽出 JSON は保存してあるので、
 * 保存済みの行と突き合わせれば**その場で導出できる** — 別テーブルは持たない。
 */

import { type NormalizedExtraction, normalizeExtraction } from "./intake-core";
import { isOwnCompany } from "./own-company";

/** 項目の突合状態。 */
export type FieldMatchStatus =
  /** 読み取れて、マスタにも一致した。 */
  | "matched"
  /** 読み取れたが、マスタに一致するものが無い（→ 登録 or 手で選ぶ）。 */
  | "unmatched"
  /** そもそも読み取れなかった（→ 書類を見て手入力）。 */
  | "missing"
  /** マスタ突合の要らない項目で、値が入っている。 */
  | "filled";

export interface FieldReview {
  /** 安定キー（UI のアンカー・テスト用）。 */
  key: string;
  label: string;
  status: FieldMatchStatus;
  /** AI が書類から読み取った生の値（読めなかったら null）。 */
  read: string | null;
  /** 対処の案内（unmatched / missing のときだけ）。 */
  hint?: string;
  /** 明細行のときの行番号（1 始まり）。 */
  row?: number;
}

/** 保存済み側（突合結果）— 画面の現在値と同じもの。 */
export interface SavedForReview {
  customerBpId: string | null;
  customerOrderRef: string | null;
  orderDate: string | null;
  /**
   * 顧客を 1 件に絞れなかったときの候補数（lib/bp-match）。
   * 「候補はあるが決められなかった」のと「そもそも当たらない」のでは
   * 次にやることが違う（前者は選ぶだけ、後者はマスタ登録）。
   */
  customerCandidateCount?: number;
  items: {
    productId: string | null;
    productText: string | null;
    /** 製品を絞れなかったときの候補数（顧客と同じ — 選ぶだけか、登録が要るか）。 */
    productCandidateCount?: number;
    quantity: number;
    unitPrice: number | null;
  }[];
}

const has = (v: string | null | undefined): v is string =>
  !!v && v.trim() !== "";

/**
 * 抽出 JSON（order_acceptances.extracted）と保存済みの行から、項目ごとの
 * レビュー行を作る。抽出 JSON が無い場合（手入力）は空配列。
 */
export function reviewIntake(
  extracted: unknown,
  saved: SavedForReview,
): FieldReview[] {
  if (extracted == null) return [];
  const norm: NormalizedExtraction = normalizeExtraction(
    (extracted as { data?: unknown })?.data ?? extracted,
  );
  const out: FieldReview[] = [];

  // ── 顧客（取引先マスタ突合） ──────────────────────────────────────────────
  if (saved.customerBpId) {
    out.push({
      key: "customer",
      label: "顧客",
      status: "matched",
      read: norm.customerName,
    });
  } else if (isOwnCompany(norm.customerName)) {
    // 注文書は相手の視点で書かれている（宛先＝自社／発行元＝顧客）。
    // 自社名が来たということは、AI が読む側を取り違えている。
    out.push({
      key: "customer",
      label: "顧客",
      status: "unmatched",
      read: norm.customerName,
      hint: `自社名「${norm.customerName}」を顧客として読み取っています（書類の宛先＝自社）。発行元・社判のある側が顧客です — 書類を見て選び直してください`,
    });
  } else if (has(norm.customerName)) {
    const count = saved.customerCandidateCount ?? 0;
    out.push({
      key: "customer",
      label: "顧客",
      status: "unmatched",
      read: norm.customerName,
      hint:
        count > 0
          ? `「${norm.customerName}」に近い取引先が ${count} 件あります。編集画面の顧客欄に候補が出るので、正しいものを選んでください`
          : `「${norm.customerName}」に一致する取引先がありません。取引先を選び直すか、マスタに登録（表記ゆれは AI 照合名に追加）してください`,
    });
  } else {
    out.push({
      key: "customer",
      label: "顧客",
      status: "missing",
      read: null,
      hint: "書類から会社名を読み取れませんでした。書類を見て選択してください",
    });
  }

  // ── 顧客注文書番号（マスタ突合なし — 有無だけ） ───────────────────────────
  out.push({
    key: "customerOrderRef",
    label: "顧客注文書番号",
    status: has(saved.customerOrderRef) ? "filled" : "missing",
    read: norm.customerOrderRef,
    ...(has(saved.customerOrderRef)
      ? {}
      : { hint: "書類の注文番号を読み取れませんでした" }),
  });

  // ── 注文日 ────────────────────────────────────────────────────────────────
  out.push({
    key: "orderDate",
    label: "注文日",
    status: has(saved.orderDate) ? "filled" : "missing",
    read: norm.orderDate,
    ...(has(saved.orderDate)
      ? {}
      : { hint: "書類の日付を読み取れませんでした" }),
  });

  // ── 明細（製品マスタ突合 + 数量・単価の欠落） ─────────────────────────────
  if (saved.items.length === 0) {
    out.push({
      key: "items",
      label: "明細",
      status: "missing",
      read: null,
      hint: "明細を 1 件も読み取れませんでした。書類を見て追加してください",
    });
  }
  saved.items.forEach((item, i) => {
    const row = i + 1;
    if (!item.productId) {
      const count = item.productCandidateCount ?? 0;
      out.push({
        key: `item-${row}-product`,
        label: `明細 ${row} 行目: 製品`,
        status: has(item.productText) ? "unmatched" : "missing",
        read: item.productText,
        row,
        hint: !has(item.productText)
          ? "品名を読み取れませんでした。書類を見て製品を選んでください"
          : count > 0
            ? `「${item.productText}」に近い製品が ${count} 件あります。編集画面のこの行に候補が出るので、正しいものを選んでください`
            : `「${item.productText}」に一致する製品がありません。製品を選び直すか、製品マスタに登録してください`,
      });
    }
    if (item.unitPrice == null) {
      out.push({
        key: `item-${row}-unitPrice`,
        label: `明細 ${row} 行目: 単価`,
        status: "missing",
        read: null,
        row,
        hint: "単価を読み取れませんでした。価格表と照らして入力してください",
      });
    }
  });

  return out;
}

/** 人の対応が要る項目だけ（unmatched / missing）。 */
export function unresolvedFields(reviews: FieldReview[]): FieldReview[] {
  return reviews.filter(
    (r) => r.status === "unmatched" || r.status === "missing",
  );
}
