/**
 * approval-conditions.ts — 条件付き承認フローの条件の語彙と評価（純ロジック）。
 *
 * 承認設定（MS0B）は書類種別ごとに 0..N 本の「ルール」を持てる
 * （approval_flow_rules）。ルール = 条件の AND リスト + 専用の段構成で、
 * 承認依頼を出す時点で書類の属性と突き合わせ、**優先順で最初に一致した
 * 1 本**の段構成を既定フローの代わりに使う。どれにも一致しなければ既定フロー。
 *
 * このファイルが唯一の定義:
 *   - 書類種別ごとに条件へ使える属性（approvalConditionFields）
 *   - 条件の形（FlowCondition）と検証（validateConditions）
 *   - 評価（evaluateConditions / matchFlowRule）
 *
 * 属性値そのものの抽出は I/O なのでここには無い —
 * lib/approvals.ts の fetchApprovalDocInfo が書類から Record を作る。
 * サーバー（依頼時の解決）と画面（MS0B の条件ビルダー・要約表示）が
 * 同じ関数を使う。
 */

import type { ApprovalTargetType } from "./approval-targets";
import {
  deliveryMethodOptions,
  designKindOptions,
  designPriorityOptions,
  designTriggerOptions,
  workOrderTypeOptions,
} from "./enum-labels";
import type { Locale } from "./i18n";

/** next-intl の `t()` と互換の最小の形（サーバー/クライアントどちらの実体も渡せる）。 */
type TrLike = (
  key: string,
  values?: Record<string, string | number | Date>,
) => string;

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

/**
 * 書類種別ごとに条件へ使える属性。key は fetchApprovalDocInfo が返す
 * Record のキーと一致していること（テストで突き合わせはできないので、
 * 追加時は両方をセットで直す）。
 *
 * ラベル・選択肢はどちらも表示言語に依存するため、呼び出し側の
 * locale（enum-labels.ts の各 xxxOptions 用）と tr（この画面固有の
 * 生ラベル用）を受け取って組み立てる。
 */
export function approvalConditionFields(
  locale: Locale,
  tr: TrLike,
): Record<ApprovalTargetType, ConditionFieldDef[]> {
  const deliveryMethodOpts = deliveryMethodOptions(locale);
  const woTypeOpts = workOrderTypeOptions(locale);
  const designTriggerOpts = designTriggerOptions(locale);
  const designKindOpts = designKindOptions(locale);
  const designPriorityOpts = designPriorityOptions(locale);

  return {
    order_acceptances: [
      {
        key: "total_amount",
        label: tr("master.approvalConditions.totalAmount"),
        type: "number",
        unit: tr("master.approvalConditions.yen"),
      },
      {
        key: "delivery_method",
        label: tr("master.approvalConditions.deliveryMethod"),
        type: "select",
        options: deliveryMethodOpts,
      },
      {
        key: "assigned_plant_id",
        label: tr("master.approvalConditions.assignedPlant"),
        type: "select",
        optionsKey: "plants",
      },
    ],
    work_orders: [
      {
        key: "type",
        label: tr("master.approvalConditions.type"),
        type: "select",
        options: woTypeOpts,
      },
      {
        key: "planned_quantity",
        label: tr("master.approvalConditions.plannedQuantity"),
        type: "number",
        unit: tr("master.approvalConditions.pcs"),
      },
    ],
    material_purchase_orders: [
      {
        key: "total_amount",
        label: tr("master.approvalConditions.totalAmount"),
        type: "number",
        unit: tr("master.approvalConditions.yen"),
      },
    ],
    purchase_requests: [
      {
        key: "item_count",
        label: tr("master.approvalConditions.lineCount"),
        type: "number",
        unit: tr("master.approvalConditions.items"),
      },
    ],
    // 設計依頼書 (SA06)。
    //   トリガー … 見積時の起票（受注前の引合）と受注時では通す相手が変わりうる
    //   依頼区分 … 新規設計は部長承認・改訂は係長だけ、といった分岐に使う
    //   優先度   … 急ぎは段を減らす、といった運用に使う
    // ⚠️ key は approvals.ts fetchApprovalDocInfo が返す Record のキーと一致必須
    // （突き合わせるテストが無いので、追加時は必ず両方を直す）。
    design_requests: [
      {
        key: "trigger",
        label: tr("master.approvalConditions.trigger"),
        type: "select",
        options: designTriggerOpts,
      },
      {
        key: "kind",
        label: tr("master.approvalConditions.requestKind"),
        type: "select",
        options: designKindOpts,
      },
      {
        key: "priority",
        label: tr("master.approvalConditions.priority"),
        type: "select",
        options: designPriorityOpts,
      },
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
        label: tr("master.approvalConditions.formKind"),
        type: "select",
        options: [
          { value: "SURVEY", label: tr("master.approvalConditions.survey") },
          {
            value: "REQUEST",
            label: tr("master.approvalConditions.requestOrReport"),
          },
        ],
      },
    ],
    work_order_flow_changes: [
      {
        key: "wo_type",
        label: tr("master.approvalConditions.workOrderType"),
        type: "select",
        options: woTypeOpts,
      },
      {
        key: "wo_planned_quantity",
        label: tr("master.approvalConditions.workOrderPlannedQuantity"),
        type: "number",
        unit: tr("master.approvalConditions.pcs"),
      },
    ],
    order_acceptance_cancel_requests: [
      {
        key: "total_amount",
        label: tr("master.approvalConditions.orderAcceptanceTotalAmount"),
        type: "number",
        unit: tr("master.approvalConditions.yen"),
      },
      {
        key: "delivery_method",
        label: tr("master.approvalConditions.orderAcceptanceDeliveryMethod"),
        type: "select",
        options: deliveryMethodOpts,
      },
    ],
  };
}

