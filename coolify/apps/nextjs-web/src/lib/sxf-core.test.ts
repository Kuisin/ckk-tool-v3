import { describe, expect, it } from "vitest";
import {
  coerceSpecValue,
  decodeStepEscapes,
  decodeSxfBytes,
  extractTitleBlock,
  inferToolDimensions,
  matchCustomerOption,
  parseSxf,
  readSxfDrawing,
  type SpecFieldDefLike,
  sxfSpecPatch,
  sxfTitleBlock,
} from "./sxf-core";

// 図脳RAPID14 の「SXF形式」書き出しと同じ形の合成データ。座標・字句の囲み方
// （人の読む文字は \' … \'、値は ' … '）は実ファイル（仕様図 No.1639 / 1642）を
// 写した。実在の取引先名は入れていない。
const text = (s: string, x: number, y: number, h = 1.5) =>
  `/*SXF\n#1 = text_string_feature('1','1','2',\\'${s}\\','${x}','${y}','${h}','6.0','0.000000','0.00000000000000','0.00000000000000','1','1')\nSXF*/`;
const dim = (s: string) =>
  `/*SXF\n#2 = linear_dim_feature('1','1','14','11','50.0','49.3','71.0','49.3','1','54.4','63.5','54.4','63.5','54.4','48.3','1','59.9','65.2','59.9','65.2','59.9','48.3','6','2','54.4','49.3','0.515','6','2','59.9','49.3','0.515','1','1',\\'${s}\\','62.5','49.3','2.000000','3.000000','0.000000','0.00000000000000','0.00000000000000','1','1')\nSXF*/`;
const angle = (s: string) =>
  `/*SXF\n#3 = angular_dim_feature('1','1','14','11','53.1','67.4','10.5','122.2','237.7','1',\\'${s}\\','42.5','67.4','2.000000','5.000000','0.000000','90.0000000000000','0.00000000000000','2','1')\nSXF*/`;

const SAMPLE = [
  "ISO-10303-21;",
  "HEADER;",
  "FILE_DESCRIPTION(('SCADEC level2 feature_mode'),",
  "        '2;1');",
  "FILE_NAME('No.1639 \\X2\\4ED569D856F3\\X0\\.sfc',",
  "        '2026-9-25T13:20:51',",
  "        (''),",
  "        (''),",
  "        'SCADEC_API_Ver2.02',",
  "        '\\X2\\56F38133\\X0\\RAPID14 Ver14',",
  "        '');",
  "FILE_SCHEMA(('ASSOCIATIVE_DRAUGHTING'));",
  "ENDSEC;",
  "DATA;",
  text("No.1639", 140.7, 101.1),
  text("作成年月日", 5.7, 17.2),
  text("2026.8.3", 19.4, 17.3),
  text("お得意先名", 26.8, 17.1),
  text("株式会社テスト工業", 50.3, 17.0),
  text("殿", 63.4, 15.9),
  text("図面番号", 69.1, 16.9),
  text("072851-01", 88.8, 16.9),
  text("刃数", 104.3, 17.0),
  text("2", 117.6, 17.2),
  text("Designed", 130.6, 16.5),
  text("単位", 7.9, 11.6),
  text("mm", 17.9, 10.5),
  text("品名", 29.2, 11.8),
  text("超硬段付ドリル", 51.5, 11.7),
  text("工具番号", 69.2, 11.8),
  text("DRL2072-120-8.9-EVO", 88.8, 12.0),
  text("ネジレ", 103.4, 11.7),
  text("右30°(φ10)", 117.4, 11.6),
  text("刻印", 7.9, 6.2),
  text("図中記載", 19.4, 6.3),
  text("材質", 29.2, 6.3),
  text("超微粒子超硬", 51.3, 6.3),
  text("表面処理", 69.1, 6.3),
  text("AlCrN", 89.1, 6.1),
  text("シー・ケィ・ケー 株式会社", 112.3, 6.3),
  dim("φ2.16"),
  dim("0.6(マージン)"),
  dim("(2.08)"),
  dim("φ7.2"),
  dim("φ10"),
  dim("8.9"),
  dim("33"),
  dim("120"),
  angle("120°"),
  "ENDSEC;",
  "END-ISO-10303-21;",
].join("\r\n");

describe("decodeStepEscapes", () => {
  it("\\X2\\…\\X0\\ を UTF-16 として戻す", () => {
    expect(decodeStepEscapes("No.1639 \\X2\\4ED569D856F3\\X0\\.sfc")).toBe(
      "No.1639 仕様図.sfc",
    );
  });
});

describe("parseSxf", () => {
  it("SXF でなければ null", () => {
    expect(parseSxf("0\nSECTION\n2\nENTITIES")).toBeNull();
  });

  it("ヘッダ・文字・寸法を取り出す", () => {
    const doc = parseSxf(SAMPLE);
    expect(doc?.fileName).toBe("No.1639 仕様図.sfc");
    expect(doc?.software).toBe("図脳RAPID14 Ver14");
    expect(doc?.texts.find((t) => t.text === "品名")).toMatchObject({
      x: 29.2,
      y: 11.8,
    });
    expect(doc?.dimensions.map((d) => d.text)).toContain("φ10");
    expect(doc?.dimensions.find((d) => d.text === "120°")?.kind).toBe(
      "angular",
    );
  });
});

