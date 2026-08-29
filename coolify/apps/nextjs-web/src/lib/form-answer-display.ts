/**
 * form-answer-display.ts — 回答 1 つをどう見せるかの規約（純粋・client-safe）。
 *
 * 画面（FormResponseView）と帳票（form-response-pdf）が**同じ判断**を使うために
 * ここへ置く。分かれていたときは、同じ回答が 3 通りに見えていた:
 *   - 画面の複数行テキストが 1 行に潰れる（`<Text>` に pre-wrap が無かった）
 *   - PDF がサブテーブルを「列=値 / 列=値」の文字列で刷る（Excel 用の平坦化を
 *     そのまま流用していたため）
 *   - 添付が UUID のまま出る（型の分岐が無く `String(value)` に落ちていた）
 *
 * ここが決めるのは **型ごとの器（shape）と値の文字列化**だけで、描画そのものは
 * React と HTML がそれぞれ行う。器を 1 か所にしておけば、項目型を足したときに
 * 「画面には出たが PDF では空欄」という食い違いが起きない。
 */

import type {
  FormAnswerValue,
  FormFieldDef,
  FormFieldType,
} from "./form-schema";
import { isEmptyDoc, type RichTextDoc } from "./rich-text-core";

/**
 * 回答を入れる器。
 *
 *   inline     … 1 行に収まる（text / number / date / time / select / lookup）
 *   choices    … 選んだものの並び（multiselect）
 *   long       … 高さが中身で決まる本文（textarea / richtext）
 *   table      … サブテーブル（行 × 列）
 *   attachment … 添付。**回答の値としては保存されない**（別タブで扱う）
 *   related    … 関連レコード一覧。表示専用で値を持たない
 */
export type AnswerShape =
  | "inline"
  | "choices"
  | "long"
  | "table"
  | "attachment"
  | "related";

export function answerShape(type: FormFieldType): AnswerShape {
  switch (type) {
    case "textarea":
    case "richtext":
      return "long";
    case "multiselect":
      return "choices";
    case "table":
      return "table";
    case "attachment":
      return "attachment";
    case "related":
      return "related";
    default:
      return "inline";
  }
}

/** 高さが中身で決まる器か（枠を先に確保して、中で伸ばす）。 */
export function isLongAnswer(type: FormFieldType): boolean {
  const shape = answerShape(type);
  return shape === "long" || shape === "table" || shape === "related";
}

/** 未回答か。空文字・空配列・空のリッチテキストまで「無い」とみなす。 */
export function isBlankAnswer(
  type: FormFieldType,
  value: FormAnswerValue,
): boolean {
  if (value == null) return true;
  if (type === "richtext") return isEmptyDoc(value as unknown as RichTextDoc);
  if (typeof value === "string") return value.trim() === "";
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "object" && "id" in value)
    return !(value as { id: string }).id;
  return false;
}

/** 選択肢の value → 表示ラベル（ja → en → value）。 */
export function optionLabel(field: FormFieldDef, value: string): string {
  const option = field.options?.find((o) => o.value === value);
  return option ? option.label.ja || option.label.en || option.value : value;
}

/**
 * 選ばれた選択肢のラベル。select は 0..1 個、multiselect は 0..N 個。
 * **定義順に並べる** — 保存された配列の順（押した順）で出すと、同じ内容の
 * 回答が別の並びで見えて、見比べたときに違うものに見える。
 */
export function selectedLabels(
  field: FormFieldDef,
  value: FormAnswerValue,
): string[] {
  if (field.type === "select")
    return typeof value === "string" && value !== ""
      ? [optionLabel(field, value)]
      : [];
  if (field.type !== "multiselect" || !Array.isArray(value)) return [];
  const picked = new Set(
    value.filter((v): v is string => typeof v === "string"),
  );
  const defined = (field.options ?? [])
    .filter((o) => picked.has(o.value))
    .map((o) => o.label.ja || o.label.en || o.value);
  // 定義から消えた選択肢も残す（過去の版で選ばれた値は、その回答の事実）。
  const definedValues = new Set((field.options ?? []).map((o) => o.value));
  const orphans = [...picked].filter((v) => !definedValues.has(v));
  return [...defined, ...orphans];
}

/**
 * 数値の表示。**桁区切りを足すだけで、書かれた表現は変えない。**
 *
 * 保存は文字列（form-schema の値表現）で、丸めも桁落ちもさせていない。
 * ここで `Number()` を通して出し直すと「007」が「7」に、「1.50」が「1.5」に
 * なる — 品番や測定値を入れた人の意図を壊す。
 */
export function formatNumberAnswer(value: FormAnswerValue): string {
  const text =
    typeof value === "number"
      ? String(value)
      : typeof value === "string"
        ? value.trim()
        : "";
  const parts = /^(-?)(\d+)(\.\d+)?$/.exec(text);
  if (!parts) return text;
  const [, sign, int, frac] = parts;
  return `${sign}${int.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}${frac ?? ""}`;
}

/** 添付の個数。回答の値として入っていない（別タブ）ので、普通は 0。 */
export function attachmentCount(value: FormAnswerValue): number {
  return Array.isArray(value) ? value.length : 0;
}

/** サブテーブルの行（型が合わないものは空配列にする）。 */
export function tableRows(
  value: FormAnswerValue,
): Record<string, FormAnswerValue>[] {
  return Array.isArray(value)
    ? (value as Record<string, FormAnswerValue>[]).filter(
        (row) => row != null && typeof row === "object" && !Array.isArray(row),
      )
    : [];
}
