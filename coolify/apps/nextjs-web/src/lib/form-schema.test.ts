import { describe, expect, it } from "vitest";
import {
  canEditResponse,
  type FormFieldDef,
  formAvailability,
  isSafePattern,
  lookupHref,
  nextFieldKey,
  normalizeOrder,
  parseFormFields,
  toPlainAnswers,
  validateAnswers,
  validateFieldValue,
} from "./form-schema";

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

describe("validateFieldValue", () => {
  it("必須の空値だけを弾く", () => {
    expect(validateFieldValue(field({ required: true }), "")).toMatch("必須");
    expect(validateFieldValue(field({ required: true }), "  ")).toMatch("必須");
    expect(validateFieldValue(field({ required: false }), "")).toBeNull();
    expect(validateFieldValue(field({ required: true }), "x")).toBeNull();
  });

  it("数値は範囲を見る", () => {
    const f = field({ type: "number", min: 1, max: 10 });
    expect(validateFieldValue(f, "5")).toBeNull();
    expect(validateFieldValue(f, "0")).toMatch("1 以上");
    expect(validateFieldValue(f, "11")).toMatch("10 以下");
    expect(validateFieldValue(f, "abc")).toMatch("数値");
  });

  it("日付・時刻は形式を見る", () => {
    expect(
      validateFieldValue(field({ type: "date" }), "2026-08-26"),
    ).toBeNull();
    expect(validateFieldValue(field({ type: "date" }), "2026/08/26")).toMatch(
      "日付",
    );
    expect(validateFieldValue(field({ type: "time" }), "09:30")).toBeNull();
    expect(validateFieldValue(field({ type: "time" }), "25:00")).toMatch(
      "時刻",
    );
  });

  it("選択肢は候補内だけ通す", () => {
    const opts = [
      { value: "a", label: { ja: "あ", en: "a" } },
      { value: "b", label: { ja: "い", en: "b" } },
    ];
    expect(
      validateFieldValue(field({ type: "select", options: opts }), "a"),
    ).toBeNull();
    expect(
      validateFieldValue(field({ type: "select", options: opts }), "z"),
    ).toMatch("選択肢");
    expect(
      validateFieldValue(field({ type: "multiselect", options: opts }), [
        "a",
        "b",
      ]),
    ).toBeNull();
    expect(
      validateFieldValue(field({ type: "multiselect", options: opts }), [
        "a",
        "z",
      ]),
    ).toMatch("選択肢");
  });

  it("lookup は id を持つオブジェクトを要求する", () => {
    const f = field({ type: "lookup", lookup: { source: "customer" } });
    expect(validateFieldValue(f, { id: "bp1", label: "取引先A" })).toBeNull();
    expect(validateFieldValue(f, "bp1")).toMatch("選択");
  });

  it("正規表現は形式チェックに使い、メッセージを差し替えられる", () => {
    const f = field({
      pattern: "^[0-9]{3}-[0-9]{4}$",
      patternMessage: "郵便番号の形式で入力してください",
    });
    expect(validateFieldValue(f, "123-4567")).toBeNull();
    expect(validateFieldValue(f, "1234567")).toBe(
      "郵便番号の形式で入力してください",
    );
  });

  it("サブテーブルは行ごとに列を検証し、何行目かを言う", () => {
    const f = field({
      type: "table",
      label: { ja: "担当者", en: "Contacts" },
      columns: [
        field({
          key: "name",
          label: { ja: "氏名", en: "Name" },
          required: true,
        }),
      ],
    });
    expect(validateFieldValue(f, [{ name: "山崎" }])).toBeNull();
    expect(validateFieldValue(f, [{ name: "山崎" }, { name: "" }])).toMatch(
      "2 行目",
    );
  });

  it("関連レコード一覧は表示専用なので必須にしても通す", () => {
    const f = field({ type: "related", required: true });
    expect(validateFieldValue(f, null)).toBeNull();
  });
});