describe("extractTitleBlock — ラベルの右隣を値にする", () => {
  const title = extractTitleBlock(parseSxf(SAMPLE)?.texts ?? []);

  it("表題欄の各項目を読む", () => {
    expect(title).toEqual({
      createdAt: "2026.8.3",
      customerName: "株式会社テスト工業",
      drawingNumber: "072851-01",
      flutes: "2",
      unit: "mm",
      productName: "超硬段付ドリル",
      toolNumber: "DRL2072-120-8.9-EVO",
      helix: "右30°(φ10)",
      marking: "図中記載",
      material: "超微粒子超硬",
      surfaceTreatment: "AlCrN",
    });
  });

  it("**隣の見出し（Designed・殿）を値にしない**", () => {
    const t = extractTitleBlock([
      { text: "刃数", x: 104, y: 17, height: 1.5 },
      { text: "Designed", x: 130, y: 16.5, height: 1.5 },
    ]);
    expect(t.flutes).toBeUndefined();
  });

  it("別の行の文字は拾わない", () => {
    const t = extractTitleBlock([
      { text: "品名", x: 29, y: 11.8, height: 1.5 },
      { text: "超硬ドリル", x: 51, y: 17, height: 1.5 },
    ]);
    expect(t.productName).toBeUndefined();
  });
});

describe("inferToolDimensions — 表示文字列から外径・全長", () => {
  it("外径 = φ の最大、全長 = 数字だけの長さ寸法の最大", () => {
    expect(inferToolDimensions(parseSxf(SAMPLE)?.dimensions ?? [])).toEqual({
      diameterMm: 10,
      lengthMm: 120,
    });
  });

  it("角度・注記付き・参考寸法は長さにしない", () => {
    expect(
      inferToolDimensions([
        { kind: "angular", text: "140" },
        { kind: "linear", text: "9.5(ピッチ)" },
        { kind: "linear", text: "(95)" },
      ]),
    ).toEqual({ diameterMm: null, lengthMm: null });
  });
});

describe("readSxfDrawing", () => {
  it("図番（No.…）と記載事項をまとめて返す", () => {
    const r = readSxfDrawing(SAMPLE);
    expect(r?.sheetNumber).toBe("No.1639");
    expect(r?.diameterMm).toBe(10);
    expect(r?.lengthMm).toBe(120);
    expect(r?.title.productName).toBe("超硬段付ドリル");
  });

  it("Shift_JIS のバイト列から読める", () => {
    // 「品名」を Shift_JIS で書いたバイト列
    const bytes = new Uint8Array([0x95, 0x69, 0x96, 0xbc]);
    expect(decodeSxfBytes(bytes)).toBe("品名");
  });
});

describe("仕様欄への当てはめ", () => {
  const defs: SpecFieldDefLike[] = [
    { key: "drawingNo", label: { ja: "図番" }, type: "string" },
    { key: "flutes", label: { ja: "刃数" }, type: "number" },
    {
      key: "surfaceTreatment",
      label: { ja: "表面処理" },
      type: "select",
      options: [
        { value: "none", label: "なし" },
        { value: "coating", label: "コーティング" },
      ],
    },
  ];

  it("名称が表題欄のラベルと同じ項目・既定の対応先に入れる", () => {
    const patch = sxfSpecPatch(
      readSxfDrawing(SAMPLE) as NonNullable<ReturnType<typeof readSxfDrawing>>,
      defs,
    );
    expect(patch.specValues).toEqual({ drawingNo: "072851-01", flutes: "2" });
    expect(patch.diameterMm).toBe(10);
  });

  it("**型に合わない値は入れない**（選択肢に無い表面処理）", () => {
    const patch = sxfSpecPatch(
      readSxfDrawing(SAMPLE) as NonNullable<ReturnType<typeof readSxfDrawing>>,
      defs,
    );
    expect(patch.specValues.surfaceTreatment).toBeUndefined();
    expect(patch.unmatched).toContainEqual({
      field: "surfaceTreatment",
      value: "AlCrN",
    });
  });

  it("型ごとの変換", () => {
    expect(
      coerceSpecValue({ key: "h", label: {}, type: "number" }, "右30°"),
    ).toBe("30");
    expect(
      coerceSpecValue({ key: "d", label: {}, type: "date" }, "2026.8.3"),
    ).toBe("2026-08-03");
    expect(
      coerceSpecValue({ key: "b", label: {}, type: "boolean" }, "はい"),
    ).toBeNull();
  });
});

describe("matchCustomerOption — 1 つに決まるときだけ", () => {
  const options = [
    { value: "1", label: "テスト工業（株）" },
    { value: "2", label: "株式会社 サンプル" },
    { value: "3", label: "サンプル精機" },
  ];

  it("法人格・空白の揺れを無視して一致させる", () => {
    expect(matchCustomerOption("株式会社テスト工業", options)?.value).toBe("1");
    expect(matchCustomerOption("サンプル株式会社", options)?.value).toBe("2");
  });

  it("候補が 2 つ以上なら選ばない", () => {
    expect(
      matchCustomerOption("サンプル", [
        { value: "a", label: "サンプル精機" },
        { value: "b", label: "サンプル商事" },
      ]),
    ).toBeNull();
  });

  it("名前が無ければ選ばない", () => {
    expect(matchCustomerOption(undefined, options)).toBeNull();
    expect(matchCustomerOption("", options)).toBeNull();
  });
});

describe("sxfTitleBlock — 版の図面情報へ", () => {
  it("書かれていた文字をそのまま写す（得意先名・単位は写さない）", () => {
    const tb = sxfTitleBlock(
      readSxfDrawing(SAMPLE) as NonNullable<ReturnType<typeof readSxfDrawing>>,
    );
    expect(tb).toEqual({
      productName: "超硬段付ドリル",
      drawingNumber: "072851-01",
      toolNumber: "DRL2072-120-8.9-EVO",
      material: "超微粒子超硬",
      surfaceTreatment: "AlCrN",
      flutes: "2",
      helix: "右30°(φ10)",
      marking: "図中記載",
      drawnAt: "2026.8.3",
    });
  });
});
