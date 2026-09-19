import { describe, expect, it } from "vitest";
import {
  hasEndpoint,
  isValidRule,
  type MovementDraft,
  type MovementEndpoint,
  type MovementTypeRule,
  postingsFor,
  requiredEndpoints,
  validateMovement,
} from "./movement-type-core";

const at = (
  plantId: number | null,
  storageLocationId: number | null = null,
  shelfId: number | null = null,
): MovementEndpoint => ({ plantId, storageLocationId, shelfId });

const nowhere = at(null);

const rule = (
  direction: MovementTypeRule["direction"],
  requiresFrom = false,
  requiresTo = false,
): MovementTypeRule => ({ direction, requiresFrom, requiresTo });

const draft = (over: Partial<MovementDraft> = {}): MovementDraft => ({
  itemId: 1,
  quantity: 5,
  from: nowhere,
  to: nowhere,
  ...over,
});

describe("向きが要求する最低限", () => {
  it("入庫は入庫先だけ、出庫は出庫元だけ、移動は両方", () => {
    expect(requiredEndpoints("IN")).toEqual({ from: false, to: true });
    expect(requiredEndpoints("OUT")).toEqual({ from: true, to: false });
    expect(requiredEndpoints("TRANSFER")).toEqual({ from: true, to: true });
  });

  it("**向きが要求するぶんは設定で外せない** — 出庫元の無い出庫はどこから引くか決まらない", () => {
    expect(isValidRule(rule("OUT", true, false))).toBe(true);
    expect(isValidRule(rule("OUT", false, false))).toBe(false);
    expect(isValidRule(rule("TRANSFER", true, true))).toBe(true);
    expect(isValidRule(rule("TRANSFER", true, false))).toBe(false);
  });

  it("下限を超えて要求するのは自由（入庫だが元も記録したい型）", () => {
    expect(isValidRule(rule("IN", true, true))).toBe(true);
  });
});

describe("入力の検査", () => {
  it("入庫に入庫先が無ければ弾く", () => {
    expect(validateMovement(rule("IN", false, true), draft())).toContain(
      "toRequired",
    );
    expect(
      validateMovement(rule("IN", false, true), draft({ to: at(1) })),
    ).toEqual([]);
  });

  it("出庫に出庫元が無ければ弾く", () => {
    expect(validateMovement(rule("OUT", true), draft())).toContain(
      "fromRequired",
    );
  });

  it("設定で足した要求も効く（入庫だが元も必須にした型）", () => {
    const r = rule("IN", true, true);
    expect(validateMovement(r, draft({ to: at(1) }))).toContain("fromRequired");
    expect(validateMovement(r, draft({ from: at(2), to: at(1) }))).toEqual([]);
  });

  it("数量は正、品目は必須", () => {
    const r = rule("IN", false, true);
    expect(validateMovement(r, draft({ to: at(1), quantity: 0 }))).toContain(
      "quantityPositive",
    );
    expect(validateMovement(r, draft({ to: at(1), quantity: -3 }))).toContain(
      "quantityPositive",
    );
    expect(validateMovement(r, draft({ to: at(1), itemId: null }))).toContain(
      "itemRequired",
    );
  });

  it("同じ場所への移動は弾く（動いていない）", () => {
    const r = rule("TRANSFER", true, true);
    expect(
      validateMovement(r, draft({ from: at(1, 2, 3), to: at(1, 2, 3) })),
    ).toContain("sameEndpoint");
    // 棚だけ違えば移動として成立する
    expect(
      validateMovement(r, draft({ from: at(1, 2, 3), to: at(1, 2, 4) })),
    ).toEqual([]);
  });

  it("入庫・出庫では「同じ場所」を見ない（片側しか使わない）", () => {
    expect(
      validateMovement(
        rule("IN", false, true),
        draft({ from: at(1), to: at(1) }),
      ),
    ).toEqual([]);
  });

  it("拠点が入っていれば置き場所として成立する（保管場所は未割当でよい）", () => {
    expect(hasEndpoint(at(1))).toBe(true);
    expect(hasEndpoint(nowhere)).toBe(false);
  });
});

describe("計上の並び", () => {
  it("入庫は IN 1 本、出庫は OUT 1 本", () => {
    expect(postingsFor(rule("IN", false, true), draft({ to: at(1) }))).toEqual([
      { endpoint: at(1), transactionType: "IN" },
    ]);
    expect(postingsFor(rule("OUT", true), draft({ from: at(2) }))).toEqual([
      { endpoint: at(2), transactionType: "OUT" },
    ]);
  });

  it("**移動は OUT が先** — 先に入れると、足りないときに「増えてから失敗する」順になる", () => {
    const steps = postingsFor(
      rule("TRANSFER", true, true),
      draft({ from: at(1), to: at(2) }),
    );
    expect(steps.map((s) => s.transactionType)).toEqual(["OUT", "IN"]);
    expect(steps[0]?.endpoint).toEqual(at(1));
    expect(steps[1]?.endpoint).toEqual(at(2));
  });
});
