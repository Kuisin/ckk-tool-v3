/**
 * sxf-core.ts — SXF（.sfc, SCADEC feature mode）から図面の記載事項を読む（純関数）。
 *
 * 図脳RAPID の「SXF形式」で書き出した図面を、設計図の版の仕様欄へ流し込むための
 * 読み取り。ブラウザで読む（アップロード前に中身を見て、フォームを埋める）ので
 * DB にも React にも触らない。
 *
 * SXF の .sfc は ISO-10303-21 の枠に `/*SXF … SXF*\/` の注釈で feature を並べた
 * テキスト。**図面に書かれている文字は text_string_feature、寸法は
 * linear_dim_feature 等の表示文字列**として入っている。ここが「メタデータ」の
 * 正体で、図脳RAPID（無印）には属性を CSV で書き出す機能が無い — 表題欄に
 * 書いた文字そのものを読むしかない。
 *
 * 読み方は 2 段:
 *   1. parseSxf       … 文字（位置つき）と寸法の表示文字列を取り出す
 *   2. readSxfDrawing … 表題欄のラベル（品名・材質・刃数 …）の右隣の文字を値として拾い、
 *                       寸法から外径・全長を推定する
 * 表題欄はラベルの**位置**で値を対応づける。社内の枠（C・K・K の仕様図）は
 * 図面ごとに同じ座標なので安定する。別の枠で描いた図面では拾えない項目が出る
 * だけで、誤った値は入れない（ラベルが見つからなければ空）。
 *
 * 形式の注意（実ファイル No.1639 / 1642 で確認）:
 *   - 文字コードは Shift_JIS。ヘッダの FILE_NAME だけ ISO-10303-21 の
 *     \X2\hhhh…\X0\ エスケープ
 *   - 人が読む文字列は \'…\' で囲まれ、数値・座標は '…' で囲まれる
 *   - 寸法は**表示文字列**を読む。図は 1:1 とは限らない（全長 120 が
 *     70.8 の長さで描かれていた）ので、線の長さから寸法を測ってはいけない
 */

import type { TitleBlock, TitleBlockField } from "./design-files-core";

/** 図面上の文字 1 つ（位置つき）。 */
export interface SxfText {
  text: string;
  x: number;
  y: number;
  height: number;
}

/** 寸法 1 つ（表示文字列）。 */
export interface SxfDimension {
  kind: "linear" | "angular" | "radius" | "diameter";
  text: string;
}

export interface SxfDocument {
  /** ヘッダの FILE_NAME（書き出し時のファイル名）。 */
  fileName: string | null;
  /** 書き出したソフト（例: 図脳RAPID14 Ver14）。 */
  software: string | null;
  texts: SxfText[];
  dimensions: SxfDimension[];
  /** 引出線の注記（label_feature）。例: φ12xR0.2x40L */
  labels: string[];
}

/** 表題欄の項目。ラベルの語は社内の仕様図の枠に合わせている。 */
export const SXF_TITLE_FIELDS = [
  "createdAt",
  "customerName",
  "drawingNumber",
  "flutes",
  "productName",
  "toolNumber",
  "helix",
  "unit",
  "material",
  "surfaceTreatment",
  "marking",
] as const;
export type SxfTitleField = (typeof SXF_TITLE_FIELDS)[number];

/**
 * 表題欄のラベル（図面に刷られている語）。値はこの右隣の文字。
 * 図面の文字そのものなので翻訳対象ではない（_specs/i18n-glossary.md §1）。
 */
export const SXF_TITLE_LABELS: Record<SxfTitleField, readonly string[]> = {
  createdAt: ["作成年月日"], // i18n-ignore
  customerName: ["お得意先名", "得意先名", "客先名"], // i18n-ignore
  drawingNumber: ["図面番号", "図番"], // i18n-ignore
  flutes: ["刃数"], // i18n-ignore
  productName: ["品名"], // i18n-ignore
  toolNumber: ["工具番号"], // i18n-ignore
  helix: ["ネジレ", "ねじれ角"], // i18n-ignore
  unit: ["単位"], // i18n-ignore
  material: ["材質"], // i18n-ignore
  surfaceTreatment: ["表面処理"], // i18n-ignore
  marking: ["刻印"], // i18n-ignore
};

