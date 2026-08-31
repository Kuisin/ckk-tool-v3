import { describe, expect, it } from "vitest";
import {
  type BoardEntry,
  type BoardRow,
  type BoardStep,
  pageIndexAt,
  paginate,
  sortBoardEntries,
  toBoardEntry,
} from "./display-board-core";

function step(over: Partial<BoardStep> = {}): BoardStep {
  return {
    id: over.id ?? "s1",
    name: over.name ?? "円筒加工",
    sortOrder: over.sortOrder ?? 1,
    status: over.status ?? "PENDING",
    paused: over.paused ?? false,
    inputQuantity: over.inputQuantity ?? null,
    outputSuccessQuantity: over.outputSuccessQuantity ?? null,
    assignees: over.assignees ?? [],
  };
}

function row(over: Partial<BoardRow> = {}): BoardRow {
  return {
    workOrderId: over.workOrderId ?? "wo1",
    lotNumber: over.lotNumber ?? 1001,
    documentNumber: over.documentNumber ?? "WOR-202608-00001",
    productName: over.productName ?? "テスト製品",
    plannedQuantity: over.plannedQuantity ?? 50,
    steps: over.steps ?? [],
  };
}

describe("toBoardEntry — いま見せる工程の選び方", () => {
  it("進行中があればそれを選ぶ", () => {
    const e = toBoardEntry(
      row({
        steps: [
          step({
            id: "a",
            sortOrder: 1,
            name: "材料準備",
            status: "COMPLETED",
          }),
          step({ id: "b", sortOrder: 2, name: "加工", status: "IN_PROGRESS" }),
          step({ id: "c", sortOrder: 3, name: "検査", status: "PENDING" }),
        ],
      }),
    );
    expect(e.currentStepName).toBe("加工");
    expect(e.currentStepStatus).toBe("IN_PROGRESS");
  });

  it("進行中が複数なら工程順で最初", () => {
    const e = toBoardEntry(
      row({
        steps: [
          step({ id: "b", sortOrder: 3, name: "後", status: "IN_PROGRESS" }),
          step({ id: "a", sortOrder: 2, name: "先", status: "IN_PROGRESS" }),
        ],
      }),
    );
    expect(e.currentStepName).toBe("先");
  });

  it("進行中が無ければ最初の未着手", () => {
    const e = toBoardEntry(
      row({
        steps: [
          step({
            id: "a",
            sortOrder: 1,
            name: "材料準備",
            status: "COMPLETED",
          }),
          step({ id: "b", sortOrder: 2, name: "加工", status: "PENDING" }),
          step({ id: "c", sortOrder: 3, name: "検査", status: "PENDING" }),
        ],
      }),
    );
    expect(e.currentStepName).toBe("加工");
    expect(e.currentStepStatus).toBe("PENDING");
  });

  it("全部完了なら最後の完了工程", () => {
    const e = toBoardEntry(
      row({
        steps: [
          step({ id: "a", sortOrder: 1, name: "加工", status: "COMPLETED" }),
          step({ id: "b", sortOrder: 2, name: "検査", status: "COMPLETED" }),
        ],
      }),
    );
    expect(e.currentStepName).toBe("検査");
    expect(e.progressPercent).toBe(100);
  });

  it("キャンセルされた工程は選ばず、母数からも外す", () => {
    const e = toBoardEntry(
      row({
        steps: [
          step({ id: "a", sortOrder: 1, name: "加工", status: "COMPLETED" }),
          step({ id: "b", sortOrder: 2, name: "中止", status: "CANCELLED" }),
        ],
      }),
    );
    expect(e.currentStepName).toBe("加工");
    expect(e.totalSteps).toBe(1);
    expect(e.progressPercent).toBe(100);
  });

  it("工程がゼロでも壊れない（0% / null）", () => {
    const e = toBoardEntry(row({ steps: [] }));
    expect(e.currentStepName).toBeNull();
    expect(e.totalSteps).toBe(0);
    expect(e.progressPercent).toBe(0);
    expect(e.quantity).toBeNull();
  });

  it("一時停止は進行中のときだけ立つ", () => {
    const paused = toBoardEntry(
      row({
        steps: [step({ status: "IN_PROGRESS", paused: true })],
      }),
    );
    expect(paused.paused).toBe(true);

    // 未着手工程に paused が立っていても引きずらない
    const pending = toBoardEntry(
      row({ steps: [step({ status: "PENDING", paused: true })] }),
    );
    expect(pending.paused).toBe(false);
  });

  it("数量は良品数を優先し、無ければ受入数", () => {
    const good = toBoardEntry(
      row({
        steps: [
          step({
            status: "IN_PROGRESS",
            inputQuantity: 50,
            outputSuccessQuantity: 48,
          }),
        ],
      }),
    );
    expect(good.quantity).toBe(48);

    const onlyInput = toBoardEntry(
      row({ steps: [step({ status: "IN_PROGRESS", inputQuantity: 50 })] }),
    );
    expect(onlyInput.quantity).toBe(50);
  });

  it("良品数 0 は「無い」ではなく 0 として扱う", () => {
    // ?? を使っているので 0 が落ちない（|| だと受入数に化ける）
    const e = toBoardEntry(
      row({
        steps: [
          step({
            status: "COMPLETED",
            inputQuantity: 50,
            outputSuccessQuantity: 0,
          }),
        ],
      }),
    );
    expect(e.quantity).toBe(0);
  });

  it("進捗率は四捨五入した整数", () => {
    const e = toBoardEntry(
      row({
        steps: [
          step({ id: "a", sortOrder: 1, status: "COMPLETED" }),
          step({ id: "b", sortOrder: 2, status: "PENDING" }),
          step({ id: "c", sortOrder: 3, status: "PENDING" }),
        ],
      }),
    );
    expect(e.progressPercent).toBe(33);
  });
});

