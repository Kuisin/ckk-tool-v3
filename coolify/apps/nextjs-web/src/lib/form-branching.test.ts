/**
 * form-branching.test.ts — フォームのセクション分岐（スキップ）評価。
 *
 * computeVisitedPath は回答画面（クライアント）と提出時のサーバー検証が
 * 両方呼ぶ唯一の判定元 — ここがずれると「スキップしたのに提出時だけ必須
 * 項目扱いされる」事故になる。
 */

import { describe, expect, it } from "vitest";
import {
  computeVisitedPath,
  type FormSectionDef,
  fieldsOnPath,
  formConditionFieldOptions,
  parseFormSections,
  resolveNextSection,
  SECTION_SUBMIT,
} from "./form-branching";
import type { FormFieldDef } from "./form-schema";

const LABELS: Record<string, string> = {
  "general.formBranching.invalidSections": "セクション定義が不正です",
  "general.formBranching.tooManySections": "セクションは {n} 個までです",
  "general.formBranching.sectionIndexInvalid":
    "{no} 番目のセクションが不正です",
  "general.formBranching.sectionKeyRequired":
    "{no} 番目のセクション: key がありません",
  "general.formBranching.duplicateSectionKey":
    "{no} 番目のセクション: key が重複しています",
  "general.formBranching.sectionTitleRequired":
    "{no} 番目のセクション: タイトルを入力してください",
  "general.formBranching.tooManyRules":
    "{no} 番目のセクション: ルールが多すぎます",
  "general.formBranching.ruleInvalid":
    "{no} 番目のセクションの {ruleNo} 本目のルールが不正です",
  "general.formBranching.ruleTargetRequired":
    "{no} 番目のセクションの {ruleNo} 本目: 遷移先を選んでください",
  "general.formBranching.conditionInvalid":
    "{no} 番目のセクションの {ruleNo} 本目: 条件が不正です",
  "general.formBranching.conditionFieldInvalid":
    "{no} 番目のセクションの {ruleNo} 本目: 条件の項目が選べません",
  "general.formBranching.conditionOpInvalid":
    "{no} 番目のセクションの {ruleNo} 本目: 比較が不正です",
  "general.formBranching.conditionValueInvalid":
    "{no} 番目のセクションの {ruleNo} 本目: 値を入力してください",
  "general.formBranching.ruleTargetIsSelf":
    "{no} 番目のセクション: 自分自身は選べません",
  "general.formBranching.ruleTargetNotFound":
    "{no} 番目のセクション: 遷移先が見つかりません",
};

function tr(key: string, vars?: Record<string, unknown>): string {
  let msg = LABELS[key] ?? key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      msg = msg.replaceAll(`{${k}}`, String(v));
    }
  }
  return msg;
}

const trFn = tr as unknown as import("./i18n").Tr;

function field(
  key: string,
  type: FormFieldDef["type"],
  sectionKey: string,
  extra: Partial<FormFieldDef> = {},
): FormFieldDef {
  return {
    key,
    label: { ja: key, en: key },
    type,
    required: false,
    order: 0,
    sectionKey,
    ...extra,
  };
}

const fields: FormFieldDef[] = [
  field("kind", "select", "s1", {
    options: [
      { value: "A", label: { ja: "A", en: "A" } },
      { value: "B", label: { ja: "B", en: "B" } },
    ],
  }),
  field("note1", "text", "s1", { required: true }),
  field("note2", "text", "s2", { required: true }),
  field("note3", "text", "s3", { required: true }),
];

const section1: FormSectionDef = {
  key: "s1",
  title: { ja: "セクション1", en: "" },
  order: 0,
  rules: [
    {
      isActive: true,
      conditions: [{ field: "kind", op: "eq", value: "A" }],
      target: "s3",
    },
  ],
};
const section2: FormSectionDef = {
  key: "s2",
  title: { ja: "セクション2", en: "" },
  order: 1,
  rules: [],
};
const section3: FormSectionDef = {
  key: "s3",
  title: { ja: "セクション3", en: "" },
  order: 2,
  rules: [],
};
const sections: FormSectionDef[] = [section1, section2, section3];

describe("resolveNextSection", () => {
  it("falls back to the next section by order when no rule matches", () => {
    const next = resolveNextSection(section1, sections, fields, {
      kind: "B",
    });
    expect(next).toBe("s2");
  });

  it("uses the matched rule's target", () => {
    const next = resolveNextSection(section1, sections, fields, {
      kind: "A",
    });
    expect(next).toBe("s3");
  });

  it("returns SECTION_SUBMIT after the last section", () => {
    const next = resolveNextSection(section3, sections, fields, {});
    expect(next).toBe(SECTION_SUBMIT);
  });
});

