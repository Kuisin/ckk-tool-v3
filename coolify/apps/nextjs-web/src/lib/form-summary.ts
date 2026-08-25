/**
 * form-summary.ts — 回答の集計（純関数）。
 *
 * 項目の型ごとに「読む人が何を知りたいか」で形を変える:
 *   選択肢 / 業務データ … どれがどれだけ選ばれたか      → 件数の並び（横棒）
 *   数値                … 分布と代表値                  → 代表値 + 区間ごとの件数
 *   日付 / 時刻         … いつに寄っているか            → 月別 / 時間帯別の件数
 *   テキスト            … 数えても意味が無い            → **グラフにしない**（件数と抜粋）
 *   添付 / サブテーブル … 量                            → 数字だけ
 *
 * すべて 1 系列の件数なので、色は 1 色でよく、凡例も要らない。
 */

import type { FormAnswerValue, FormFieldDef } from "./form-schema";

export interface CountItem {
  label: string;
  count: number;
}

export interface CategorySummary {
  kind: "categories";
  /** 回答された件数（未回答を除く）。 */
  answered: number;
  items: CountItem[];
  /** 上位のみ出したときの、隠れた件数。 */
  otherCount: number;
}

export interface NumberSummary {
  kind: "numbers";
  answered: number;
  min: number;
  max: number;
  mean: number;
  median: number;
  buckets: CountItem[];
}

export interface PeriodSummary {
  kind: "periods";
  answered: number;
  buckets: CountItem[];
}

export interface TextSummary {
  kind: "text";
  answered: number;
  samples: string[];
}

export interface AmountSummary {
  kind: "amount";
  answered: number;
  /** 「合計 120 行 / 1 回答あたり平均 2.4 行」のような説明。 */
  note: string;
}

export interface NoSummary {
  kind: "none";
}

export type FieldSummaryBody =
  | CategorySummary
  | NumberSummary
  | PeriodSummary
  | TextSummary
  | AmountSummary
  | NoSummary;

export interface FieldSummary {
  key: string;
  label: string;
  type: FormFieldDef["type"];
  body: FieldSummaryBody;
}

/** 上位いくつまで棒にするか。それ以上は「その他」に畳む（色も棒も増やさない）。 */
export const MAX_CATEGORY_BARS = 12;
const MAX_NUMBER_BUCKETS = 8;
const MAX_TEXT_SAMPLES = 5;

function isBlank(v: FormAnswerValue): boolean {
  if (v == null) return true;
  if (typeof v === "string") return v.trim() === "";
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === "object" && "id" in v) return !(v as { id: string }).id;
  return false;
}

function tally(values: string[]): CountItem[] {
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  return (
    [...counts.entries()]
      .map(([label, count]) => ({ label, count }))
      // 多い順。同数はラベル順にして、開くたびに並びが変わらないようにする。
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
  );
}

function capBars(items: CountItem[]): {
  items: CountItem[];
  otherCount: number;
} {
  if (items.length <= MAX_CATEGORY_BARS) return { items, otherCount: 0 };
  const head = items.slice(0, MAX_CATEGORY_BARS);
  const otherCount = items
    .slice(MAX_CATEGORY_BARS)
    .reduce((sum, i) => sum + i.count, 0);
  return { items: head, otherCount };
}

function optionLabel(field: FormFieldDef, value: string): string {
  const opt = (field.options ?? []).find((o) => o.value === value);
  return opt ? opt.label.ja || opt.value : value;
}