/**
 * 値として拾ってはいけない枠の固定文字（英字の副題・押印欄・変更履歴の見出し）。
 * これを飛ばさないと「刃数 = Designed」のように隣の見出しを値にしてしまう。
 */
const FRAME_WORDS = new Set(
  [
    "Prepared",
    "Customer’Name",
    "Customer'Name",
    "Drawing No.",
    "Cutting Teeth",
    "Unit",
    "Tool Name",
    "Tool No.",
    "Helix Angle",
    "Marking",
    "Material",
    "Surfacetreatment",
    "Surface treatment",
    "Designed",
    "Checked",
    "approval",
    "承認", // i18n-ignore
    "設計", // i18n-ignore
    "検図", // i18n-ignore
    "殿", // i18n-ignore
    "変更回数", // i18n-ignore
    "年月日", // i18n-ignore
    "変更内容", // i18n-ignore
    "変更者", // i18n-ignore
  ].map((w) => normalizeText(w)),
);

const LABEL_TO_FIELD = new Map<string, SxfTitleField>(
  SXF_TITLE_FIELDS.flatMap((f) =>
    SXF_TITLE_LABELS[f].map((l) => [normalizeText(l), f] as const),
  ),
);

/** 比較用の正規化（全角半角・空白の揺れを畳む）。 */
export function normalizeText(s: string): string {
  return s.normalize("NFKC").replace(/\s+/g, " ").trim();
}

/** ISO-10303-21 の \X2\hhhh…\X0\（UTF-16 の 16 進）を戻す。 */
export function decodeStepEscapes(s: string): string {
  return s.replace(/\\X2\\([0-9A-Fa-f]+)\\X0\\/g, (_, hex: string) => {
    let out = "";
    for (let i = 0; i + 4 <= hex.length; i += 4) {
      out += String.fromCharCode(Number.parseInt(hex.slice(i, i + 4), 16));
    }
    return out;
  });
}

/** .sfc のバイト列 → 文字列（Shift_JIS。ブラウザ・Node の TextDecoder で読める）。 */
export function decodeSxfBytes(bytes: ArrayBuffer | Uint8Array): string {
  return new TextDecoder("shift_jis").decode(bytes);
}

type Token = { quoted: "text" | "value"; value: string };

/**
 * feature の引数列を字句に分ける。\'…\' が人の読む文字列、'…' が値。
 * 区切りのカンマや括弧は捨てる（位置は並び順で読む）。
 */
function tokenize(args: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  while (i < args.length) {
    if (args.startsWith("\\'", i)) {
      const end = args.indexOf("\\'", i + 2);
      if (end < 0) break;
      out.push({ quoted: "text", value: args.slice(i + 2, end) });
      i = end + 2;
    } else if (args[i] === "'") {
      const end = args.indexOf("'", i + 1);
      if (end < 0) break;
      out.push({ quoted: "value", value: args.slice(i + 1, end) });
      i = end + 1;
    } else {
      i++;
    }
  }
  return out;
}

const FEATURE_RE = /#\d+\s*=\s*(\w+)\(([\s\S]*?)\)\s*\r?\nSXF\*\//g;

const DIM_KIND: Record<string, SxfDimension["kind"]> = {
  linear_dim_feature: "linear",
  angular_dim_feature: "angular",
  radius_dim_feature: "radius",
  diameter_dim_feature: "diameter",
};

