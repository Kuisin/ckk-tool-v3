import { describe, expect, it } from "vitest";
import { auditValueLabel } from "./audit-value-labels";

describe("auditValueLabel", () => {
  it("status は表ごとの STATUS_MAPS から引く", () => {
    expect(
      auditValueLabel("status", "REQUESTED", "purchase_requests", "ja"),
    ).toBe("承認依頼中");
    expect(auditValueLabel("status", "DRAFT", "quotes", "ja")).toBe("下書き");
  });

  it("同じ値でも表が違えばラベルも違う（状態は表ごとに意味が違う）", () => {
    // work_orders の CANCELLED と quotes の CANCELLED は別の状態集合。
    expect(auditValueLabel("status", "CANCELLED", "work_orders", "ja")).toBe(
      "キャンセル",
    );
  });

  it("表が分からない・登録が無い status は undefined", () => {
    expect(
      auditValueLabel("status", "REQUESTED", undefined, "ja"),
    ).toBeUndefined();
    expect(
      auditValueLabel("status", "REQUESTED", "no_such_table", "ja"),
    ).toBeUndefined();
  });

  it("STATUS_MAPS に無い値は undefined（値＝ラベルと区別する）", () => {
    expect(
      auditValueLabel("status", "SOME_UNKNOWN_VALUE", "quotes", "ja"),
    ).toBeUndefined();
  });

  it("ENUM_MAP_BY_FIELD の登録列は enum ラベルを引く", () => {
    expect(
      auditValueLabel(
        "executionLocation",
        "INTERNAL_OR_OUTSOURCE",
        "process_step_catalog",
        "ja",
      ),
    ).toBe("社内・外注");
    expect(auditValueLabel("taxType", "TAXABLE", undefined, "ja")).toBe("課税");
  });

  it("同じ列名でも表が違えば別の enum を引く（deliveryMethod）", () => {
    expect(
      auditValueLabel("deliveryMethod", "NORMAL", "order_acceptances", "ja"),
    ).toBe("通常配送");
    expect(
      auditValueLabel("deliveryMethod", "NORMAL", "delivery_notes", "ja"),
    ).toBe("通常納品");
    expect(
      auditValueLabel(
        "deliveryMethod",
        "DIRECT_TO_USER",
        "order_acceptances",
        "ja",
      ),
    ).toBe("ユーザー直送");
  });

  it("訳は用意しても、監査されていない表・列は配線しない（executionLocation）", () => {
    // STEP_EXECUTION_LABEL 自体は存在するが、work_order_steps を直接監査する
    // 呼び出しが無い（変更は親の work_orders 側へ記録される）ので未配線 —
    // 実在しない対応を推測で足さない。
    expect(
      auditValueLabel(
        "executionLocation",
        "OUTSOURCE",
        "work_order_steps",
        "ja",
      ),
    ).toBeUndefined();
    expect(
      auditValueLabel("executionLocation", "OUTSOURCE", undefined, "ja"),
    ).toBeUndefined();
  });

  it("表を跨いで意味が変わりうる 1 語の列名（type/mode/role）は登録しない", () => {
    expect(auditValueLabel("type", "MANUFACTURE", "work_orders", "ja")).toBe(
      // work_orders.type だけは個別に table-qualified で登録してある
      "製造分",
    );
    expect(
      auditValueLabel("type", "MANUFACTURE", undefined, "ja"),
    ).toBeUndefined();
    expect(
      auditValueLabel("mode", "ANY", "approval_groups", "ja"),
    ).toBeUndefined();
  });

  it("relation は衝突が無いので bare で登録してある（DependencyRelation）", () => {
    expect(
      auditValueLabel("relation", "OR", "process_step_use_dependencies", "ja"),
    ).toBe("OR（いずれか）");
    expect(auditValueLabel("relation", "AND", undefined, "ja")).toBe(
      "AND（すべて）",
    );
  });

  it("kind は表ごとに 3 通りの enum に分かれる（design_requests/forms/user_change_requests）", () => {
    expect(auditValueLabel("kind", "REVISION", "design_requests", "ja")).toBe(
      "改訂",
    );
    expect(auditValueLabel("kind", "SURVEY", "forms", "ja")).toBe("アンケート");
    expect(
      auditValueLabel("kind", "UPDATE_ROLES", "user_change_requests", "ja"),
    ).toBe("ロール割当の変更");
    // bare（表が分からない）は登録していない — 3 通りのうちどれか判定できない。
    expect(
      auditValueLabel("kind", "REVISION", undefined, "ja"),
    ).toBeUndefined();
  });

  it("design_requests の trigger / priority も引ける", () => {
    expect(
      auditValueLabel("trigger", "SALES_ORDER", "design_requests", "ja"),
    ).toBe("受注時");
    expect(auditValueLabel("priority", "HIGH", "design_requests", "ja")).toBe(
      "急ぎ",
    );
  });

  it("未知の値・未登録の列は undefined（生の値を出させる）", () => {
    expect(
      auditValueLabel("someUnknownField", "SOME_VALUE", undefined, "ja"),
    ).toBeUndefined();
  });

  it("locale で違う言語のラベルを返す", () => {
    expect(auditValueLabel("taxType", "TAXABLE", undefined, "en")).toBe(
      "Taxable",
    );
  });

  it("入れ子キー（contentConfig.xxx 形）は葉だけを見る", () => {
    expect(
      auditValueLabel("someTable.taxType", "TAXABLE", undefined, "ja"),
    ).toBe("課税");
  });
});