function numberBuckets(values: number[]): CountItem[] {
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (min === max) return [{ label: String(min), count: values.length }];

  const count = Math.min(MAX_NUMBER_BUCKETS, Math.max(2, values.length));
  const width = (max - min) / count;
  const buckets: CountItem[] = [];
  for (let i = 0; i < count; i++) {
    const lo = min + width * i;
    const hi = i === count - 1 ? max : min + width * (i + 1);
    buckets.push({ label: `${round(lo)}〜${round(hi)}`, count: 0 });
  }
  for (const v of values) {
    // 最大値は最後の区間に入れる（v === max のとき index が範囲外になるため）。
    const idx = Math.min(count - 1, Math.floor((v - min) / width));
    buckets[idx].count += 1;
  }
  return buckets;
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

function median(sorted: number[]): number {
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? round((sorted[mid - 1] + sorted[mid]) / 2)
    : sorted[mid];
}

function summarizeField(
  field: FormFieldDef,
  answers: readonly Record<string, FormAnswerValue>[],
): FieldSummaryBody {
  const values = answers
    .map((a) => a[field.key])
    .filter((v) => !isBlank(v)) as FormAnswerValue[];
  const answered = values.length;

  switch (field.type) {
    case "select": {
      const capped = capBars(
        tally(
          values
            .filter((v): v is string => typeof v === "string")
            .map((v) => optionLabel(field, v)),
        ),
      );
      return { kind: "categories", answered, ...capped };
    }

    case "multiselect": {
      // 1 回答が複数選ぶので、件数の合計は回答数を超える。
      const flat = values
        .filter((v): v is string[] => Array.isArray(v))
        .flat()
        .filter((v): v is string => typeof v === "string")
        .map((v) => optionLabel(field, v));
      return { kind: "categories", answered, ...capBars(tally(flat)) };
    }

    case "lookup": {
      // ラベルで数える（id は人が読めない）。改名前後は別物として並ぶが、
      // 回答時点のラベルを保存している以上それが事実。
      const labels = values
        .filter(
          (v): v is { id: string; label: string } =>
            typeof v === "object" && v !== null && "label" in v,
        )
        .map((v) => v.label || v.id);
      return { kind: "categories", answered, ...capBars(tally(labels)) };
    }

    case "number": {
      const nums = values
        .filter((v): v is string => typeof v === "string")
        .map(Number)
        .filter((n) => Number.isFinite(n));
      if (nums.length === 0) return { kind: "text", answered: 0, samples: [] };
      const sorted = [...nums].sort((a, b) => a - b);
      return {
        kind: "numbers",
        answered: nums.length,
        min: sorted[0],
        max: sorted[sorted.length - 1],
        mean: round(nums.reduce((a, b) => a + b, 0) / nums.length),
        median: median(sorted),
        buckets: numberBuckets(nums),
      };
    }

    case "date": {
      // 月でまとめる。日別だと棒が増えすぎて傾向が読めない。
      const months = values
        .filter((v): v is string => typeof v === "string")
        .map((v) => v.slice(0, 7));
      const buckets = tally(months).sort((a, b) =>
        a.label.localeCompare(b.label),
      );
      return { kind: "periods", answered, buckets };
    }

    case "time": {
      const hours = values
        .filter((v): v is string => typeof v === "string")
        .map((v) => `${v.slice(0, 2)}時台`);
      const buckets = tally(hours).sort((a, b) =>
        a.label.localeCompare(b.label),
      );
      return { kind: "periods", answered, buckets };
    }

    case "attachment": {
      const files = values
        .filter((v): v is string[] => Array.isArray(v))
        .reduce((sum, v) => sum + v.length, 0);
      return {
        kind: "amount",
        answered,
        note: `${answered} 件の回答に、合計 ${files} 個のファイル`,
      };
    }

    case "table": {
      const rows = values
        .filter((v): v is Record<string, unknown>[] => Array.isArray(v))
        .reduce((sum, v) => sum + v.length, 0);
      const avg = answered === 0 ? 0 : round(rows / answered);
      return {
        kind: "amount",
        answered,
        note: `合計 ${rows} 行（1 回答あたり平均 ${avg} 行）`,
      };
    }

    case "related":
      // 表示専用。集計する値を持たない。
      return { kind: "none" };

    default: {
      // text / textarea / richtext — 数えても意味が無いので棒にしない。
      const samples = values
        .map((v) => (typeof v === "string" ? v : ""))
        .filter(Boolean)
        .slice(0, MAX_TEXT_SAMPLES);
      return { kind: "text", answered, samples };
    }
  }
}

export function summarizeResponses(
  fields: readonly FormFieldDef[],
  answers: readonly Record<string, FormAnswerValue>[],
): FieldSummary[] {
  return fields.map((field) => ({
    key: field.key,
    label: field.label.ja || field.key,
    type: field.type,
    body: summarizeField(field, answers),
  }));
}