/** .sfc を読む。SXF でなければ null（呼び出し側が「読めない形式」と言う）。 */
export function parseSxf(source: string): SxfDocument | null {
  if (!source.includes("ISO-10303-21") || !source.includes("SXF")) return null;

  const header = /FILE_NAME\(([\s\S]*?)\);/.exec(source)?.[1] ?? "";
  const headerValues = [...header.matchAll(/'((?:[^'\\]|\\.)*)'/g)].map((m) =>
    decodeStepEscapes(m[1]),
  );
  const fileName = headerValues[0] || null;
  // FILE_NAME の 6 番目 = originating_system（書き出したソフト）。
  const software = headerValues[5] || null;

  const texts: SxfText[] = [];
  const dimensions: SxfDimension[] = [];
  const labels: string[] = [];

  for (const m of source.matchAll(FEATURE_RE)) {
    const name = m[1];
    const tokens = tokenize(m[2]);
    const textIdx = tokens.findIndex((t) => t.quoted === "text");
    const text =
      textIdx >= 0
        ? normalizeText(decodeStepEscapes(tokens[textIdx].value))
        : "";

    if (name === "text_string_feature") {
      // (layer, color, font, str, x, y, height, width, …)
      if (!text || textIdx < 0) continue;
      const x = Number(tokens[textIdx + 1]?.value);
      const y = Number(tokens[textIdx + 2]?.value);
      const height = Number(tokens[textIdx + 3]?.value);
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      texts.push({ text, x, y, height: Number.isFinite(height) ? height : 0 });
    } else if (DIM_KIND[name]) {
      if (text) dimensions.push({ kind: DIM_KIND[name], text });
    } else if (name === "label_feature") {
      if (text) labels.push(text);
    }
  }

  return { fileName, software, texts, dimensions, labels };
}

/** 同じ行とみなす縦のずれ（図面単位 = mm）。表題欄の行間は 5 前後。 */
const ROW_TOLERANCE = 1.5;

/**
 * 表題欄を読む — ラベルの右隣（同じ行・次の見出しより左）の文字を値にする。
 * 見つからない項目はキーごと無い。
 */
export function extractTitleBlock(
  texts: readonly SxfText[],
): Partial<Record<SxfTitleField, string>> {
  const out: Partial<Record<SxfTitleField, string>> = {};
  const isFrame = (t: SxfText) =>
    LABEL_TO_FIELD.has(t.text) || FRAME_WORDS.has(t.text);

  for (const label of texts) {
    const field = LABEL_TO_FIELD.get(label.text);
    if (!field || out[field] !== undefined) continue;
    const sameRow = texts.filter(
      (t) =>
        t !== label &&
        Math.abs(t.y - label.y) <= ROW_TOLERANCE &&
        t.x > label.x,
    );
    // 次の見出し（ラベル・枠の固定文字）より右は別の欄。
    const nextFrameX = Math.min(
      ...sameRow.filter(isFrame).map((t) => t.x),
      Number.POSITIVE_INFINITY,
    );
    const value = sameRow
      .filter((t) => !isFrame(t) && t.x < nextFrameX)
      .sort((a, b) => a.x - b.x)[0];
    if (value) out[field] = value.text;
  }
  return out;
}

const DIAMETER_RE = /^[φΦ⌀ø](\d+(?:\.\d+)?)$/;
const PLAIN_NUMBER_RE = /^\d+(?:\.\d+)?$/;

/**
 * 寸法から外径と全長を推定する。
 *   外径 = φ 付きの寸法のうち最大（段付きなら小さい段より太いシャンク）
 *   全長 = 数字だけの長さ寸法のうち最大（括弧付きの参考寸法・注記付きは除く）
 * 工具の図面では最も太い径がシャンク径、最も長い長さ寸法が全長になる。
 */
