/**
 * 帳票（PDF）の HTML を、**項目型ごとに 1 つずつ**確かめる。
 *
 * フォームの項目は利用者が組むので、型を 1 つ足したときに紙だけ空欄になっても
 * 誰も気づかない（画面では出ているため）。ここで全型を並べて、
 *   - 値が刷られること
 *   - 生の HTML が効かないこと（エスケープ）
 *   - 内部 ID（添付・lookup）が紙に出ないこと
 * を型の数だけ押さえる。
 */

import { describe, expect, it } from "vitest";
import type { ExportableResponse } from "./form-export-core";
import { responsePageHtml } from "./form-response-pdf";
import type { FormFieldDef, FormFieldType } from "./form-schema";
import { documentFormatters } from "./format";

let order = 0;
function field(
  key: string,
  type: FormFieldType,
  over: Partial<FormFieldDef> = {},
): FormFieldDef {
  order += 1;
  return {
    key,
    label: { ja: `${key}ラベル`, en: "" },
    type,
    required: false,
    order,
    ...over,
  };
}

const options = [
  { value: "a", label: { ja: "あ、い", en: "" } },
  { value: "b", label: { ja: "うえ", en: "" } },
];

const FIELDS: FormFieldDef[] = [
  field("text", "text"),
  field("textarea", "textarea"),
  field("richtext", "richtext"),
  field("number", "number"),
  field("date", "date"),
  field("time", "time"),
  field("select", "select", { options }),
  field("multiselect", "multiselect", { options }),
  field("lookup", "lookup", { lookup: { source: "product" } }),
  field("attachment", "attachment"),
  field("table", "table", {
    columns: [
      field("col1", "text"),
      field("col2", "number"),
      field("col3", "select", { options }),
    ],
  }),
  field("related", "related"),
  field("blank", "text"),
];

const ANSWERS: Record<string, unknown> = {
  text: '<script>alert("x")</script> & "引用"',
  textarea: "1 行目\n2 行目\n\n4 行目",
  richtext: {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          { type: "text", text: "太字", marks: [{ type: "bold" }] },
          { type: "text", text: " と <危険>" },
        ],
      },
      {
        type: "bulletList",
        content: [
          {
            type: "listItem",
            content: [
              { type: "paragraph", content: [{ type: "text", text: "箇条" }] },
            ],
          },
        ],
      },
    ],
  },
  number: "1234567.50",
  date: "2026-03-01",
  time: "9:05",
  select: "a",
  multiselect: ["b", "a"],
  lookup: { id: "PRD-000123", label: "製品アルファ" },
  attachment: ["file-uuid-1", "file-uuid-2"],
  table: [
    { col1: "行1", col2: "1000", col3: "b" },
    { col1: "行2", col2: "", col3: "a" },
  ],
  blank: "",
};

function render(): string {
  const response: ExportableResponse = {
    responseNumber: "FRM-0001-0007",
    recordNo: 7,
    status: "APPROVED",
    respondent: "山田 太郎",
    submittedAt: new Date("2026-03-01T02:30:00Z"),
    createdAt: new Date("2026-03-01T02:00:00Z"),
    answers: ANSWERS as never,
  };
  return responsePageHtml({
    formTitle: "営業<報告>",
    formCode: "ABCD1234",
    respondent: "山田 太郎",
    response,
    fields: FIELDS,
    trail: [],
    fmt: documentFormatters,
  });
}

describe("responsePageHtml — 型ごとの刷り上がり", () => {
  const html = render();

  it("すべての項目のラベルが出る（related を除く）", () => {
    for (const f of FIELDS) {
      if (f.type === "related") continue;
      expect(html).toContain(`${f.key}ラベル`);
    }
  });

  it("利用者の入力とフォーム名を HTML として実行させない", () => {
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("営業&lt;報告&gt;");
  });

  it("複数行テキストは改行を保つ枠（.pre）に入る", () => {
    expect(html).toContain('<div class="pre">1 行目\n2 行目\n\n4 行目</div>');
  });

  it("リッチテキストは書式のまま出し、本文はエスケープされる", () => {
    expect(html).toContain('<div class="rich">');
    expect(html).toContain("<strong>太字</strong>");
    expect(html).toContain("&lt;危険&gt;");
    expect(html).toContain("<ul><li><p>箇条</p></li></ul>");
  });

  it("複数行・リッチ・サブテーブルは幅いっぱいの塊にする", () => {
    // 3 つ（textarea / richtext / table）が block 行になる。
    expect(html.match(/<tr class="block">/g)).toHaveLength(3);
  });

  it("数値は桁区切り、書かれた表現はそのまま", () => {
    expect(html).toContain('<span class="num">1,234,567.50</span>');
  });

  it("日付・時刻はタイムゾーンで動かさず表示形式に直す", () => {
    expect(html).toContain("2026/03/01");
    expect(html).toContain("09:05");
  });

  it("選択肢は箇条書きで、定義順に並ぶ", () => {
    expect(html).toContain('<ul class="choices"><li>あ、い</li></ul>');
    expect(html).toContain(
      '<ul class="choices"><li>あ、い</li><li>うえ</li></ul>',
    );
  });

  it("業務データ検索はラベルを出し、内部 ID は出さない", () => {
    expect(html).toContain("製品アルファ");
    expect(html).not.toContain("PRD-000123");
  });

  it("添付はファイル ID を刷らず、件数だけを出す", () => {
    expect(html).not.toContain("file-uuid-1");
    expect(html).toContain("2 件のファイル");
  });

  it("サブテーブルは本物の表として組む（1 セルに畳まない）", () => {
    expect(html).toContain('<table class="subtable">');
    expect(html).toContain("<th>col1ラベル</th>");
    // Excel 用の平坦化（「列=値 / 列=値」）が紙に混ざっていないこと。
    expect(html).not.toContain("col1ラベル=行1");
    // 列の中でも型ごとの整形が効く（数値は桁区切り、選択肢はラベル）。
    expect(html).toContain('<span class="num">1,000</span>');
    expect(html).toContain("<li>うえ</li>");
  });

  it("関連レコードは行ごと出さない（回答の値を持たないため）", () => {
    expect(html).not.toContain("relatedラベル");
  });

  it("未回答は空欄ではなく「（未回答）」と書く", () => {
    expect(html).toContain("（未回答）");
  });

  it("回答者名は渡されたときだけ出す", () => {
    expect(html).toContain("山田 太郎");
    const anonymous = responsePageHtml({
      formTitle: "匿名",
      formCode: "ABCD1234",
      respondent: null,
      response: {
        responseNumber: "FRM-0001-0008",
        recordNo: 8,
        status: "SUBMITTED",
        respondent: null,
        submittedAt: null,
        createdAt: new Date("2026-03-01T02:00:00Z"),
        answers: {},
      },
      fields: FIELDS,
      trail: [],
      fmt: documentFormatters,
    });
    expect(anonymous).not.toContain("回答者");
  });
});
