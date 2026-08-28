import { describe, expect, it } from "vitest";
import {
  answerShape,
  attachmentCount,
  formatNumberAnswer,
  isBlankAnswer,
  isLongAnswer,
  selectedLabels,
  tableRows,
} from "./form-answer-display";
import type { FormFieldDef } from "./form-schema";
import { formatCalendarDate, formatClockTime } from "./format";

function field(over: Partial<FormFieldDef> = {}): FormFieldDef {
  return {
    key: "f",
    label: { ja: "項目", en: "" },
    type: "text",
    required: false,
    order: 0,
    ...over,
  };
}

describe("answerShape", () => {
  it("高さが中身で決まる型を long / table / related に振る", () => {
    expect(answerShape("textarea")).toBe("long");
    expect(answerShape("richtext")).toBe("long");
    expect(answerShape("table")).toBe("table");
    expect(answerShape("related")).toBe("related");
    expect(isLongAnswer("textarea")).toBe(true);
    expect(isLongAnswer("table")).toBe(true);
    expect(isLongAnswer("text")).toBe(false);
  });

  it("1 行に収まる型は inline", () => {
    for (const t of [
      "text",
      "number",
      "date",
      "time",
      "select",
      "lookup",
    ] as const)
      expect(answerShape(t)).toBe("inline");
  });
});

describe("isBlankAnswer", () => {
  it("空文字・空白・空配列・null を未回答とみなす", () => {
    expect(isBlankAnswer("text", null)).toBe(true);
    expect(isBlankAnswer("text", "")).toBe(true);
    expect(isBlankAnswer("text", "   ")).toBe(true);
    expect(isBlankAnswer("multiselect", [])).toBe(true);
    expect(isBlankAnswer("text", "a")).toBe(false);
  });

  it("空段落だけのリッチテキストも未回答とみなす", () => {
    const empty = { type: "doc", content: [{ type: "paragraph" }] };
    expect(isBlankAnswer("richtext", empty as never)).toBe(true);
    const filled = {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "本文" }] },
      ],
    };
    expect(isBlankAnswer("richtext", filled as never)).toBe(false);
  });

  it("id の無い lookup は未回答", () => {
    expect(isBlankAnswer("lookup", { id: "", label: "" })).toBe(true);
    expect(isBlankAnswer("lookup", { id: "u1", label: "山田" })).toBe(false);
  });
});

describe("selectedLabels", () => {
  const options = [
    { value: "a", label: { ja: "あ", en: "A" } },
    { value: "b", label: { ja: "い", en: "B" } },
    { value: "c", label: { ja: "う", en: "C" } },
  ];

  it("select は 1 つ、ラベルに直す", () => {
    const f = field({ type: "select", options });
    expect(selectedLabels(f, "b")).toEqual(["い"]);
    expect(selectedLabels(f, "")).toEqual([]);
  });

  it("multiselect は選んだ順ではなく定義順で並べる", () => {
    const f = field({ type: "multiselect", options });
    expect(selectedLabels(f, ["c", "a"])).toEqual(["あ", "う"]);
  });

  it("定義から消えた選択肢は末尾に残す（その回答の事実だから）", () => {
    const f = field({ type: "multiselect", options });
    expect(selectedLabels(f, ["z", "a"])).toEqual(["あ", "z"]);
  });
});

describe("formatNumberAnswer", () => {
  it("桁区切りだけを足す", () => {
    expect(formatNumberAnswer("1234567")).toBe("1,234,567");
    expect(formatNumberAnswer("-1234.5")).toBe("-1,234.5");
    // 型には無いが JSON には入りうる数値（form-export-core と同じ注記）。
    expect(formatNumberAnswer(1234 as never)).toBe("1,234");
  });

  it("書かれた表現を変えない（前ゼロ・末尾ゼロを保つ）", () => {
    expect(formatNumberAnswer("007")).toBe("007");
    expect(formatNumberAnswer("1.50")).toBe("1.50");
  });

  it("数値の形でないものはそのまま返す", () => {
    expect(formatNumberAnswer("1e5")).toBe("1e5");
    expect(formatNumberAnswer("約 3")).toBe("約 3");
    expect(formatNumberAnswer(null)).toBe("");
  });
});

describe("tableRows / attachmentCount", () => {
  it("行でないものを混ぜない", () => {
    expect(tableRows([{ a: "1" }, null, "x"] as never)).toEqual([{ a: "1" }]);
    expect(tableRows("x" as never)).toEqual([]);
  });

  it("添付は個数だけを数える", () => {
    expect(attachmentCount(["f1", "f2"])).toBe(2);
    expect(attachmentCount(null)).toBe(0);
  });
});

describe("暦の日付・時計の時刻はタイムゾーンで動かさない", () => {
  it("日付は並べ替えるだけ", () => {
    expect(formatCalendarDate("2026-03-01", "YYYY/MM/DD")).toBe("2026/03/01");
    expect(formatCalendarDate("2026-03-01", "DD/MM/YYYY")).toBe("01/03/2026");
    expect(formatCalendarDate("2026-03-01", "MM/DD/YYYY")).toBe("03/01/2026");
    expect(formatCalendarDate("2026-03-01", "YYYY-MM-DD")).toBe("2026-03-01");
  });

  it("形が合わない値はそのまま返す（過去の版の回答が残っている）", () => {
    expect(formatCalendarDate("2026/3/1", "YYYY/MM/DD")).toBe("2026/3/1");
    expect(formatCalendarDate("", "YYYY/MM/DD")).toBe("—");
  });

  it("時刻は 24h ならゼロ詰め、12h なら午前午後に直す", () => {
    expect(formatClockTime("9:05", "24h")).toBe("09:05");
    expect(formatClockTime("13:30", "12h")).toBe("1:30 PM");
    expect(formatClockTime("00:30", "12h")).toBe("12:30 AM");
    expect(formatClockTime("25:00", "24h")).toBe("25:00");
  });
});
