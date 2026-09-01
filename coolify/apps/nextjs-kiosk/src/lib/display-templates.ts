/**
 * display-templates.ts — ディスプレイに映せる画面（テンプレート）の登録簿。
 *
 * **画面を増やす作業を「1 エントリ + 1 ページ」に閉じる**のがこのファイルの目的。
 * 選べる設定（options）を宣言で持つので、管理画面のフォームは自動で組み立たり、
 * 保存時の検証も同じ宣言から作られる。テンプレートごとにフォームを書くと、
 * 増やすたびに 3 か所（型・フォーム・検証）を揃える作業が発生して必ずずれる。
 *
 * **設定は「選ぶだけ」に留める。** 壁の画面の設定を頼まれる人は、たいてい
 * 現場の管理者で、JSON も式も書かない。数を絞った選択肢・数値・スイッチだけで
 * 表現できないものは、テンプレートを分けるほうがよい。
 *
 * ★ **nextjs-kiosk との twin file**（逐語コピー）。原本はこちら（nextjs-web）で、
 *   `pnpm twin:sync` で複製する。管理画面が保存する形とディスプレイが読む形が
 *   食い違うと「保存はできるのに何も映らない」という最も原因の分かりにくい
 *   壊れ方をするので、1 バイトのずれも twin-files.test.ts で落とす。
 */

import { z } from "zod";

// ─── 設定項目の宣言 ─────────────────────────────────────────────────────────

export type DisplayOptionSpec =
  /** 拠点を 1 つ選ぶ。未選択 = そのディスプレイの拠点を使う。 */
  | { key: string; kind: "plant"; label: string; help?: string }
  | {
      key: string;
      kind: "number";
      label: string;
      min: number;
      max: number;
      default: number;
      suffix?: string;
      help?: string;
    }
  | {
      key: string;
      kind: "select";
      label: string;
      choices: ReadonlyArray<{ value: string; label: string }>;
      default: string;
      help?: string;
    }
  | {
      key: string;
      kind: "boolean";
      label: string;
      default: boolean;
      help?: string;
    }
  | {
      key: string;
      kind: "text";
      label: string;
      default: string;
      multiline?: boolean;
      maxLength: number;
      placeholder?: string;
      help?: string;
    };

export interface DisplayTemplate {
  /** content_config.page に入る値。ページの URL でもある。 */
  key: string;
  label: string;
  /** 管理画面で「どれを選べばよいか」を判断するための 1 行。 */
  description: string;
  options: readonly DisplayOptionSpec[];
}

// ─── よく使う設定（同じものを書き写さない） ─────────────────────────────────

const PLANT_OPTION: DisplayOptionSpec = {
  key: "plantId",
  kind: "plant",
  label: "拠点で絞る",
  // **未選択 = 全拠点。** 以前はこの画面が置かれている拠点へ落としていたが、
  // 空にした人が見たいのは全社の状況で、置き場所ではない。空欄が「全部」
  // ではなく「ここだけ」になっていると、絞っていないつもりの画面に一部しか
  // 出ず、しかもその理由が画面から読み取れない。
  help: "選ばないと、すべての拠点を出します",
};

const rowsOption = (
  defaultRows: number,
  help = "画面に収まらない分は自動でページ送りします",
): DisplayOptionSpec => ({
  key: "rows",
  kind: "number",
  label: "1 画面に出す件数",
  min: 3,
  max: 20,
  default: defaultRows,
  suffix: "件",
  help,
});

const daysOption = (defaultDays: number, label: string): DisplayOptionSpec => ({
  key: "days",
  kind: "number",
  label,
  min: 1,
  max: 60,
  default: defaultDays,
  suffix: "日",
});

// ─── テンプレート ───────────────────────────────────────────────────────────