describe("validateAnswers / toPlainAnswers", () => {
  const fields = [
    field({
      key: "title",
      label: { ja: "案件名", en: "Title" },
      required: true,
    }),
    field({
      key: "company",
      label: { ja: "会社名", en: "Company" },
      type: "lookup",
      lookup: { source: "customer" },
      order: 1,
    }),
  ];

  it("項目キーごとにエラーを返す", () => {
    expect(validateAnswers(fields, { title: "", company: null })).toEqual({
      title: "案件名 は必須です",
    });
    expect(validateAnswers(fields, { title: "リーマ" })).toEqual({});
  });

  it("平文射影は lookup のラベルを使う", () => {
    const text = toPlainAnswers(fields, {
      title: "リーマ LD 品納品",
      company: { id: "bp1", label: "豊生ブレーキ工業株式会社" },
    });
    expect(text).toContain("案件名: リーマ LD 品納品");
    expect(text).toContain("会社名: 豊生ブレーキ工業株式会社");
  });
});

describe("isSafePattern", () => {
  it("構文エラーを弾く", () => {
    expect(isSafePattern("[")).toBe(false);
  });
  it("量指定の入れ子を弾く", () => {
    expect(isSafePattern("(a+)+")).toBe(false);
    expect(isSafePattern("(a*)*")).toBe(false);
    expect(isSafePattern("(a+){2,}")).toBe(false);
  });
  it("普通のパターンは通す", () => {
    expect(isSafePattern("^[0-9]{3}-[0-9]{4}$")).toBe(true);
    expect(isSafePattern("^\\d+$")).toBe(true);
  });
  it("長すぎるものを弾く", () => {
    expect(isSafePattern("a".repeat(201))).toBe(false);
  });
});

