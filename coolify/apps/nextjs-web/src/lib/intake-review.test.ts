import { describe, expect, it } from "vitest";
import { reviewIntake, unresolvedFields } from "./intake-review";

/**
 * 「読めなかった」と「読めたが未登録」を区別できることが肝。
 * 対処が違う（前者は書類を見て手入力、後者はマスタ登録）ため、
 * ここが混ざると現場が迷う。
 */

const saved = (over: Partial<Parameters<typeof reviewIntake>[1]> = {}) => ({
  customerBpId: null,
  customerOrderRef: null,
  orderDate: null,
  items: [],
  ...over,
});

const find = (rs: ReturnType<typeof reviewIntake>, key: string) =>
  rs.find((r) => r.key === key);

// next-intl の t() の代わり（元のハードコード文言に対応する鍵だけを再現する）。
const LABELS: Record<string, string> = {
  "sales.intakeReview.customer": "顧客",
  "sales.intakeReview.readOwnCompanyAsCustomerHint":
    "自社名「{name}」を顧客として読み取っています（書類の宛先＝自社）。発行元・社判のある側が顧客です — 書類を見て選び直してください",
  "sales.intakeReview.customerCandidatesHint":
    "「{name}」に近い取引先が {count} 件あります。編集画面の顧客欄に候補が出るので、正しいものを選んでください",
  "sales.intakeReview.customerNoMatchHint":
    "「{name}」に一致する取引先がありません。取引先を選び直すか、マスタに登録（表記ゆれは AI 照合名に追加）してください",
  "sales.intakeReview.customerNameNotReadHint":
    "書類から会社名を読み取れませんでした。書類を見て選択してください",
  "sales.intakeReview.customerOrderRef": "顧客注文書番号",
  "sales.intakeReview.orderRefNotReadHint":
    "書類の注文番号を読み取れませんでした",
  "sales.intakeReview.orderDate": "注文日",
  "sales.intakeReview.orderDateNotReadHint": "書類の日付を読み取れませんでした",
  "sales.intakeReview.items": "明細",
  "sales.intakeReview.noItemsReadHint":
    "明細を 1 件も読み取れませんでした。書類を見て追加してください",
  "sales.intakeReview.itemProductLabel": "明細 {row} 行目: 製品",
  "sales.intakeReview.productNameNotReadHint":
    "品名を読み取れませんでした。書類を見て製品を選んでください",
  "sales.intakeReview.productCandidatesHint":
    "「{name}」に近い製品が {count} 件あります。編集画面のこの行に候補が出るので、正しいものを選んでください",
  "sales.intakeReview.productNoMatchHint":
    "「{name}」に一致する製品がありません。製品を選び直すか、製品マスタに登録してください",
  "sales.intakeReview.itemUnitPriceLabel": "明細 {row} 行目: 単価",
  "sales.intakeReview.unitPriceNotReadHint":
    "単価を読み取れませんでした。価格表と照らして入力してください",
};
const tr = (key: string, values?: Record<string, unknown>) => {
  const template = LABELS[key] ?? key;
  if (!values) return template;
  return template.replace(/\{(\w+)\}/g, (_, k: string) =>
    String(values[k] ?? ""),
  );
};

