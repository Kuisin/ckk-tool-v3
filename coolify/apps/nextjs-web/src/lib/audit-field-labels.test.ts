import { describe, expect, it } from "vitest";
import {
  auditFieldDiffs,
  auditFieldLabel,
  formatAuditValue,
} from "./audit-field-labels";

describe("auditFieldLabel", () => {
  it("共通の列は日本語にする", () => {
    expect(auditFieldLabel("unitPrice")).toBe("単価");
    expect(auditFieldLabel("assignedPlantId")).toBe("担当拠点");
  });

  it("表ごとに意味が違う列は上書きが勝つ", () => {
    expect(auditFieldLabel("name")).toBe("名称");
    expect(auditFieldLabel("name", "kiosk_devices")).toBe("端末名");
    expect(auditFieldLabel("name", "display_devices")).toBe("ディスプレイ名");
  });

  // 知らない列を勝手に訳すと、間違った名前が履歴に残る
  it("知らない列はキーのまま出す", () => {
    expect(auditFieldLabel("someUnknownColumn")).toBe("someUnknownColumn");
    expect(auditFieldLabel("name", "unknown_table")).toBe("名称");
  });
});

describe("formatAuditValue", () => {
  it("空・真偽・数値", () => {
    expect(formatAuditValue(null)).toBe("—");
    expect(formatAuditValue("")).toBe("—");
    expect(formatAuditValue(true)).toBe("はい");
    expect(formatAuditValue(false)).toBe("いいえ");
    expect(formatAuditValue(125)).toBe("125");
  });

  it("日付は読みやすくする（日付だけ / 日時）", () => {
    expect(formatAuditValue("2026-09-01")).toBe("2026/09/01");
    expect(formatAuditValue("2026-09-01T14:30:00.000Z")).toMatch(
      /^2026\/09\/01 \d{2}:\d{2}$/,
    );
  });

  it("多言語 JSON は既定言語だけ出す", () => {
    expect(formatAuditValue({ ja: "本社工場", en: "HQ Plant" })).toBe(
      "本社工場",
    );
  });

  it("配列は並べる。空は「（なし）」", () => {
    expect(formatAuditValue(["A", "B"])).toBe("A, B");
    expect(formatAuditValue([])).toBe("（なし）");
  });

  // 分からない形を要約すると嘘になる。JSON のまま出して生データと突き合わせられるようにする
  it("見慣れない形は JSON のまま", () => {
    expect(formatAuditValue({ page: "production", options: { rows: 8 } })).toBe(
      '{"page":"production","options":{"rows":8}}',
    );
  });
});

describe("auditFieldDiffs", () => {
  it("変わった列だけ返し、ラベルを付ける", () => {
    const diffs = auditFieldDiffs(
      { scalePercent: 100, name: "A", notes: "同じ" },
      { scalePercent: 125, name: "B", notes: "同じ" },
      "display_devices",
    );
    expect(diffs.map((d) => d.key).sort()).toEqual(["name", "scalePercent"]);
    expect(diffs.find((d) => d.key === "scalePercent")?.label).toBe(
      "表示倍率（%）",
    );
  });

  // 型だけ違う同じ値を差分に出すと、「何も変えていないのに履歴が出る」になる
  it("整形後が同じなら差分にしない", () => {
    expect(auditFieldDiffs({ a: 1 }, { a: "1" })).toEqual([]);
    expect(auditFieldDiffs({ a: null }, { a: "" })).toEqual([]);
  });

  it("片側しか無い列も差分になる（追加・削除）", () => {
    const diffs = auditFieldDiffs({}, { status: "ACTIVE" });
    expect(diffs).toHaveLength(1);
    expect(diffs[0].label).toBe("ステータス");
    expect(formatAuditValue(diffs[0].before)).toBe("—");
  });

  it("オブジェクトでない入力では落ちない", () => {
    expect(auditFieldDiffs(null, null)).toEqual([]);
  });
});