export function inferToolDimensions(dimensions: readonly SxfDimension[]): {
  diameterMm: number | null;
  lengthMm: number | null;
} {
  let diameter: number | null = null;
  let length: number | null = null;
  for (const d of dimensions) {
    if (d.kind === "angular") continue;
    const text = d.text.replace(/\s+/g, "");
    const dia = DIAMETER_RE.exec(text);
    if (dia) {
      const v = Number(dia[1]);
      if (diameter == null || v > diameter) diameter = v;
      continue;
    }
    if (d.kind === "linear" && PLAIN_NUMBER_RE.test(text)) {
      const v = Number(text);
      if (length == null || v > length) length = v;
    }
  }
  return { diameterMm: diameter, lengthMm: length };
}

export interface SxfDrawingReading {
  /** 図面右上の図番（No.1642 など）。 */
  sheetNumber: string | null;
  title: Partial<Record<SxfTitleField, string>>;
  diameterMm: number | null;
  lengthMm: number | null;
  /** 寸法の表示文字列（確認用にそのまま見せる）。 */
  dimensionTexts: string[];
  /** 引出線の注記。 */
  labels: string[];
  software: string | null;
}

/** .sfc の文字列 → 図面の記載事項。SXF でなければ null。 */
export function readSxfDrawing(source: string): SxfDrawingReading | null {
  const doc = parseSxf(source);
  if (!doc) return null;
  const sheet = doc.texts.find((t) => /^No\.\s*\S+$/i.test(t.text));
  const dims = inferToolDimensions(doc.dimensions);
  return {
    sheetNumber: sheet?.text ?? null,
    title: extractTitleBlock(doc.texts),
    diameterMm: dims.diameterMm,
    lengthMm: dims.lengthMm,
    dimensionTexts: doc.dimensions.map((d) => d.text),
    labels: doc.labels,
    software: doc.software,
  };
}

// ─── 仕様欄への当てはめ ───────────────────────────────────────────────────────

/** 表題欄の項目 → 版の図面情報（title_block）のキー。得意先名・単位は写さない。 */
const TITLE_TO_BLOCK: Partial<Record<SxfTitleField, TitleBlockField>> = {
  productName: "productName",
  drawingNumber: "drawingNumber",
  toolNumber: "toolNumber",
  material: "material",
  surfaceTreatment: "surfaceTreatment",
  flutes: "flutes",
  helix: "helix",
  marking: "marking",
  createdAt: "drawnAt",
};

/**
 * 読み取った表題欄 → 版の図面情報。**書かれていた文字をそのまま**持つ
 * （型で揃えるのは製品項目のほう — sxfSpecPatch）。得意先名は受注元の欄、
 * 単位は仕様ではないので写さない。
 */
export function sxfTitleBlock(reading: SxfDrawingReading): TitleBlock {
  const out: TitleBlock = {};
  for (const [from, to] of Object.entries(TITLE_TO_BLOCK) as [
    SxfTitleField,
    TitleBlockField,
  ][]) {
    const v = reading.title[from];
    if (v) out[to] = v;
  }
  return out;
}

/** 製品項目 (SY03) の定義のうち、当てはめに要る部分。 */
export interface SpecFieldDefLike {
  key: string;
  label: { ja?: string; en?: string };
  type: string;
  options?: { value: string; label: string }[];
}

/**
 * 表題欄の項目 → 製品項目のキーの既定対応（SY03 の初期定義に合わせたもの）。
 * これに加えて、製品項目の**名称（ja）が表題欄のラベルと同じ**なら当てる —
 * 管理者が SY03 に「刃数」「ネジレ」を足せば、その図面から自動で入る。
 */
const FIELD_KEY_ALIASES: Partial<Record<SxfTitleField, readonly string[]>> = {
  drawingNumber: ["drawingNo"],
  surfaceTreatment: ["surfaceTreatment"],
};

