import { describe, expect, it } from "vitest";
import {
  type AcceptanceStatus,
  isLineCancellable,
  isLineEditable,
  isLineStockCheckable,
  type LineLockState,
  lineConfirmBlockReason,
  lineEditBlockReason,
  lineShipStatus,
  linesReplaceBlockReason,
  nextBranches,
  type OrderLineStatus,
} from "./order-line-core";

const line = (o: Partial<LineLockState> = {}): LineLockState => ({
  status: "DRAFT",
  branch: null,
  isLocked: false,
  ...o,
});

const ALL_STATUSES: OrderLineStatus[] = [
  "DRAFT",
  "CONFIRMED",
  "IN_PRODUCTION",
  "PARTIAL_SHIPPED",
  "SHIPPED",
  "CANCELLED",
];

describe("isLineEditable", () => {
  it("未確定・未ロックの下書きだけ編集できる", () => {
    expect(isLineEditable(line())).toBe(true);
  });

  it("枝番が付いた時点で編集不可 — status が DRAFT でも", () => {
    // 「確定後は変更不可」の最後の砦。status の遷移をいじっても破れない。
    expect(isLineEditable(line({ branch: 1 }))).toBe(false);
    expect(isLineEditable(line({ status: "DRAFT", branch: 1 }))).toBe(false);
  });

  it("承認依頼中ロックでは編集不可", () => {
    expect(isLineEditable(line({ isLocked: true }))).toBe(false);
  });

  it("DRAFT 以外はすべて編集不可", () => {
    for (const status of ALL_STATUSES.filter((s) => s !== "DRAFT")) {
      expect(isLineEditable(line({ status }))).toBe(false);
    }
  });
});

describe("lineEditBlockReason", () => {
  it("編集可なら null", () => {
    expect(lineEditBlockReason(line())).toBeNull();
  });

  it("確定済みは確定済みの理由を返す", () => {
    expect(lineEditBlockReason(line({ branch: 2 }))).toBe(
      "確定済みの受注明細は変更できません",
    );
    expect(lineEditBlockReason(line({ status: "IN_PRODUCTION" }))).toBe(
      "確定済みの受注明細は変更できません",
    );
  });

  it("ロック中はロックの理由を返す", () => {
    expect(lineEditBlockReason(line({ isLocked: true }))).toBe(
      "承認依頼中の受注明細は変更できません",
    );
  });
});

describe("linesReplaceBlockReason", () => {
  const editableHeaders: AcceptanceStatus[] = ["IMPORT", "DRAFT"];
  const lockedHeaders: AcceptanceStatus[] = [
    "REQUESTED",
    "APPROVED",
    "COMPLETED",
    "ARCHIVED",
  ];

  it("取込中・下書きヘッダ + 全行未確定なら置換できる", () => {
    for (const status of editableHeaders) {
      expect(linesReplaceBlockReason(status, [line(), line()])).toBeNull();
    }
  });

  it("承認以降のヘッダでは置換できない", () => {
    for (const status of lockedHeaders) {
      expect(linesReplaceBlockReason(status, [])).toBe(
        "下書きの受注請書のみ編集できます",
      );
    }
  });

  it("1 行でも確定済みなら置換できない", () => {
    expect(
      linesReplaceBlockReason("DRAFT", [line(), line({ branch: 1 })]),
    ).toBe("確定済みの受注明細は変更できません");
  });

  it("明細ゼロの下書きは置換できる", () => {
    expect(linesReplaceBlockReason("DRAFT", [])).toBeNull();
  });
});

describe("isLineCancellable", () => {
  it("出荷済・キャンセル済以外はキャンセルできる", () => {
    for (const status of ALL_STATUSES) {
      const expected = status !== "SHIPPED" && status !== "CANCELLED";
      expect(isLineCancellable({ status })).toBe(expected);
    }
  });
});

describe("isLineStockCheckable", () => {
  it("下書き・確定のみ在庫照合できる", () => {
    for (const status of ALL_STATUSES) {
      const expected = status === "DRAFT" || status === "CONFIRMED";
      expect(isLineStockCheckable({ status })).toBe(expected);
    }
  });
});

describe("lineShipStatus", () => {
  it("未出荷は変化なし", () => {
    expect(lineShipStatus(10, 0)).toBeNull();
  });

  it("一部出荷は PARTIAL_SHIPPED", () => {
    expect(lineShipStatus(10, 4)).toBe("PARTIAL_SHIPPED");
  });

  it("全量出荷は SHIPPED", () => {
    expect(lineShipStatus(10, 10)).toBe("SHIPPED");
  });

  it("過出荷でも SHIPPED（拒否は呼び出し側の責務）", () => {
    expect(lineShipStatus(10, 11)).toBe("SHIPPED");
  });
});

describe("nextBranches", () => {
  it("新規受注請書は 1 から採番する", () => {
    expect(nextBranches(0, 3)).toEqual([1, 2, 3]);
  });

  it("既存の枝番を再発行しない", () => {
    expect(nextBranches(2, 2)).toEqual([3, 4]);
  });

  it("0 件なら空", () => {
    expect(nextBranches(5, 0)).toEqual([]);
  });
});

describe("lineConfirmBlockReason", () => {
  it("製品と単価が揃っていれば確定できる", () => {
    expect(lineConfirmBlockReason({ productId: 1, unitPrice: 100 })).toBeNull();
  });

  it("製品未特定は確定できない", () => {
    expect(lineConfirmBlockReason({ productId: null, unitPrice: 100 })).toBe(
      "製品未特定",
    );
  });

  it("単価未入力は確定できない", () => {
    expect(lineConfirmBlockReason({ productId: 1, unitPrice: null })).toBe(
      "単価未入力",
    );
  });

  it("単価 0 は有効な値として扱う（サンプルは金額 0）", () => {
    expect(lineConfirmBlockReason({ productId: 1, unitPrice: 0 })).toBeNull();
  });
});
