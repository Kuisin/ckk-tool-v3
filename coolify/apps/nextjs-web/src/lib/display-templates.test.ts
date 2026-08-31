import { describe, expect, it } from "vitest";
import {
  DISPLAY_TEMPLATES,
  defaultTemplateOptions,
  findDisplayTemplate,
  optionBoolean,
  optionNumber,
  optionPlantId,
  optionString,
  templateOptionsSchema,
} from "./display-templates";

describe("DISPLAY_TEMPLATES — 登録簿の整合", () => {
  it("キーが重複していない", () => {
    const keys = DISPLAY_TEMPLATES.map((t) => t.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("キーは URL に使える形（ページのパスになる）", () => {
    for (const t of DISPLAY_TEMPLATES) {
      expect(t.key).toMatch(/^[a-z][a-z0-9-]*$/);
    }
  });

  it("設定キーがテンプレート内で重複していない", () => {
    for (const t of DISPLAY_TEMPLATES) {
      const keys = t.options.map((o) => o.key);
      expect(new Set(keys).size, `${t.key} に重複した設定キー`).toBe(
        keys.length,
      );
    }
  });

  it("名前と説明が入っている（管理画面で選ぶときの手掛かり）", () => {
    for (const t of DISPLAY_TEMPLATES) {
      expect(t.label.length).toBeGreaterThan(0);
      expect(t.description.length).toBeGreaterThan(0);
    }
  });

  it("数値の既定値が min/max の内側にある", () => {
    for (const t of DISPLAY_TEMPLATES) {
      for (const o of t.options) {
        if (o.kind === "number") {
          expect(o.default).toBeGreaterThanOrEqual(o.min);
          expect(o.default).toBeLessThanOrEqual(o.max);
        }
      }
    }
  });

  it("選択肢の既定値が選択肢の中にある", () => {
    for (const t of DISPLAY_TEMPLATES) {
      for (const o of t.options) {
        if (o.kind === "select") {
          expect(o.choices.map((c) => c.value)).toContain(o.default);
        }
      }
    }
  });
});

describe("findDisplayTemplate", () => {
  it("既知のキーを引ける", () => {
    expect(findDisplayTemplate("production")?.label).toBe("生産状況");
  });

  it("未知・null・undefined は undefined", () => {
    expect(findDisplayTemplate("nope")).toBeUndefined();
    expect(findDisplayTemplate(null)).toBeUndefined();
    expect(findDisplayTemplate(undefined)).toBeUndefined();
  });
});

describe("templateOptionsSchema — 宣言から作る検証", () => {
  const production = findDisplayTemplate("production");
  if (!production) throw new Error("production テンプレートが無い");
  const schema = templateOptionsSchema(production);

  it("空でも既定値で埋まる（部分入力を許す）", () => {
    const parsed = schema.parse({});
    expect(parsed).toMatchObject({
      plantId: null,
      rows: 8,
      includePending: true,
    });
  });

  it("与えた値を通す", () => {
    expect(
      schema.parse({ plantId: 3, rows: 12, includePending: false }),
    ).toEqual({ plantId: 3, rows: 12, includePending: false });
  });

  it("範囲外の数値は既定値に倒す（保存を失敗させない）", () => {
    expect(schema.parse({ rows: 999 })).toMatchObject({ rows: 8 });
    expect(schema.parse({ rows: 0 })).toMatchObject({ rows: 8 });
  });

  it("型違いも既定値に倒す", () => {
    expect(
      schema.parse({ rows: "たくさん", includePending: "yes" }),
    ).toMatchObject({ rows: 8, includePending: true });
  });

  it("知らないキーは落とす（画面を替えても前の設定が残らない）", () => {
    const parsed = schema.parse({ rows: 5, dashboardId: 14, message: "x" });
    expect(parsed).not.toHaveProperty("dashboardId");
    expect(parsed).not.toHaveProperty("message");
  });

  it("お知らせの本文は上限を超えると既定値に倒す", () => {
    const t = findDisplayTemplate("announcement");
    if (!t) throw new Error("announcement テンプレートが無い");
    const parsed = templateOptionsSchema(t).parse({
      message: "あ".repeat(500),
    });
    expect(parsed).toMatchObject({ message: "" });
  });

  it("お知らせの見た目は選択肢外を既定値に倒す", () => {
    const t = findDisplayTemplate("announcement");
    if (!t) throw new Error("announcement テンプレートが無い");
    expect(templateOptionsSchema(t).parse({ level: "rainbow" })).toMatchObject({
      level: "info",
    });
  });
});

describe("defaultTemplateOptions", () => {
  it("すべての設定キーを既定値で埋める", () => {
    for (const t of DISPLAY_TEMPLATES) {
      const defaults = defaultTemplateOptions(t);
      for (const o of t.options) {
        expect(Object.hasOwn(defaults, o.key)).toBe(true);
      }
      // 既定値だけの状態が、そのまま検証を通ること
      expect(() => templateOptionsSchema(t).parse(defaults)).not.toThrow();
    }
  });

  it("拠点は未選択（null）から始まる", () => {
    const t = findDisplayTemplate("production");
    if (!t) throw new Error("production テンプレートが無い");
    expect(defaultTemplateOptions(t).plantId).toBeNull();
  });
});

describe("描画側の取り出し", () => {
  it("想定どおりの型なら値を返す", () => {
    expect(optionNumber({ rows: 5 }, "rows", 8)).toBe(5);
    expect(optionBoolean({ a: false }, "a", true)).toBe(false);
    expect(optionString({ m: "こんにちは" }, "m", "")).toBe("こんにちは");
    expect(optionPlantId({ plantId: 7 })).toBe(7);
  });

  it("型が違えば既定値に倒す", () => {
    expect(optionNumber({ rows: "5" }, "rows", 8)).toBe(8);
    expect(optionNumber({ rows: Number.NaN }, "rows", 8)).toBe(8);
    expect(optionBoolean({ a: "true" }, "a", false)).toBe(false);
    expect(optionString({ m: 1 }, "m", "既定")).toBe("既定");
  });

  it("拠点は 0・負数・小数・欠落を未選択として扱う", () => {
    expect(optionPlantId({ plantId: 0 })).toBeNull();
    expect(optionPlantId({ plantId: -1 })).toBeNull();
    expect(optionPlantId({ plantId: 1.5 })).toBeNull();
    expect(optionPlantId({})).toBeNull();
  });
});