/** 表題欄の値を、製品項目の型に合う文字列へ。合わなければ null（入れない）。 */
export function coerceSpecValue(
  def: SpecFieldDefLike,
  raw: string,
): string | null {
  const value = normalizeText(raw);
  if (!value) return null;
  switch (def.type) {
    case "number": {
      const m = /-?\d+(?:\.\d+)?/.exec(value);
      return m ? String(Number(m[0])) : null;
    }
    case "select": {
      const hit = (def.options ?? []).find(
        (o) =>
          normalizeText(o.value) === value || normalizeText(o.label) === value,
      );
      return hit ? hit.value : null;
    }
    case "boolean":
      return null;
    case "date": {
      const m = /^(\d{4})[./-](\d{1,2})[./-](\d{1,2})$/.exec(value);
      if (!m) return null;
      return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
    }
    default:
      return value;
  }
}

export interface SxfSpecPatch {
  diameterMm: number | null;
  lengthMm: number | null;
  /** 製品項目のキー → 値（型に合ったものだけ）。 */
  specValues: Record<string, string>;
  /** 読めたが当てはめ先の無かった表題欄の項目（画面に出して人が判断する）。 */
  unmatched: { field: SxfTitleField; value: string }[];
}

/**
 * 読み取り結果 → 仕様欄へ入れる値。**入れるのは確かなものだけ** — 型に合わない
 * 値（選択肢に無い表面処理など）は入れず unmatched に回す。
 */
export function sxfSpecPatch(
  reading: SxfDrawingReading,
  defs: readonly SpecFieldDefLike[],
): SxfSpecPatch {
  const specValues: Record<string, string> = {};
  const unmatched: { field: SxfTitleField; value: string }[] = [];
  const byLabel = new Map(
    defs
      .filter((d) => d.label.ja)
      .map((d) => [normalizeText(d.label.ja ?? ""), d] as const),
  );
  const byKey = new Map(defs.map((d) => [d.key, d] as const));

  for (const field of SXF_TITLE_FIELDS) {
    const raw = reading.title[field];
    if (!raw) continue;
    // 相手先の名前は仕様ではなく受注元の欄が受け持つ。
    if (field === "customerName" || field === "unit") continue;
    const candidates = [
      ...SXF_TITLE_LABELS[field].map((l) => byLabel.get(normalizeText(l))),
      ...(FIELD_KEY_ALIASES[field] ?? []).map((k) => byKey.get(k)),
    ].filter((d): d is SpecFieldDefLike => d != null);
    let placed = false;
    for (const def of candidates) {
      if (specValues[def.key] !== undefined) continue;
      const v = coerceSpecValue(def, raw);
      if (v != null) {
        specValues[def.key] = v;
        placed = true;
        break;
      }
    }
    if (!placed) unmatched.push({ field, value: raw });
  }

  return {
    diameterMm: reading.diameterMm,
    lengthMm: reading.lengthMm,
    specValues,
    unmatched,
  };
}

/** 取引先名の比較キー（法人格・空白・全角半角の揺れを畳む）。 */
export function partnerNameKey(name: string): string {
  return normalizeText(name)
    .replace(/株式会社|有限会社|合同会社|\(株\)|\(有\)|㈱|㈲/g, "") // i18n-ignore
    .replace(/[\s・,.、。]/g, "")
    .toLowerCase();
}

/**
 * 表題欄の得意先名に当たる受注元の選択肢。**1 つに決まるときだけ**返す
 * （候補が 2 つ以上なら人に選ばせる — 違う顧客の系列に版を積むのが最悪の誤り）。
 */
export function matchCustomerOption<T extends { value: string; label: string }>(
  name: string | undefined,
  options: readonly T[],
): T | null {
  if (!name) return null;
  const key = partnerNameKey(name);
  if (!key) return null;
  const exact = options.filter((o) => partnerNameKey(o.label) === key);
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) return null;
  const partial = options.filter((o) => {
    const k = partnerNameKey(o.label);
    return k.length >= 2 && (k.includes(key) || key.includes(k));
  });
  return partial.length === 1 ? partial[0] : null;
}
