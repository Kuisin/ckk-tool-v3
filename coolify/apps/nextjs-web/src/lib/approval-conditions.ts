/**
 * approval-conditions.ts — 条件付き承認フローの条件の語彙と評価（純ロジック）。
 *
 * 承認設定（MS0B）は書類種別ごとに 0..N 本の「ルール」を持てる
 * （approval_flow_rules）。ルール = 条件の AND リスト + 専用の段構成で、
 * 承認依頼を出す時点で書類の属性と突き合わせ、**優先順で最初に一致した
 * 1 本**の段構成を既定フローの代わりに使う。どれにも一致しなければ既定フロー。
 *
 * このファイルが唯一の定義:
 *   - 書類種別ごとに条件へ使える属性（APPROVAL_CONDITION_FIELDS）
 *   - 条件の形（FlowCondition）と検証（validateConditions）
 *   - 評価（evaluateConditions / matchFlowRule）
 *
 * 属性値そのものの抽出は I/O なのでここには無い —
 * lib/approvals.ts の fetchApprovalDocInfo が書類から Record を作る。
 * サーバー（依頼時の解決）と画面（MS0B の条件ビルダー・要約表示）が
 * 同じ関数を使う。
 */

import type { ApprovalTargetType } from "./approval-targets";

/** 条件の比較演算子。number は全部、select は eq / ne のみ。 */
export type ConditionOp = "eq" | "ne" | "gte" | "lte";

/** 条件 1 件。value は number フィールドなら数値、select なら選択肢の値。 */
export interface FlowCondition {
  field: string;
  op: ConditionOp;
  value: string | number;
}

export type ConditionFieldType = "number" | "select";

export interface ConditionFieldDef {
  key: string;
  label: string;
  type: ConditionFieldType;
  /** select の静的選択肢。動的な選択肢は optionsKey で画面側が解決する。 */
  options?: { value: string; label: string }[];
  /** 動的選択肢のソース（画面が dynamicOptions[optionsKey] を渡す）。 */
  optionsKey?: "plants";
  /** number の単位表示（円 / 本 / 件）。 */
  unit?: string;
}

const DELIVERY_METHOD_OPTIONS = [
  { value: "NORMAL", label: "通常配送" },
  { value: "DIRECT_TO_USER", label: "ユーザー直送" },
];

const WO_TYPE_OPTIONS = [
  { value: "MANUFACTURE", label: "製造分" },
  { value: "FROM_STOCK", label: "在庫分" },
];

/**
 * 書類種別ごとに条件へ使える属性。key は fetchApprovalDocInfo が返す
 * Record のキーと一致していること（テストで突き合わせはできないので、
 * 追加時は両方をセットで直す）。
 */
export const APPROVAL_CONDITION_FIELDS: Record<
  ApprovalTargetType,
  ConditionFieldDef[]
> = {
  order_acceptances: [
    { key: "total_amount", label: "合計金額", type: "number", unit: "円" },
    {
      key: "delivery_method",
      label: "配送方法",
      type: "select",
      options: DELIVERY_METHOD_OPTIONS,
    },
    {
      key: "assigned_plant_id",
      label: "担当拠点",
      type: "select",
      optionsKey: "plants",
    },
  ],
  work_orders: [
    { key: "type", label: "種別", type: "select", options: WO_TYPE_OPTIONS },
    { key: "planned_quantity", label: "予定数量", type: "number", unit: "本" },
  ],
  material_purchase_orders: [
    { key: "total_amount", label: "合計金額", type: "number", unit: "円" },
  ],
  purchase_requests: [
    { key: "item_count", label: "明細数", type: "number", unit: "件" },
  ],
  // 社内文書 (CM03) の公開承認。条件で分ける軸が今のところ無いので空
  // （空 = 条件分岐なし。既定フローだけが使われる）。フォルダや文書の重要度で
  // 分けたくなったらここに足す。
  internal_pages: [],
  // フォーム申請 (CM02)。どのフォームの申請かで承認者を変えたい、が一番効くので
  // フォーム種別を出す。フォームは利用者が随時作るため、フォームそのものを
  // 選択肢にすると条件が壊れやすい（削除・改名）ので v1 では出さない。
  form_responses: [
    {
      key: "form_kind",
      label: "フォームの種類",
      type: "select",
      options: [
        { value: "SURVEY", label: "アンケート" },
        { value: "REQUEST", label: "申請・報告" },
      ],
    },
  ],
  work_order_flow_changes: [
    {
      key: "wo_type",
      label: "指示書の種別",
      type: "select",
      options: WO_TYPE_OPTIONS,
    },
    {
      key: "wo_planned_quantity",
      label: "指示書の予定数量",
      type: "number",
      unit: "本",
    },
  ],
  order_acceptance_cancel_requests: [
    {
      key: "total_amount",
      label: "注文請書の合計金額",
      type: "number",
      unit: "円",
    },
    {
      key: "delivery_method",
      label: "注文請書の配送方法",
      type: "select",
      options: DELIVERY_METHOD_OPTIONS,
    },
  ],
};

/** フィールド定義（未知のキーは undefined）。 */
export function conditionFieldDef(
  targetType: ApprovalTargetType,
  field: string,
): ConditionFieldDef | undefined {
  return APPROVAL_CONDITION_FIELDS[targetType].find((f) => f.key === field);
}