describe("sortBoardEntries", () => {
  const make = (over: Partial<BoardEntry>): BoardEntry => ({
    workOrderId: over.workOrderId ?? "x",
    lotNumber: over.lotNumber ?? 1,
    documentNumber: "WOR-202608-00001",
    productName: "p",
    plannedQuantity: 1,
    currentStepName: null,
    currentStepStatus: over.currentStepStatus ?? null,
    paused: over.paused ?? false,
    assignees: [],
    completedSteps: 0,
    totalSteps: 1,
    progressPercent: 0,
    quantity: null,
  });

  it("進行中 → 一時停止 → 着手待ち → 完了 の順", () => {
    const sorted = sortBoardEntries([
      make({ workOrderId: "done", currentStepStatus: "COMPLETED" }),
      make({ workOrderId: "pending", currentStepStatus: "PENDING" }),
      make({
        workOrderId: "paused",
        currentStepStatus: "IN_PROGRESS",
        paused: true,
      }),
      make({ workOrderId: "running", currentStepStatus: "IN_PROGRESS" }),
    ]);
    expect(sorted.map((e) => e.workOrderId)).toEqual([
      "running",
      "paused",
      "pending",
      "done",
    ]);
  });

  it("同順位はロット番号の小さい順（先に流したものが上）", () => {
    const sorted = sortBoardEntries([
      make({ workOrderId: "b", lotNumber: 1200, currentStepStatus: "PENDING" }),
      make({ workOrderId: "a", lotNumber: 1100, currentStepStatus: "PENDING" }),
    ]);
    expect(sorted.map((e) => e.workOrderId)).toEqual(["a", "b"]);
  });

  it("元の配列を破壊しない", () => {
    const input = [
      make({ workOrderId: "done", currentStepStatus: "COMPLETED" }),
      make({ workOrderId: "running", currentStepStatus: "IN_PROGRESS" }),
    ];
    sortBoardEntries(input);
    expect(input.map((e) => e.workOrderId)).toEqual(["done", "running"]);
  });
});

describe("paginate", () => {
  it("指定件数で切る", () => {
    expect(paginate([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it("ちょうど割り切れるとき空ページを作らない", () => {
    expect(paginate([1, 2, 3, 4], 2)).toEqual([
      [1, 2],
      [3, 4],
    ]);
  });

  it("空でも 1 ページ返す（呼び出し側が空配列を触らずに済む）", () => {
    expect(paginate([], 5)).toEqual([[]]);
  });

  it("perPage が 0 以下なら分割しない", () => {
    expect(paginate([1, 2, 3], 0)).toEqual([[1, 2, 3]]);
    expect(paginate([1, 2, 3], -1)).toEqual([[1, 2, 3]]);
  });
});

describe("pageIndexAt", () => {
  it("経過時間で順に送り、最後まで行ったら先頭へ戻る", () => {
    expect(pageIndexAt(0, 3, 10_000)).toBe(0);
    expect(pageIndexAt(9_999, 3, 10_000)).toBe(0);
    expect(pageIndexAt(10_000, 3, 10_000)).toBe(1);
    expect(pageIndexAt(20_000, 3, 10_000)).toBe(2);
    expect(pageIndexAt(30_000, 3, 10_000)).toBe(0);
  });

  it("1 ページ以下・間隔ゼロなら常に先頭", () => {
    expect(pageIndexAt(99_999, 1, 10_000)).toBe(0);
    expect(pageIndexAt(99_999, 0, 10_000)).toBe(0);
    expect(pageIndexAt(99_999, 3, 0)).toBe(0);
  });
});