describe("reviewIntake", () => {
  it("抽出 JSON が無い（手入力）ときは空", () => {
    expect(reviewIntake(null, saved(), tr)).toEqual([]);
  });

  it("顧客: 読めてマスタにも一致 → matched", () => {
    const rs = reviewIntake(
      { customer_name: "株式会社オーエムアイ" },
      saved({ customerBpId: "bp-1" }),
      tr,
    );
    expect(find(rs, "customer")).toMatchObject({
      status: "matched",
      read: "株式会社オーエムアイ",
    });
  });

  it("顧客: 読めたがマスタに無い → unmatched（読み取った名前を出す）", () => {
    const rs = reviewIntake(
      { customer_name: "株式会社オーエムアイ" },
      saved(),
      tr,
    );
    const f = find(rs, "customer");
    expect(f?.status).toBe("unmatched");
    expect(f?.read).toBe("株式会社オーエムアイ");
    expect(f?.hint).toContain("株式会社オーエムアイ");
  });

  it("顧客: 候補があるときは「選ぶだけ」と分かる案内にする", () => {
    // 候補ゼロ（＝マスタに無い）と、候補はあるが 1 件に絞れない、では
    // 次にやることが違う（登録する / 選ぶ）。
    const rs = reviewIntake(
      { customer_name: "株式会社オーエムアイ" },
      saved({ customerCandidateCount: 2 }),
      tr,
    );
    const f = find(rs, "customer");
    expect(f?.status).toBe("unmatched");
    expect(f?.hint).toContain("2 件");
    expect(f?.hint).toContain("候補");
  });

  it("顧客に自社名が来たら「向きが逆」と分かる案内を出す", () => {
    const rs = reviewIntake(
      { customer_name: "シー・ケイ・ケー株式会社" },
      saved(),
      tr,
    );
    const f = find(rs, "customer");
    expect(f?.status).toBe("unmatched");
    expect(f?.read).toBe("シー・ケイ・ケー株式会社");
    // 「マスタに無い」ではなく「宛先＝自社／発行元＝顧客」を案内する
    expect(f?.hint).toContain("自社名");
    expect(f?.hint).toContain("発行元");
  });

  it("顧客: そもそも読めなかった → missing", () => {
    const rs = reviewIntake({}, saved(), tr);
    expect(find(rs, "customer")).toMatchObject({
      status: "missing",
      read: null,
    });
  });

  it("明細 0 件は明細そのものを missing にする", () => {
    const rs = reviewIntake({ customer_name: "X" }, saved(), tr);
    expect(find(rs, "items")?.status).toBe("missing");
  });

  it("製品: 品名は読めたが未突合 → unmatched（品名を出す）", () => {
    const rs = reviewIntake(
      { items: [{ product_name: "特殊ドリル A", quantity: 5 }] },
      saved({
        items: [
          {
            productId: null,
            productText: "特殊ドリル A",
            quantity: 5,
            unitPrice: 100,
          },
        ],
      }),
      tr,
    );
    const f = find(rs, "item-1-product");
    expect(f?.status).toBe("unmatched");
    expect(f?.read).toBe("特殊ドリル A");
    expect(f?.row).toBe(1);
  });

  it("製品: 候補があるときは「選ぶだけ」と分かる案内にする", () => {
    const rs = reviewIntake(
      { items: [{ product_name: "特殊ドリル", quantity: 5 }] },
      saved({
        items: [
          {
            productId: null,
            productText: "特殊ドリル",
            productCandidateCount: 3,
            quantity: 5,
            unitPrice: 100,
          },
        ],
      }),
      tr,
    );
    const f = find(rs, "item-1-product");
    expect(f?.hint).toContain("3 件");
    expect(f?.hint).toContain("候補");
  });

  it("製品: 突合済みなら明細の指摘は出ない", () => {
    const rs = reviewIntake(
      { items: [{ product_name: "P", quantity: 1 }] },
      saved({
        items: [
          { productId: "12", productText: "P", quantity: 1, unitPrice: 50 },
        ],
      }),
      tr,
    );
    expect(find(rs, "item-1-product")).toBeUndefined();
    expect(find(rs, "item-1-unitPrice")).toBeUndefined();
  });

  it("単価が空の行は単価を missing にする", () => {
    const rs = reviewIntake(
      { items: [{ product_name: "P", quantity: 1 }] },
      saved({
        items: [
          { productId: "12", productText: "P", quantity: 1, unitPrice: null },
        ],
      }),
      tr,
    );
    expect(find(rs, "item-1-unitPrice")?.status).toBe("missing");
  });

  it("unresolvedFields は matched / filled を落とす", () => {
    const rs = reviewIntake(
      {
        customer_name: "X",
        order_date: "2026-08-01",
        items: [{ product_name: "P", quantity: 1 }],
      },
      saved({
        customerBpId: "bp-1",
        customerOrderRef: "PO-1",
        orderDate: "2026-08-01",
        items: [
          { productId: "1", productText: "P", quantity: 1, unitPrice: 10 },
        ],
      }),
      tr,
    );
    expect(unresolvedFields(rs)).toEqual([]);
  });

  it("po-extract の { data: … } 包みでも読める", () => {
    const rs = reviewIntake({ data: { customer_name: "包み" } }, saved(), tr);
    expect(find(rs, "customer")?.read).toBe("包み");
  });
});
