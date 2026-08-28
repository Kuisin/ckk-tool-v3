import { describe, expect, it } from "vitest";
import type { FormFieldDef } from "./form-schema";
import {
  donutArcs,
  MAX_CATEGORY_BARS,
  submissionTrend,
  summarizeResponses,
} from "./form-summary";

function field(over: Partial<FormFieldDef>): FormFieldDef {
  return {
    key: "f",
    label: { ja: "項目", en: "" },
    type: "text",
    required: false,
    order: 0,
    ...over,
  };
}

const options = [
  { value: "a", label: { ja: "そう思う", en: "" } },
  { value: "b", label: { ja: "思わない", en: "" } },
];

describe("select", () => {
  const f = field({ key: "q", type: "select", options });

  it("選択肢のラベルで数え、多い順に並べる", () => {
    const s = summarizeResponses([f], [{ q: "a" }, { q: "b" }, { q: "a" }])[0];
    expect(s.body).toMatchObject({
      kind: "categories",
      answered: 3,
      items: [
        { label: "そう思う", count: 2 },
        { label: "思わない", count: 1 },
      ],
    });
  });

  it("未回答は数に入れない", () => {
    const s = summarizeResponses([f], [{ q: "a" }, {}, { q: "" }])[0];
    expect(s.body).toMatchObject({ answered: 1 });
  });

  it("選択肢に無い値はそのまま出す（過去の版の値など）", () => {
    const s = summarizeResponses([f], [{ q: "z" }])[0];
    expect(s.body).toMatchObject({ items: [{ label: "z", count: 1 }] });
  });
});

describe("multiselect", () => {
  it("1 回答が複数選ぶので合計は回答数を超える", () => {
    const f = field({ key: "q", type: "multiselect", options });
    const s = summarizeResponses([f], [{ q: ["a", "b"] }, { q: ["a"] }])[0];
    expect(s.body).toMatchObject({
      answered: 2,
      items: [
        { label: "そう思う", count: 2 },
        { label: "思わない", count: 1 },
      ],
    });
  });
});

describe("lookup", () => {
  it("保存されたラベルで数える", () => {
    const f = field({
      key: "c",
      type: "lookup",
      lookup: { source: "customer" },
    });
    const s = summarizeResponses(
      [f],
      [
        { c: { id: "1", label: "豊生ブレーキ" } },
        { c: { id: "1", label: "豊生ブレーキ" } },
        { c: { id: "2", label: "羽根田商会" } },
      ],
    )[0];
    expect(s.body).toMatchObject({
      items: [
        { label: "豊生ブレーキ", count: 2 },
        { label: "羽根田商会", count: 1 },
      ],
    });
  });
});

describe("棒の本数を抑える", () => {
  it("上位を超えた分は「その他」に畳む（色も棒も増やさない）", () => {
    const f = field({ key: "q", type: "select" });
    const answers = Array.from({ length: MAX_CATEGORY_BARS + 5 }, (_, i) => ({
      q: `v${i}`,
    }));
    const body = summarizeResponses([f], answers)[0].body;
    expect(body).toMatchObject({ kind: "categories", otherCount: 5 });
    if (body.kind === "categories") {
      expect(body.items).toHaveLength(MAX_CATEGORY_BARS);
    }
  });
});

describe("number", () => {
  const f = field({ key: "n", type: "number" });

  it("代表値を出す", () => {
    const s = summarizeResponses(
      [f],
      [{ n: "1" }, { n: "2" }, { n: "3" }, { n: "10" }],
    )[0];
    expect(s.body).toMatchObject({
      kind: "numbers",
      answered: 4,
      min: 1,
      max: 10,
      mean: 4,
      median: 2.5,
    });
  });

  it("値の種類が少ないときは区間に切らず、そのまま数える", () => {
    // 5 段階評価を「1〜2.33」のように刻んでも読めない。
    const body = summarizeResponses(
      [f],
      [{ n: "1" }, { n: "4" }, { n: "5" }, { n: "5" }],
    )[0].body;
    if (body.kind !== "numbers") throw new Error("numbers を期待");
    expect(body.buckets).toEqual([
      { label: "1", count: 1 },
      { label: "4", count: 1 },
      { label: "5", count: 2 },
    ]);
  });

  it("値の種類が多いときは区間にまとめる", () => {
    const answers = Array.from({ length: 40 }, (_, i) => ({ n: String(i) }));
    const body = summarizeResponses([f], answers)[0].body;
    if (body.kind !== "numbers") throw new Error("numbers を期待");
    expect(body.buckets.length).toBeLessThanOrEqual(8);
    expect(body.buckets.reduce((a, b) => a + b.count, 0)).toBe(40);
  });

  it("最大値が最後の区間に入る（範囲外に落ちない）", () => {
    const body = summarizeResponses([f], [{ n: "0" }, { n: "10" }])[0].body;
    if (body.kind !== "numbers") throw new Error("numbers を期待");
    const total = body.buckets.reduce((a, b) => a + b.count, 0);
    expect(total).toBe(2);
  });

  it("全部同じ値なら区間は 1 つ", () => {
    const body = summarizeResponses([f], [{ n: "5" }, { n: "5" }])[0].body;
    if (body.kind !== "numbers") throw new Error("numbers を期待");
    expect(body.buckets).toEqual([{ label: "5", count: 2 }]);
  });

  it("数値でない回答は数えない", () => {
    const body = summarizeResponses([f], [{ n: "abc" }])[0].body;
    expect(body.kind).toBe("text");
  });
});

