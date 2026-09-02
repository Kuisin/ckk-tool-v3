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

import { optionLabel } from "./form-answer-display";
import type { FormAnswerValue, FormFieldDef } from "./form-schema";
import type { Tr } from "./i18n";
import { type RichTextDoc, toPlainText } from "./rich-text-core";

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
  /**
   * 集計に入れた回答の総数（項目に答えたかどうかに依らない）。
   * `body.answered` との差が「この項目に答えなかった人」— 必須でない質問では
   * それ自体が結果なので、件数だけでなく**母数**も持って回る。
   */
  total: number;
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

/**
 * 並び順。多い順が既定だが、5 段階評価のように**選択肢の順序に意味がある**項目では
 * 定義順のほうが読める（「そう思う」→「思わない」が票数で入れ替わらない）。
 * 定義順では 0 件の選択肢も残す — 「誰も選ばなかった」ことが結果だから。
 */
function orderItems(
  counted: CountItem[],
  field: FormFieldDef,
  options: SummaryOptions,
): CountItem[] {
  if (options.order !== "definition" || !field.options?.length) return counted;
  const byLabel = new Map(counted.map((c) => [c.label, c.count]));
  const definedLabels = new Set(
    field.options.map((o) => o.label.ja || o.value),
  );
  const defined = field.options.map((o) => {
    const label = o.label.ja || o.value;
    return { label, count: byLabel.get(label) ?? 0 };
  });
  // 定義に無い値（過去の版で選ばれたもの）は末尾に残す。
  const extra = counted.filter((c) => !definedLabels.has(c.label));
  return [...defined, ...extra];
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

function numberBuckets(values: number[]): CountItem[] {
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (min === max) return [{ label: String(min), count: values.length }];

  // 取りうる値が少ないなら、区間に切らずそのまま数える。5 段階評価を
  // 「1〜2.33 / 2.33〜3.67」と刻んでも読めない（実際にそう出ていた）。
  const distinct = [...new Set(values)].sort((a, b) => a - b);
  if (distinct.length <= MAX_NUMBER_BUCKETS) {
    const counts = new Map<number, number>();
    for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
    return distinct.map((v) => ({
      label: String(round(v)),
      count: counts.get(v) ?? 0,
    }));
  }

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
  options: SummaryOptions,
  /**
   * next-intl の translator。テスト等 tr を渡さない呼び出しのために任意 —
   * その場合は日本語の決め打ち文言へ倒す（呼び出し側は全て server component /
   * server action で、本番の呼び出しは必ず渡す）。
   */
  tr: Tr | undefined,
): FieldSummaryBody {
  const values = answers
    .map((a) => a[field.key])
    .filter((v) => !isBlank(v)) as FormAnswerValue[];
  const answered = values.length;

  switch (field.type) {
    case "select": {
      const counted = tally(
        values
          .filter((v): v is string => typeof v === "string")
          .map((v) => optionLabel(field, v)),
      );
      return {
        kind: "categories",
        answered,
        ...capBars(orderItems(counted, field, options)),
      };
    }

    case "multiselect": {
      // 1 回答が複数選ぶので、件数の合計は回答数を超える。
      const flat = values
        .filter((v): v is string[] => Array.isArray(v))
        .flat()
        .filter((v): v is string => typeof v === "string")
        .map((v) => optionLabel(field, v));
      return {
        kind: "categories",
        answered,
        ...capBars(orderItems(tally(flat), field, options)),
      };
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
      // 保存は文字列（form-schema の値表現）だが、取り込みや古い回答では
      // JSON の数値がそのまま入っていることがある。両方受けないと、
      // そういうフォームだけ「回答 0 件」に見える。
      // FormAnswerValue の型に number は入っていないが、実際の JSON には
      // 入りうる（form-export-core.numericAnswer に同じ注記がある）。
      const nums = values
        .filter((v) => typeof v !== "object")
        .map((v) => Number(v))
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
      // 既定は月。日別は棒が増えて傾向が読みにくいが、短期のアンケートでは
      // 日ごとに見たいことがあるので切り替えられるようにしてある。
      const cut = options.dateGrain === "day" ? 10 : 7;
      const keys = values
        .filter((v): v is string => typeof v === "string")
        .map((v) => v.slice(0, cut));
      const buckets = tally(keys).sort((a, b) =>
        a.label.localeCompare(b.label),
      );
      return { kind: "periods", answered, buckets };
    }

    case "time": {
      const hours = values
        .filter((v): v is string => typeof v === "string")
        .map((v) => {
          const hour = v.slice(0, 2);
          return tr
            ? tr("forms.formSummaryCore.hourBucket", { hour })
            : `${hour}時台`;
        });
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
        note: tr
          ? tr("forms.formSummaryCore.attachmentNote", { answered, files })
          : `${answered} 件の回答に、合計 ${files} 個のファイル`,
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
        note: tr
          ? tr("forms.formSummaryCore.tableNote", { rows, avg })
          : `合計 ${rows} 行（1 回答あたり平均 ${avg} 行）`,
      };
    }

    case "related":
      // 表示専用。集計する値を持たない。
      return { kind: "none" };

    default: {
      // text / textarea / richtext — 数えても意味が無いので棒にしない。
      // リッチテキストは ProseMirror の JSON なので、平文に落としてから拾う
      // （文字列だけを拾っていたので、リッチテキストの抜粋が常に空だった）。
      const samples = values
        .map((v) =>
          field.type === "richtext"
            ? toPlainText(v as unknown as RichTextDoc)
            : typeof v === "string"
              ? v
              : "",
        )
        .filter(Boolean)
        .slice(0, MAX_TEXT_SAMPLES);
      return { kind: "text", answered, samples };
    }
  }
}

