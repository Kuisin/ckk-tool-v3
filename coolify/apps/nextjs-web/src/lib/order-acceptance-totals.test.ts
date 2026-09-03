import { describe, expect, it } from "vitest";
import { acceptanceTotals, productSummary } from "./order-acceptance-totals";

/**
 * 注文請書の合計。**単価未入力の行がある**のが常態なので、
 * 「出せた金額」と「出せなかった行数」を必ず分けて持つ。
 */

const line = (
  productId: string | null,
  quantity: number,
  unitPrice: number | null,
) => ({ productId, quantity, unitPrice });

describe("acceptanceTotals", () => {
  it("数量と金額を合計する", () => {
    const t = acceptanceTotals([line("1", 100, 250), line("2", 50, 400)]);
    expect(t.quantity).toBe(150);
    expect(t.amount).toBe(45_000);
    expect(t.lineCount).toBe(2);
    expect(t.unpricedCount).toBe(0);
  });

  it("**単価未入力の行は金額に足さず、件数で残す**", () => {
    const t = acceptanceTotals([line("1", 100, 250), line("2", 50, null)]);
    expect(t.amount).toBe(25_000);
    expect(t.unpricedCount).toBe(1);
    // 数量は単価が無くても数えられる。
    expect(t.quantity).toBe(150);
  });

  it("製品は種類で数える（同じ製品の 2 行は 1 種）", () => {
    const t = acceptanceTotals([
      line("1", 10, 100),
      line("1", 20, 100),
      line("2", 5, 100),
    ]);
    expect(t.productCount).toBe(2);
    expect(t.lineCount).toBe(3);
  });

  it("製品未特定の行を数える", () => {
    const t = acceptanceTotals([line(null, 10, 100), line("1", 10, 100)]);
    expect(t.productCount).toBe(1);
    expect(t.unmatchedCount).toBe(1);
  });

  it("明細が無いときは全部 0", () => {
    expect(acceptanceTotals([])).toEqual({
      lineCount: 0,
      productCount: 0,
      unmatchedCount: 0,
      quantity: 0,
      amount: 0,
      unpricedCount: 0,
    });
  });

  it("数量が壊れていても落ちない（編集中の空欄は 0 扱い）", () => {
    const t = acceptanceTotals([
      line("1", Number.NaN, 100),
      line("2", 10, Number.NaN),
    ]);
    expect(t.quantity).toBe(10);
    expect(t.amount).toBe(0);
    expect(t.unpricedCount).toBe(1);
  });
});

describe("productSummary", () => {
  const item = (productName: string | null, productText: string | null) => ({
    productName,
    productText,
  });
  // next-intl の t() の代わり（"{first} ほか {count} 種" 相当だけを再現する）
  const tr = (_key: string, values?: Record<string, unknown>) =>
    `${values?.first} ほか ${values?.count} 種`;

  it("1 種類ならその名前", () => {
    expect(productSummary([item("超硬ドリル", "ドリル")], tr).label).toBe(
      "超硬ドリル",
    );
  });

  it("複数なら先頭 + ほか N 種", () => {
    const s = productSummary(
      [
        item("超硬ドリル", null),
        item("ザグリカッター", null),
        item("リーマ", null),
      ],
      tr,
    );
    expect(s.label).toBe("超硬ドリル ほか 2 種");
    expect(s.names).toHaveLength(3);
  });

  it("同じ製品名は 1 つに畳む", () => {
    const s = productSummary(
      [item("超硬ドリル", null), item("超硬ドリル", null)],
      tr,
    );
    expect(s.label).toBe("超硬ドリル");
  });

  it("**未突合の行は抽出された品名で出す**（何の書類か掴めるように）", () => {
    expect(productSummary([item(null, "OHリーマ φ8.3")], tr).label).toBe(
      "OHリーマ φ8.3",
    );
  });

  it("名前が何も無ければダッシュ", () => {
    expect(productSummary([item(null, null), item(null, "  ")], tr)).toEqual({
      label: "—",
      names: [],
    });
  });
});
