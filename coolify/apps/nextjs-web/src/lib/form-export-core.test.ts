import { describe, expect, it } from "vitest";
import {
  answerToCellText,
  EMPTY_EXPORT_FILTER,
  endOfDay,
  exportFields,
  exportFilterToParams,
  fieldLabel,
  matchesExportFilter,
  numericAnswer,
  parseExportFilter,
} from "./form-export-core";
import type { FormFieldDef } from "./form-schema";

function field(over: Partial<FormFieldDef>): FormFieldDef {
  return {
    key: "f1",
    label: { ja: "項目", en: "Field" },
    type: "text",
    required: false,
    order: 0,
    ...over,
  };
}

describe("matchesExportFilter", () => {
  const at = (iso: string) => new Date(iso);
  const row = (status: string, submittedAt: Date | null) => ({
    status,
    submittedAt,
  });

  it("空の絞り込みは全部通す", () => {
    const filter = { statuses: [], from: null, to: null, fieldKeys: [] };
    expect(matchesExportFilter(row("SUBMITTED", null), filter)).toBe(true);
  });

  it("状態で絞る", () => {
    const filter = {
      statuses: ["APPROVED"],
      from: null,
      to: null,
      fieldKeys: [],
    };
    expect(matchesExportFilter(row("APPROVED", null), filter)).toBe(true);
    expect(matchesExportFilter(row("REJECTED", null), filter)).toBe(false);
  });

  it("提出日の範囲で絞る（両端を含む）", () => {
    const filter = {
      statuses: [],
      from: at("2026-03-01T00:00:00Z"),
      to: at("2026-03-31T23:59:59.999Z"),
      fieldKeys: [],
    };
    expect(
      matchesExportFilter(row("SUBMITTED", at("2026-03-01T00:00:00Z")), filter),
    ).toBe(true);
    expect(
      matchesExportFilter(
        row("SUBMITTED", at("2026-03-31T23:59:59.999Z")),
        filter,
      ),
    ).toBe(true);
    expect(
      matchesExportFilter(row("SUBMITTED", at("2026-02-28T23:59:59Z")), filter),
    ).toBe(false);
    expect(
      matchesExportFilter(row("SUBMITTED", at("2026-04-01T00:00:00Z")), filter),
    ).toBe(false);
  });

  it("提出日で絞るとき、未提出の回答は落とす", () => {
    const filter = {
      statuses: [],
      from: at("2026-03-01T00:00:00Z"),
      to: null,
      fieldKeys: [],
    };
    expect(matchesExportFilter(row("SUBMITTED", null), filter)).toBe(false);
    // 日付で絞っていなければ残る
    expect(
      matchesExportFilter(row("SUBMITTED", null), {
        ...filter,
        from: null,
      }),
    ).toBe(true);
  });
});

describe("endOfDay", () => {
  it("その日の終わりまで伸ばす（選んだ日に出したものを含めるため）", () => {
    const end = endOfDay(new Date("2026-03-31T00:00:00"));
    expect(end.getHours()).toBe(23);
    expect(end.getMinutes()).toBe(59);
    expect(end.getMilliseconds()).toBe(999);
  });
});

describe("fieldLabel", () => {
  it("ja → en → キー の順に落ちる", () => {
    expect(fieldLabel(field({ label: { ja: "氏名", en: "Name" } }))).toBe(
      "氏名",
    );
    expect(fieldLabel(field({ label: { ja: "", en: "Name" } }))).toBe("Name");
    expect(fieldLabel(field({ key: "k9", label: { ja: "", en: "" } }))).toBe(
      "k9",
    );
  });
});

