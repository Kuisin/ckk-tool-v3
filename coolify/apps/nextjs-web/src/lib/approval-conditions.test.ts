/**
 * approval-conditions.test.ts — 条件付き承認フローの条件評価。
 *
 * 依頼時のフロー分岐（サーバー）と MS0B の条件ビルダー（画面）が同じ判定を
 * 使うので、ここがずれると「設定と違うフローが走る」事故になる。
 */

import { describe, expect, it } from "vitest";
import {
  conditionsFromJson,
  describeConditions,
  evaluateCondition,
  evaluateConditions,
  type FlowCondition,
  matchFlowRule,
  validateConditions,
} from "./approval-conditions";

const cond = (
  field: string,
  op: FlowCondition["op"],
  value: string | number,
): FlowCondition => ({ field, op, value });

describe("evaluateCondition", () => {
  it("数値の gte / lte（境界含む）", () => {
    const info = { total_amount: 500_000 };
    expect(evaluateCondition(cond("total_amount", "gte", 500_000), info)).toBe(
      true,
    );
    expect(evaluateCondition(cond("total_amount", "gte", 500_001), info)).toBe(
      false,
    );
    expect(evaluateCondition(cond("total_amount", "lte", 500_000), info)).toBe(
      true,
    );
    expect(evaluateCondition(cond("total_amount", "lte", 499_999), info)).toBe(
      false,
    );
  });

  it("select の eq / ne は文字列比較", () => {
    const info = { delivery_method: "DIRECT_TO_USER" };
    expect(
      evaluateCondition(cond("delivery_method", "eq", "DIRECT_TO_USER"), info),
    ).toBe(true);
    expect(
      evaluateCondition(cond("delivery_method", "ne", "NORMAL"), info),
    ).toBe(true);
    expect(
      evaluateCondition(cond("delivery_method", "eq", "NORMAL"), info),
    ).toBe(false);
  });

  it("属性が無い / null / 数値でないときは不一致（fail-safe）", () => {
    expect(evaluateCondition(cond("total_amount", "gte", 1), {})).toBe(false);
    expect(
      evaluateCondition(cond("total_amount", "gte", 1), { total_amount: null }),
    ).toBe(false);
    expect(
      evaluateCondition(cond("total_amount", "gte", 1), {
        total_amount: "abc",
      }),
    ).toBe(false);
  });

  it("数値フィールドを id 比較（eq）にも使える", () => {
    expect(
      evaluateCondition(cond("assigned_plant_id", "eq", "3"), {
        assigned_plant_id: "3",
      }),
    ).toBe(true);
  });
});

describe("evaluateConditions / matchFlowRule", () => {
  const rules = [
    {
      id: 1,
      isActive: true,
      conditions: [cond("total_amount", "gte", 1_000_000)],
    },
    {
      id: 2,
      isActive: true,
      conditions: [
        cond("total_amount", "gte", 500_000),
        cond("delivery_method", "eq", "DIRECT_TO_USER"),
      ],
    },
    { id: 3, isActive: false, conditions: [] },
    { id: 4, isActive: true, conditions: [] }, // キャッチオール
  ];

  it("AND — 全条件成立で一致", () => {
    expect(
      evaluateConditions(rules[1].conditions, {
        total_amount: 600_000,
        delivery_method: "DIRECT_TO_USER",
      }),
    ).toBe(true);
    expect(
      evaluateConditions(rules[1].conditions, {
        total_amount: 600_000,
        delivery_method: "NORMAL",
      }),
    ).toBe(false);
  });

  it("優先順で最初に一致した 1 本（無効ルールは飛ばす）", () => {
    expect(
      matchFlowRule(rules, {
        total_amount: 2_000_000,
        delivery_method: "NORMAL",
      })?.id,
    ).toBe(1);
    expect(
      matchFlowRule(rules, {
        total_amount: 600_000,
        delivery_method: "DIRECT_TO_USER",
      })?.id,
    ).toBe(2);
    // どの条件付きにも当たらない → 無効の 3 を飛ばして空条件の 4
    expect(
      matchFlowRule(rules, { total_amount: 100, delivery_method: "NORMAL" })
        ?.id,
    ).toBe(4);
  });

  it("一致なしは null（= 既定フロー）", () => {
    expect(matchFlowRule(rules.slice(0, 3), { total_amount: 100 })).toBeNull();
  });
});

describe("conditionsFromJson", () => {
  it("壊れた要素は捨てる", () => {
    expect(
      conditionsFromJson([
        cond("total_amount", "gte", 1),
        { field: 5, op: "gte", value: 1 },
        { field: "x", op: "like", value: 1 },
        null,
        "text",
      ]),
    ).toEqual([cond("total_amount", "gte", 1)]);
    expect(conditionsFromJson(null)).toEqual([]);
    expect(conditionsFromJson({})).toEqual([]);
  });
});

describe("validateConditions", () => {
  it("未知の項目・型に合わない演算子・値の型を弾く", () => {
    const issues = validateConditions("order_acceptances", [
      cond("unknown_field", "eq", "x"),
      cond("delivery_method", "gte", "NORMAL"),
      cond("total_amount", "gte", "abc" as unknown as number),
      cond("delivery_method", "eq", ""),
    ]);
    expect(issues).toHaveLength(4);
  });

  it("正しい条件は空", () => {
    expect(
      validateConditions("order_acceptances", [
        cond("total_amount", "gte", 500_000),
        cond("delivery_method", "eq", "DIRECT_TO_USER"),
      ]),
    ).toEqual([]);
  });
});

describe("describeConditions", () => {
  it("人が読む要約（数値は桁区切り + 単位、選択肢はラベル）", () => {
    expect(
      describeConditions("order_acceptances", [
        cond("total_amount", "gte", 500_000),
        cond("delivery_method", "eq", "DIRECT_TO_USER"),
      ]),
    ).toBe("合計金額が 500,000円 以上 かつ 配送方法が「ユーザー直送」に等しい");
  });

  it("動的選択肢（拠点）は dynamicOptions からラベルを引く", () => {
    expect(
      describeConditions(
        "order_acceptances",
        [cond("assigned_plant_id", "eq", "3")],
        { plants: [{ value: "3", label: "本社工場" }] },
      ),
    ).toBe("担当拠点が「本社工場」に等しい");
  });

  it("条件なしはキャッチオールの説明", () => {
    expect(describeConditions("work_orders", [])).toBe(
      "条件なし（すべての書類に一致）",
    );
  });
});