export const DISPLAY_TEMPLATES: readonly DisplayTemplate[] = [
  {
    key: "production",
    label: "生産状況",
    description:
      "進行中の指示書を、いま流れている工程と担当者つきで並べます。ライン脇の定番。",
    options: [
      PLANT_OPTION,
      rowsOption(8),
      {
        key: "includePending",
        kind: "boolean",
        label: "着手前の指示書も出す",
        default: true,
        help: "切ると、いま作業中のものだけになります",
      },
    ],
  },
  {
    key: "pending",
    label: "未処理・手配待ち",
    description:
      "まだ指示書が出ていない注文明細を、納期の近い順に並べます。手配漏れに気づくための画面。",
    options: [
      PLANT_OPTION,
      rowsOption(8),
      daysOption(14, "何日先の納期まで出すか"),
      {
        key: "overdueOnly",
        kind: "boolean",
        label: "納期を過ぎたものだけ出す",
        default: false,
      },
    ],
  },
  {
    key: "shipping",
    label: "出荷予定",
    description: "これから出す出荷書を並べます。出荷場の壁向け。",
    options: [PLANT_OPTION, rowsOption(8), daysOption(7, "何日先まで出すか")],
  },
  {
    key: "quality",
    label: "品質・不良",
    description:
      "直近の不良記録を、種類ごとの件数とともに出します。朝礼で使う想定。",
    options: [
      PLANT_OPTION,
      rowsOption(8),
      daysOption(7, "何日前までを集計するか"),
    ],
  },
  {
    key: "announcement",
    label: "お知らせ",
    description:
      "決めた文章を大きく映します。安全喚起や連絡事項に。データは使いません。",
    options: [
      {
        key: "message",
        kind: "text",
        label: "本文",
        default: "",
        multiline: true,
        maxLength: 400,
        placeholder: "例: 本日 15:00 より 安全点検を行います",
      },
      {
        key: "level",
        kind: "select",
        label: "見た目",
        choices: [
          { value: "info", label: "通常（青）" },
          { value: "warn", label: "注意（黄）" },
          { value: "alert", label: "警告（赤）" },
        ],
        default: "info",
      },
      {
        key: "showClock",
        kind: "boolean",
        label: "時計を出す",
        default: true,
      },
    ],
  },
] as const;

export type DisplayTemplateKey = (typeof DISPLAY_TEMPLATES)[number]["key"];

export function findDisplayTemplate(
  key: string | undefined | null,
): DisplayTemplate | undefined {
  return DISPLAY_TEMPLATES.find((t) => t.key === key);
}

export const DISPLAY_TEMPLATE_KEYS: readonly string[] = DISPLAY_TEMPLATES.map(
  (t) => t.key,
);

// ─── 設定値の検証（宣言から組み立てる） ─────────────────────────────────────

/**
 * 1 項目ぶんの zod。
 *
 * **どの項目も `.catch(既定値)` で閉じる**（未入力・型違い・範囲外をすべて
 * 既定値に倒す）。設定の 1 つがおかしいだけで保存そのものを失敗させると、
 * 管理者は原因の分からないエラーと向き合うことになる。壁の画面の設定で
 * それをやる価値は無い — 直したい値だけ直せて、残りは既定に戻るほうがよい。
 */
function optionSchema(spec: DisplayOptionSpec): z.ZodTypeAny {
  switch (spec.kind) {
    case "plant":
      // 「未選択」を null に寄せる（"" と undefined を持ち回らない）
      return z.number().int().positive().nullable().default(null).catch(null);
    case "number":
      return z.number().int().min(spec.min).max(spec.max).catch(spec.default);
    case "select":
      return z
        .enum(spec.choices.map((c) => c.value) as [string, ...string[]])
        .catch(spec.default);
    case "boolean":
      return z.boolean().catch(spec.default);
    case "text":
      return z.string().max(spec.maxLength).catch(spec.default);
  }
}

/** テンプレート 1 つぶんの設定オブジェクトの zod。 */
export function templateOptionsSchema(template: DisplayTemplate) {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const spec of template.options) {
    shape[spec.key] = optionSchema(spec);
  }
  // 知らないキーは落とす（テンプレートを付け替えたときに前の設定が残らない）
  return z.object(shape).strip();
}

export type DisplayTemplateOptions = Record<string, unknown>;

/** 既定値だけのオブジェクト。新規作成のフォーム初期値に使う。 */
export function defaultTemplateOptions(
  template: DisplayTemplate,
): DisplayTemplateOptions {
  const out: DisplayTemplateOptions = {};
  for (const spec of template.options) {
    out[spec.key] = spec.kind === "plant" ? null : spec.default;
  }
  return out;
}

// ─── 描画側の読み取り（型を持ち回らずに済む小さな取り出し） ─────────────────
//
// options は検証済みなので、ここでは「想定と違えば既定値」に倒すだけでよい。
// ページ側が as でキャストして回るより、この 4 つを通すほうが事故が少ない。

export function optionNumber(
  options: DisplayTemplateOptions,
  key: string,
  fallback: number,
): number {
  const v = options[key];
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

export function optionBoolean(
  options: DisplayTemplateOptions,
  key: string,
  fallback: boolean,
): boolean {
  const v = options[key];
  return typeof v === "boolean" ? v : fallback;
}

export function optionString(
  options: DisplayTemplateOptions,
  key: string,
  fallback: string,
): string {
  const v = options[key];
  return typeof v === "string" ? v : fallback;
}

/** 拠点は「未選択 = null」。0 や NaN は未選択として扱う。 */
export function optionPlantId(
  options: DisplayTemplateOptions,
  key = "plantId",
): number | null {
  const v = options[key];
  return typeof v === "number" && Number.isInteger(v) && v > 0 ? v : null;
}