describe("answerToCellText", () => {
  it("文字列と数値はそのまま", () => {
    expect(answerToCellText(field({}), "あ")).toBe("あ");
    expect(answerToCellText(field({ type: "number" }), 12.5 as never)).toBe(
      "12.5",
    );
  });

  it("未回答は空文字", () => {
    expect(answerToCellText(field({}), null)).toBe("");
    expect(answerToCellText(field({}), undefined as never)).toBe("");
  });

  it("select は保存値ではなくラベルを出す", () => {
    const f = field({
      type: "select",
      options: [
        { value: "a", label: { ja: "製造部", en: "Mfg" } },
        { value: "b", label: { ja: "営業部", en: "Sales" } },
      ],
    });
    expect(answerToCellText(f, "a")).toBe("製造部");
    // 定義から消えた選択肢は、保存値をそのまま出す（欠測にしない）
    expect(answerToCellText(f, "z")).toBe("z");
  });

  it("multiselect はラベルをカンマで繋ぐ", () => {
    const f = field({
      type: "multiselect",
      options: [
        { value: "a", label: { ja: "赤", en: "Red" } },
        { value: "b", label: { ja: "青", en: "Blue" } },
      ],
    });
    expect(answerToCellText(f, ["a", "b"])).toBe("赤, 青");
    expect(answerToCellText(f, [])).toBe("");
  });

  it("lookup は id ではなくラベル（v_form_answers と同じ）", () => {
    const f = field({ type: "lookup" });
    expect(answerToCellText(f, { id: "u1", label: "山田 太郎" })).toBe(
      "山田 太郎",
    );
    // ラベルが無ければ id へ落ちる
    expect(answerToCellText(f, { id: "u1" } as never)).toBe("u1");
  });

  it("attachment はファイル名を並べる", () => {
    const f = field({ type: "attachment" });
    expect(
      answerToCellText(f, [
        { id: "1", filename: "a.pdf" },
        { id: "2", filename: "b.png" },
      ] as never),
    ).toBe("a.pdf, b.png");
  });

  it("サブテーブルは 1 セルに畳む（列を増やすと回答ごとに形が変わるため）", () => {
    const f = field({
      type: "table",
      columns: [
        field({ key: "c1", label: { ja: "品名", en: "" } }),
        field({ key: "c2", label: { ja: "数量", en: "" }, type: "number" }),
      ],
    });
    expect(
      answerToCellText(f, [
        { c1: "ボルト", c2: 3 },
        { c1: "ナット", c2: 5 },
      ] as never),
    ).toBe("品名=ボルト / 数量=3\n品名=ナット / 数量=5");
    expect(answerToCellText(f, [] as never)).toBe("");
  });

  it("richtext は平文にする", () => {
    const doc = {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "一行目" }] },
        { type: "paragraph", content: [{ type: "text", text: "二行目" }] },
      ],
    };
    expect(answerToCellText(field({ type: "richtext" }), doc as never)).toBe(
      "一行目\n二行目",
    );
  });

  it("related は値を持たないので常に空", () => {
    expect(answerToCellText(field({ type: "related" }), "なにか")).toBe("");
  });
});

describe("numericAnswer", () => {
  it("数値項目だけを数値として返す", () => {
    expect(numericAnswer(field({ type: "number" }), 42 as never)).toBe(42);
    expect(numericAnswer(field({ type: "number" }), "42.5")).toBe(42.5);
    expect(numericAnswer(field({ type: "number" }), "")).toBeNull();
    expect(numericAnswer(field({ type: "number" }), null)).toBeNull();
    expect(numericAnswer(field({ type: "number" }), "abc")).toBeNull();
    // 数値項目でなければ、数字に見えても文字列のまま扱う
    expect(numericAnswer(field({ type: "text" }), "42")).toBeNull();
  });
});

describe("exportFields", () => {
  const fields = [
    field({ key: "a", order: 0 }),
    field({ key: "b", order: 1, type: "related" }),
    field({ key: "c", order: 2 }),
  ];

  it("related は常に外す", () => {
    expect(exportFields(fields, []).map((f) => f.key)).toEqual(["a", "c"]);
  });

  it("選んだ項目だけを、選んだ順ではなく定義順で並べる", () => {
    expect(exportFields(fields, ["c", "a"]).map((f) => f.key)).toEqual([
      "a",
      "c",
    ]);
  });
});

describe("URL パラメータ", () => {
  it("往復しても同じ絞り込みになる", () => {
    const filter = {
      statuses: ["SUBMITTED", "APPROVED"],
      from: new Date(2026, 2, 1),
      to: new Date(2026, 2, 31),
      fieldKeys: ["k1", "k2"],
    };
    const params = exportFilterToParams(filter);
    expect(params.toString()).toBe(
      "status=SUBMITTED%2CAPPROVED&from=2026-03-01&to=2026-03-31&fields=k1%2Ck2",
    );
    const back = parseExportFilter(params);
    expect(back.statuses).toEqual(filter.statuses);
    expect(back.fieldKeys).toEqual(filter.fieldKeys);
    expect(back.from?.getDate()).toBe(1);
    // to は「その日の終わり」まで伸ばされる
    expect(back.to?.getDate()).toBe(31);
    expect(back.to?.getHours()).toBe(23);
  });

  it("既定の絞り込みはパラメータを 1 つも吐かない（URL を短く保つ）", () => {
    expect(exportFilterToParams(EMPTY_EXPORT_FILTER).toString()).toBe("");
  });

  it("知らない状態名は落とす（URL を書き換えて下書きを引けないように）", () => {
    const parsed = parseExportFilter(
      new URLSearchParams("status=DRAFT,APPROVED,NOPE"),
    );
    expect(parsed.statuses).toEqual(["APPROVED"]);
  });

  it("壊れた日付は「指定なし」として読む", () => {
    const parsed = parseExportFilter(
      new URLSearchParams("from=2026-3-1&to=yesterday"),
    );
    expect(parsed.from).toBeNull();
    expect(parsed.to).toBeNull();
  });
});