describe("date / time", () => {
  it("日付は月でまとめ、古い順に並べる", () => {
    const f = field({ key: "d", type: "date" });
    const body = summarizeResponses(
      [f],
      [{ d: "2026-08-26" }, { d: "2026-07-01" }, { d: "2026-08-02" }],
    )[0].body;
    expect(body).toMatchObject({
      kind: "periods",
      buckets: [
        { label: "2026-07", count: 1 },
        { label: "2026-08", count: 2 },
      ],
    });
  });

  it("時刻は時間帯でまとめる", () => {
    const f = field({ key: "t", type: "time" });
    const body = summarizeResponses([f], [{ t: "09:30" }, { t: "09:05" }])[0]
      .body;
    expect(body).toMatchObject({ buckets: [{ label: "09時台", count: 2 }] });
  });
});

describe("グラフにしないもの", () => {
  it("テキストは件数と抜粋だけ", () => {
    const f = field({ key: "t", type: "textarea" });
    const body = summarizeResponses(
      [f],
      [{ t: "よかった" }, { t: "ふつう" }],
    )[0].body;
    expect(body).toMatchObject({ kind: "text", answered: 2 });
    if (body.kind === "text") expect(body.samples).toHaveLength(2);
  });

  it("添付は件数とファイル数", () => {
    const f = field({ key: "a", type: "attachment" });
    const body = summarizeResponses([f], [{ a: ["1", "2"] }, { a: ["3"] }])[0]
      .body;
    expect(body).toMatchObject({ kind: "amount", answered: 2 });
    if (body.kind === "amount") expect(body.note).toContain("3 個");
  });

  it("サブテーブルは行数の合計と平均", () => {
    const f = field({ key: "tb", type: "table" });
    const body = summarizeResponses([f], [{ tb: [{}, {}] }, { tb: [{}] }])[0]
      .body;
    if (body.kind !== "amount") throw new Error("amount を期待");
    expect(body.note).toContain("合計 3 行");
    expect(body.note).toContain("平均 1.5 行");
  });

  it("関連レコード一覧は集計しない", () => {
    const f = field({ key: "r", type: "related" });
    expect(summarizeResponses([f], [{}])[0].body).toEqual({ kind: "none" });
  });
});

describe("回答が 1 件も無いとき", () => {
  it("壊れずに 0 件として返す", () => {
    const fields = [
      field({ key: "q", type: "select", options }),
      field({ key: "n", type: "number" }),
      field({ key: "d", type: "date" }),
    ];
    const out = summarizeResponses(fields, []);
    expect(out).toHaveLength(3);
    expect(out[0].body).toMatchObject({ answered: 0, items: [] });
  });
});

describe("並び順の切り替え", () => {
  const f = field({ key: "q", type: "select", options });

  it("既定は多い順", () => {
    const body = summarizeResponses(
      [f],
      [{ q: "b" }, { q: "b" }, { q: "a" }],
    )[0].body;
    if (body.kind !== "categories") throw new Error("categories を期待");
    expect(body.items.map((i) => i.label)).toEqual(["思わない", "そう思う"]);
  });

  it("定義順にすると選択肢の順序を保つ（票数で入れ替わらない）", () => {
    const body = summarizeResponses([f], [{ q: "b" }, { q: "b" }, { q: "a" }], {
      order: "definition",
      dateGrain: "month",
    })[0].body;
    if (body.kind !== "categories") throw new Error("categories を期待");
    expect(body.items.map((i) => i.label)).toEqual(["そう思う", "思わない"]);
  });

  it("定義順では 0 件の選択肢も残す（誰も選ばなかったことが結果）", () => {
    const body = summarizeResponses([f], [{ q: "a" }], {
      order: "definition",
      dateGrain: "month",
    })[0].body;
    if (body.kind !== "categories") throw new Error("categories を期待");
    expect(body.items).toEqual([
      { label: "そう思う", count: 1 },
      { label: "思わない", count: 0 },
    ]);
  });
});