/** フィールド型ごとに使える演算子。 */
export function opsForType(type: ConditionFieldType): ConditionOp[] {
  return type === "number" ? ["gte", "lte", "eq", "ne"] : ["eq", "ne"];
}

export const CONDITION_OP_LABEL: Record<ConditionOp, string> = {
  gte: "以上",
  lte: "以下",
  eq: "に等しい",
  ne: "に等しくない",
};

/** 書類から抽出した属性値の袋（fetchApprovalDocInfo の戻り）。 */
export type ApprovalDocInfo = Record<string, string | number | null>;

/**
 * 条件 1 件の評価。属性が無い / null / 型が合わないときは**不一致**
 * （fail-safe — 情報が読めない書類に特別フローを当てない）。
 */
export function evaluateCondition(
  cond: FlowCondition,
  info: ApprovalDocInfo,
): boolean {
  const raw = info[cond.field];
  if (raw == null) return false;
  switch (cond.op) {
    case "gte":
    case "lte": {
      const actual = Number(raw);
      const expected = Number(cond.value);
      if (!Number.isFinite(actual) || !Number.isFinite(expected)) return false;
      return cond.op === "gte" ? actual >= expected : actual <= expected;
    }
    case "eq":
      return String(raw) === String(cond.value);
    case "ne":
      return String(raw) !== String(cond.value);
  }
}

/** 条件リスト（AND）の評価。空 = 常に一致（キャッチオール）。 */
export function evaluateConditions(
  conds: readonly FlowCondition[],
  info: ApprovalDocInfo,
): boolean {
  return conds.every((c) => evaluateCondition(c, info));
}

/** ルールの最小形（評価に要る部分だけ）。 */
export interface MatchableRule {
  isActive: boolean;
  conditions: readonly FlowCondition[];
}

/**
 * 優先順（呼び出し側が priority 昇順で渡す）で最初に一致した有効ルール。
 * どれにも一致しなければ null（= 既定フローを使う）。
 */
export function matchFlowRule<R extends MatchableRule>(
  rules: readonly R[],
  info: ApprovalDocInfo,
): R | null {
  for (const rule of rules) {
    if (!rule.isActive) continue;
    if (evaluateConditions(rule.conditions, info)) return rule;
  }
  return null;
}

/** conditions Json（DB の値）を安全に読む。壊れた要素は捨てる。 */
export function conditionsFromJson(json: unknown): FlowCondition[] {
  if (!Array.isArray(json)) return [];
  return json.filter(
    (c): c is FlowCondition =>
      c != null &&
      typeof c === "object" &&
      typeof (c as FlowCondition).field === "string" &&
      ["eq", "ne", "gte", "lte"].includes((c as FlowCondition).op) &&
      (typeof (c as FlowCondition).value === "string" ||
        typeof (c as FlowCondition).value === "number"),
  );
}

/**
 * 条件リストの検証（保存前）。エラー文言の配列（空 = OK）。
 * 画面はボタンを止めるために、Server Action は保存を弾くために同じものを使う。
 */
export function validateConditions(
  targetType: ApprovalTargetType,
  conds: readonly FlowCondition[],
): string[] {
  const issues: string[] = [];
  conds.forEach((c, i) => {
    const no = i + 1;
    const def = conditionFieldDef(targetType, c.field);
    if (!def) {
      issues.push(`条件 ${no}: 項目が不正です`);
      return;
    }
    if (!opsForType(def.type).includes(c.op)) {
      issues.push(`条件 ${no}: ${def.label}に使えない比較です`);
    }
    if (def.type === "number") {
      if (typeof c.value !== "number" || !Number.isFinite(c.value)) {
        issues.push(`条件 ${no}: ${def.label}の値を数値で入力してください`);
      }
    } else if (typeof c.value !== "string" || c.value === "") {
      issues.push(`条件 ${no}: ${def.label}の値を選択してください`);
    }
  });
  return issues;
}

/**
 * 条件の人が読む要約（MS0B の一覧・確認表示用）。
 * 動的選択肢（拠点など）のラベルは dynamicOptions から引く。
 */
export function describeConditions(
  targetType: ApprovalTargetType,
  conds: readonly FlowCondition[],
  dynamicOptions?: Partial<
    Record<"plants", { value: string; label: string }[]>
  >,
): string {
  if (conds.length === 0) return "条件なし（すべての書類に一致）";
  return conds
    .map((c) => {
      const def = conditionFieldDef(targetType, c.field);
      if (!def) return `${c.field} ${c.op} ${c.value}`;
      if (def.type === "number") {
        const num = Number(c.value);
        const formatted = Number.isFinite(num)
          ? num.toLocaleString("ja-JP")
          : String(c.value);
        return `${def.label}が ${formatted}${def.unit ?? ""} ${CONDITION_OP_LABEL[c.op]}`;
      }
      const options =
        def.options ??
        (def.optionsKey ? (dynamicOptions?.[def.optionsKey] ?? []) : []);
      const optionLabel =
        options.find((o) => o.value === String(c.value))?.label ??
        String(c.value);
      return `${def.label}が「${optionLabel}」${CONDITION_OP_LABEL[c.op]}`;
    })
    .join(" かつ ");
}