export interface SummaryOptions {
  /** 選択肢の並び。多い順（既定）か、フォームで定義した順か。 */
  order: "count" | "definition";
  /** 日付項目のまとめ方。 */
  dateGrain: "month" | "day";
}

export const DEFAULT_SUMMARY_OPTIONS: SummaryOptions = {
  order: "count",
  dateGrain: "month",
};

export function summarizeResponses(
  fields: readonly FormFieldDef[],
  answers: readonly Record<string, FormAnswerValue>[],
  options: SummaryOptions = DEFAULT_SUMMARY_OPTIONS,
  tr?: Tr,
): FieldSummary[] {
  return fields.map((field) => ({
    key: field.key,
    label: field.label.ja || field.key,
    type: field.type,
    total: answers.length,
    body: summarizeField(field, answers, options, tr),
  }));
}

// ── グラフの寸法 ────────────────────────────────────────────────────────────
//
// 描画そのものは React（SummaryCharts）が行うが、**寸法の計算はここが持つ**。
// 工程フロー図で座標を lib/workflow-core.ts が決め、React Flow を描画層に
// 留めているのと同じ考え方 — 計算を部品の中に置くと、確かめるのに画面を
// 開かないといけなくなる。

export interface DonutArc {
  label: string;
  /** 円周に沿った長さ（stroke-dasharray の可視部分）。 */
  length: number;
  /** 始まりの位置（stroke-dashoffset に負で入れる）。 */
  offset: number;
}

/**
 * ドーナツの弧を、区分の並び順に切っていく。
 *
 * **総和が円周ちょうどになる**のは `total` が件数の合計と一致するときだけ。
 * 1 つだけ選ぶ質問（select / lookup）でしか使わないのはそのためで、複数選べる
 * 質問に使うと弧が 1 周を超えて重なる。呼び出し側がこの前提を守ること。
 */
export function donutArcs(
  items: readonly CountItem[],
  total: number,
  circumference: number,
): DonutArc[] {
  let offset = 0;
  return items.map((item) => {
    const length = total > 0 ? (item.count / total) * circumference : 0;
    const arc = { label: item.label, length, offset };
    offset += length;
    return arc;
  });
}

/** 提出の推移（回答そのものの件数。項目ではなくフォーム全体の話）。 */
export function submissionTrend(
  submittedAt: readonly (string | null)[],
  grain: "month" | "day",
): CountItem[] {
  const keys = submittedAt
    .filter((d): d is string => !!d)
    .map((d) => (grain === "day" ? d.slice(0, 10) : d.slice(0, 7)));
  return tally(keys).sort((a, b) => a.label.localeCompare(b.label));
}