describe("日付の粒度", () => {
  const f = field({ key: "d", type: "date" });
  const answers = [{ d: "2026-08-01" }, { d: "2026-08-26" }];

  it("既定は月別", () => {
    const body = summarizeResponses([f], answers)[0].body;
    expect(body).toMatchObject({ buckets: [{ label: "2026-08", count: 2 }] });
  });

  it("日別に切り替えられる", () => {
    const body = summarizeResponses([f], answers, {
      order: "count",
      dateGrain: "day",
    })[0].body;
    if (body.kind !== "periods") throw new Error("periods を期待");
    expect(body.buckets.map((b) => b.label)).toEqual([
      "2026-08-01",
      "2026-08-26",
    ]);
  });
});

describe("submissionTrend", () => {
  it("提出日時を月でまとめ、古い順に返す", () => {
    expect(
      submissionTrend(
        [
          "2026-08-26T01:00:00Z",
          "2026-07-02T01:00:00Z",
          "2026-08-02T01:00:00Z",
        ],
        "month",
      ),
    ).toEqual([
      { label: "2026-07", count: 1 },
      { label: "2026-08", count: 2 },
    ]);
  });

  it("null は数えない", () => {
    expect(submissionTrend([null, "2026-08-26T01:00:00Z"], "day")).toEqual([
      { label: "2026-08-26", count: 1 },
    ]);
  });
});

describe("母数（total）", () => {
  it("項目に答えたかに依らず、集計に入れた回答の総数を持つ", () => {
    const f = field({ key: "q", type: "select", options });
    const [s] = summarizeResponses([f], [{ q: "a" }, {}, { q: "" }]);
    expect(s.total).toBe(3);
    // 答えたのは 1 件だけ = 未回答 2 件。必須でない質問ではこれ自体が結果。
    expect(s.body).toMatchObject({ answered: 1 });
  });
});

describe("リッチテキスト", () => {
  const f = field({ key: "q", type: "richtext" });
  const doc = {
    type: "doc",
    content: [
      { type: "paragraph", content: [{ type: "text", text: "現場の所感" }] },
    ],
  };

  it("抜粋は平文に落としてから拾う（JSON のままでは何も出せない）", () => {
    const [s] = summarizeResponses([f], [{ q: doc as never }]);
    expect(s.body).toMatchObject({
      kind: "text",
      answered: 1,
      samples: ["現場の所感"],
    });
  });
});

describe("数値", () => {
  const f = field({ key: "q", type: "number" });

  it("文字列でも JSON の数値でも数える", () => {
    const [s] = summarizeResponses([f], [{ q: "10" }, { q: 20 as never }]);
    expect(s.body).toMatchObject({
      kind: "numbers",
      answered: 2,
      min: 10,
      max: 20,
      mean: 15,
    });
  });
});

describe("donutArcs", () => {
  const C = 100;

  it("区分を順に切り、総和が円周ちょうどになる", () => {
    const arcs = donutArcs(
      [
        { label: "a", count: 1 },
        { label: "b", count: 3 },
      ],
      4,
      C,
    );
    expect(arcs).toEqual([
      { label: "a", length: 25, offset: 0 },
      { label: "b", length: 75, offset: 25 },
    ]);
    const last = arcs[arcs.length - 1];
    expect(last.offset + last.length).toBe(C);
  });

  it("0 件の区分は長さを持たない（次の弧の開始位置も動かない）", () => {
    const arcs = donutArcs(
      [
        { label: "a", count: 0 },
        { label: "b", count: 2 },
      ],
      2,
      C,
    );
    expect(arcs[0]).toEqual({ label: "a", length: 0, offset: 0 });
    expect(arcs[1]).toEqual({ label: "b", length: 100, offset: 0 });
  });

  it("回答が 0 件なら弧を描かない（0 割りにしない）", () => {
    expect(donutArcs([{ label: "a", count: 0 }], 0, C)).toEqual([
      { label: "a", length: 0, offset: 0 },
    ]);
  });
});