describe("parseFormFields", () => {
  const ok = [
    {
      key: "title",
      label: { ja: "案件名", en: "" },
      type: "text",
      required: true,
      order: 0,
    },
  ];

  it("妥当な定義を通す", () => {
    const r = parseFormFields(ok);
    expect(r.ok).toBe(true);
  });

  it("キー重複を弾く", () => {
    const r = parseFormFields([ok[0], { ...ok[0], order: 1 }]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("重複");
  });

  it("識別子でないキーを弾く", () => {
    const r = parseFormFields([{ ...ok[0], key: "1bad" }]);
    expect(r.ok).toBe(false);
  });

  it("危険な正規表現を保存時に弾く", () => {
    const r = parseFormFields([{ ...ok[0], pattern: "(a+)+" }]);
    expect(r.ok).toBe(false);
  });

  it("サブテーブルの列にサブテーブルは置けない", () => {
    const r = parseFormFields([
      {
        ...ok[0],
        type: "table",
        columns: [{ ...ok[0], key: "inner", type: "table" }],
      },
    ]);
    expect(r.ok).toBe(false);
  });
});

describe("normalizeOrder", () => {
  it("並びを 0..n-1 に振り直す", () => {
    const out = normalizeOrder([
      field({ key: "b", order: 7 }),
      field({ key: "a", order: 2 }),
    ]);
    expect(out.map((f) => [f.key, f.order])).toEqual([
      ["a", 0],
      ["b", 1],
    ]);
  });
});

describe("formAvailability", () => {
  const now = new Date("2026-08-26T10:00:00Z");
  const base = { status: "PUBLISHED" as const, opensAt: null, closesAt: null };

  it("下書き・アーカイブはそのまま", () => {
    expect(formAvailability({ ...base, status: "DRAFT" }, now)).toBe("DRAFT");
    expect(formAvailability({ ...base, status: "ARCHIVED" }, now)).toBe(
      "ARCHIVED",
    );
  });

  it("期間なしは受付中", () => {
    expect(formAvailability(base, now)).toBe("OPEN");
  });

  it("開始前は受付前、開始時刻ちょうどは受付中", () => {
    expect(
      formAvailability(
        { ...base, opensAt: new Date("2026-08-26T10:00:01Z") },
        now,
      ),
    ).toBe("SCHEDULED");
    expect(
      formAvailability(
        { ...base, opensAt: new Date("2026-08-26T10:00:00Z") },
        now,
      ),
    ).toBe("OPEN");
  });

  it("終了時刻ちょうどは受付終了", () => {
    expect(
      formAvailability(
        { ...base, closesAt: new Date("2026-08-26T10:00:00Z") },
        now,
      ),
    ).toBe("CLOSED");
    expect(
      formAvailability(
        { ...base, closesAt: new Date("2026-08-26T10:00:01Z") },
        now,
      ),
    ).toBe("OPEN");
  });
});

describe("canEditResponse", () => {
  const now = new Date("2026-08-26T10:00:00Z");
  const form = {
    status: "PUBLISHED" as const,
    opensAt: null,
    closesAt: new Date("2026-08-27T00:00:00Z"),
    responseEditMode: "UNTIL_CLOSE" as const,
    responseEditableUntil: null,
  };
  const mine = { submittedBy: "u1", status: "SUBMITTED" };

  it("他人の回答は期限内でも編集できない", () => {
    expect(
      canEditResponse(form, { ...mine, submittedBy: "u2" }, "u1", now),
    ).toBe(false);
  });

  it("NONE は提出直後から編集できない", () => {
    expect(
      canEditResponse({ ...form, responseEditMode: "NONE" }, mine, "u1", now),
    ).toBe(false);
  });

  it("UNTIL_CLOSE は受付終了まで", () => {
    expect(canEditResponse(form, mine, "u1", now)).toBe(true);
    expect(
      canEditResponse(form, mine, "u1", new Date("2026-08-27T00:00:00Z")),
    ).toBe(false);
  });

  it("UNTIL_DATE は指定日時まで", () => {
    const f = {
      ...form,
      responseEditMode: "UNTIL_DATE" as const,
      responseEditableUntil: new Date("2026-08-26T12:00:00Z"),
    };
    expect(canEditResponse(f, mine, "u1", now)).toBe(true);
    expect(
      canEditResponse(f, mine, "u1", new Date("2026-08-26T12:00:00Z")),
    ).toBe(false);
  });

  it("下書き・差し戻しは期限に関係なく本人が直せる", () => {
    const closed = { ...form, responseEditMode: "NONE" as const };
    expect(
      canEditResponse(closed, { ...mine, status: "DRAFT" }, "u1", now),
    ).toBe(true);
    expect(
      canEditResponse(closed, { ...mine, status: "REJECTED" }, "u1", now),
    ).toBe(true);
  });

  it("承認フローに乗った回答はこの経路では編集させない", () => {
    expect(
      canEditResponse(form, { ...mine, status: "REQUESTED" }, "u1", now),
    ).toBe(false);
    expect(
      canEditResponse(form, { ...mine, status: "APPROVED" }, "u1", now),
    ).toBe(false);
  });
});

describe("lookupHref", () => {
  it("参照先ごとの詳細 URL を返す", () => {
    expect(lookupHref("customer", "bp1")).toBe("/master/business-partners/bp1");
    expect(lookupHref("user", "u1")).toBe("/settings/users/u1");
  });
  it("空 id はリンクにしない", () => {
    expect(lookupHref("customer", "")).toBeNull();
  });
});

describe("nextFieldKey", () => {
  it("既存と衝突しないキーを返す", () => {
    expect(nextFieldKey([])).toBe("field1");
    expect(nextFieldKey(["field1"])).toBe("field2");
  });

  it("歯抜けでも衝突しない", () => {
    // 途中を消した後でも、既にあるキーは避ける
    expect(nextFieldKey(["field1", "field3"])).toBe("field4");
  });

  it("手で付けたキーとも衝突しない", () => {
    expect(nextFieldKey(["companyName"])).toBe("field2");
  });
});

describe("追加した直後の項目がそのまま保存できること（回帰）", () => {
  // 以前は key/label を空で作っていたため、項目を足した直後に必ず検証エラーに
  // なっていた（「追加したのに保存できない」）。ビルダーが使う既定値で
  // parseFormFields が通ることを固定する。
  it("既定のキーとラベルで作った項目は妥当", () => {
    const fresh: FormFieldDef[] = [0, 1, 2].map((i) => ({
      key: nextFieldKey([0, 1, 2].slice(0, i).map((n) => `field${n + 1}`)),
      label: { ja: `項目 ${i + 1}`, en: "" },
      type: "text",
      required: false,
      order: i,
    }));
    const parsed = parseFormFields(fresh);
    expect(parsed.ok).toBe(true);
  });
});

describe("parseFormFields のエラーは何番目かを言う", () => {
  it("2 番目の項目のラベルが空なら位置を示す", () => {
    const r = parseFormFields([
      {
        key: "a",
        label: { ja: "あ", en: "" },
        type: "text",
        required: false,
        order: 0,
      },
      {
        key: "b",
        label: { ja: "", en: "" },
        type: "text",
        required: false,
        order: 1,
      },
    ]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("2 番目の項目");
  });
});