describe("computeVisitedPath", () => {
  it("is empty for a legacy flat form (no sections)", () => {
    expect(computeVisitedPath([], fields, {})).toEqual([]);
  });

  it("walks the natural order with no matching rules", () => {
    expect(computeVisitedPath(sections, fields, { kind: "B" })).toEqual([
      "s1",
      "s2",
      "s3",
    ]);
  });

  it("skips s2 when the rule matches", () => {
    expect(computeVisitedPath(sections, fields, { kind: "A" })).toEqual([
      "s1",
      "s3",
    ]);
  });

  it("stops instead of looping on a self-referencing cycle", () => {
    const cyclic: FormSectionDef[] = [
      {
        key: "s1",
        title: { ja: "s1", en: "" },
        order: 0,
        rules: [{ isActive: true, conditions: [], target: "s2" }],
      },
      {
        key: "s2",
        title: { ja: "s2", en: "" },
        order: 1,
        rules: [{ isActive: true, conditions: [], target: "s1" }],
      },
    ];
    expect(computeVisitedPath(cyclic, [], {})).toEqual(["s1", "s2"]);
  });

  it("stops at a dangling target instead of throwing", () => {
    const dangling: FormSectionDef[] = [
      {
        key: "s1",
        title: { ja: "s1", en: "" },
        order: 0,
        rules: [{ isActive: true, conditions: [], target: "ghost" }],
      },
    ];
    expect(computeVisitedPath(dangling, [], {})).toEqual(["s1"]);
  });

  it("a catch-all rule (empty conditions) overrides the default fallback", () => {
    const overridden: FormSectionDef[] = [
      {
        key: "s1",
        title: { ja: "s1", en: "" },
        order: 0,
        rules: [{ isActive: true, conditions: [], target: "s3" }],
      },
      { key: "s2", title: { ja: "s2", en: "" }, order: 1, rules: [] },
      { key: "s3", title: { ja: "s3", en: "" }, order: 2, rules: [] },
    ];
    expect(computeVisitedPath(overridden, [], {})).toEqual(["s1", "s3"]);
  });
});

describe("fieldsOnPath", () => {
  it("returns everything for a legacy flat form", () => {
    expect(fieldsOnPath(fields, [], [])).toHaveLength(fields.length);
  });

  it("excludes fields belonging to an unvisited section", () => {
    const relevant = fieldsOnPath(fields, sections, ["s1", "s3"]);
    expect(relevant.map((f) => f.key)).toEqual(["kind", "note1", "note3"]);
  });
});

describe("formConditionFieldOptions", () => {
  it("only offers select/number fields from sections up to and including the current one", () => {
    const options = formConditionFieldOptions(sections, "s2", fields);
    expect(options.map((f) => f.key)).toEqual(["kind"]);
  });

  it("excludes fields from a later section", () => {
    const options = formConditionFieldOptions(sections, "s1", fields);
    expect(options.map((f) => f.key)).toEqual(["kind"]);
  });
});

describe("parseFormSections", () => {
  const validJson = [
    {
      key: "s1",
      title: { ja: "セクション1", en: "" },
      order: 0,
      rules: [
        {
          isActive: true,
          conditions: [{ field: "kind", op: "eq", value: "A" }],
          target: "s2",
        },
      ],
    },
    { key: "s2", title: { ja: "セクション2", en: "" }, order: 1, rules: [] },
  ];

  it("accepts a valid definition", () => {
    const result = parseFormSections(validJson, fields, trFn);
    expect(result.ok).toBe(true);
  });

  it("rejects a non-array value", () => {
    const result = parseFormSections({}, fields, trFn);
    expect(result.ok).toBe(false);
  });

  it("rejects duplicate section keys", () => {
    const dup = [
      { key: "s1", title: { ja: "a", en: "" }, order: 0, rules: [] },
      { key: "s1", title: { ja: "b", en: "" }, order: 1, rules: [] },
    ];
    const result = parseFormSections(dup, fields, trFn);
    expect(result.ok).toBe(false);
  });

  it("rejects a rule targeting an unknown section", () => {
    const bad = [
      {
        key: "s1",
        title: { ja: "a", en: "" },
        order: 0,
        rules: [{ isActive: true, conditions: [], target: "ghost" }],
      },
    ];
    const result = parseFormSections(bad, fields, trFn);
    expect(result.ok).toBe(false);
  });

  it("rejects a rule targeting itself", () => {
    const bad = [
      {
        key: "s1",
        title: { ja: "a", en: "" },
        order: 0,
        rules: [{ isActive: true, conditions: [], target: "s1" }],
      },
    ];
    const result = parseFormSections(bad, fields, trFn);
    expect(result.ok).toBe(false);
  });

  it("rejects a condition on a field that is not select/number", () => {
    const bad = [
      {
        key: "s1",
        title: { ja: "a", en: "" },
        order: 0,
        rules: [
          {
            isActive: true,
            conditions: [{ field: "note1", op: "eq", value: "x" }],
            target: SECTION_SUBMIT,
          },
        ],
      },
    ];
    const result = parseFormSections(bad, fields, trFn);
    expect(result.ok).toBe(false);
  });

  it("rejects an invalid op for the field's type", () => {
    const bad = [
      {
        key: "s1",
        title: { ja: "a", en: "" },
        order: 0,
        rules: [
          {
            isActive: true,
            conditions: [{ field: "kind", op: "gte", value: "A" }],
            target: SECTION_SUBMIT,
          },
        ],
      },
    ];
    const result = parseFormSections(bad, fields, trFn);
    expect(result.ok).toBe(false);
  });
});