/** フィールド定義（未知のキーは undefined）。 */
export function conditionFieldDef(
  targetType: ApprovalTargetType,
  field: string,
  locale: Locale,
  tr: TrLike,
): ConditionFieldDef | undefined {
  return approvalConditionFields(locale, tr)[targetType].find(
    (f) => f.key === field,
  );
}

/** フィールド型ごとに使える演算子。 */
export function opsForType(type: ConditionFieldType): ConditionOp[] {
  return type === "number" ? ["gte", "lte", "eq", "ne"] : ["eq", "ne"];
}

export function conditionOpLabels(tr: TrLike): Record<ConditionOp, string> {
  return {
    gte: tr("master.approvalConditions.gte"),
    lte: tr("master.approvalConditions.lte"),
    eq: tr("master.approvalConditions.eq"),
    ne: tr("master.approvalConditions.ne"),
  };
}

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
  locale: Locale,
  tr: TrLike,
): string[] {
  const issues: string[] = [];
  conds.forEach((c, i) => {
    const no = i + 1;
    const def = conditionFieldDef(targetType, c.field, locale, tr);
    if (!def) {
      issues.push(tr("master.approvalConditions.invalidField", { no }));
      return;
    }
    if (!opsForType(def.type).includes(c.op)) {
      issues.push(
        tr("master.approvalConditions.invalidComparisonForField", {
          no,
          label: def.label,
        }),
      );
    }
    if (def.type === "number") {
      if (typeof c.value !== "number" || !Number.isFinite(c.value)) {
        issues.push(
          tr("master.approvalConditions.enterNumberForField", {
            no,
            label: def.label,
          }),
        );
      }
    } else if (typeof c.value !== "string" || c.value === "") {
      issues.push(
        tr("master.approvalConditions.selectValueForField", {
          no,
          label: def.label,
        }),
      );
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
  locale: Locale,
  tr: TrLike,
  dynamicOptions?: Partial<
    Record<"plants", { value: string; label: string }[]>
  >,
): string {
  if (conds.length === 0) return tr("master.approvalConditions.noConditions");
  const opLabels = conditionOpLabels(tr);
  return conds
    .map((c) => {
      const def = conditionFieldDef(targetType, c.field, locale, tr);
      if (!def) return `${c.field} ${c.op} ${c.value}`;
      if (def.type === "number") {
        const num = Number(c.value);
        const formatted = Number.isFinite(num)
          ? num.toLocaleString("ja-JP")
          : String(c.value);
        return tr("master.approvalConditions.numberConditionSummary", {
          label: def.label,
          value: `${formatted}${def.unit ?? ""}`,
          op: opLabels[c.op],
        });
      }
      const options =
        def.options ??
        (def.optionsKey ? (dynamicOptions?.[def.optionsKey] ?? []) : []);
      const optionLabel =
        options.find((o) => o.value === String(c.value))?.label ??
        String(c.value);
      return tr("master.approvalConditions.selectConditionSummary", {
        label: def.label,
        value: optionLabel,
        op: opLabels[c.op],
      });
    })
    .join(tr("master.approvalConditions.conditionJoiner"));
}
