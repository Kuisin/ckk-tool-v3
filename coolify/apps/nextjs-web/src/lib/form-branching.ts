/**
 * form-branching.ts — フォーム (CM02) のセクション（複数ページ）と、
 * 回答による分岐（スキップ）の語彙・検証・評価（純ロジック）。
 *
 * 条件の語彙・評価そのものは lib/approval-conditions.ts
 * （条件付き承認フロー、MS0B）を再利用する — `FlowCondition` /
 * `evaluateCondition` / `evaluateConditions` / `matchFlowRule` は
 * `ApprovalTargetType` に依存しない純粋な形なので、ここではそのまま使う。
 * 書類種別ごとに固定された「条件へ使える属性」の一覧
 * （approvalConditionFields 相当）だけは、フォームでは項目定義が利用者ごとに
 * 動的なので `formConditionFieldOptions` として別に持つ。
 *
 * **単一の真実**: どのセクションが実際に「通った」かは
 * `computeVisitedPath` が答える。回答画面（クライアント）の次ページ計算も、
 * 提出時のサーバー検証（actions.ts submitResponse/updateResponse）も、必ず
 * この関数を呼ぶ — 片方が独自に判定すると「スキップしたのに提出時だけ
 * 必須項目扱いされる」ような食い違いが起きる。
 */

import {
  type ApprovalDocInfo,
  type ConditionOp,
  evaluateCondition,
  type FlowCondition,
  type MatchableRule,
  matchFlowRule,
  opsForType,
} from "./approval-conditions";
import type {
  FormAnswerValue,
  FormFieldDef,
  LocalizedLabel,
} from "./form-schema";
import type { Tr } from "./i18n";

/** ルールの遷移先に使う特別な値。「これ以上セクションは無い＝送信へ」。 */
export const SECTION_SUBMIT = "__submit__";

export interface FormSectionRule extends MatchableRule {
  /** セクションの key、または SECTION_SUBMIT。 */
  target: string;
}

export interface FormSectionDef {
  key: string;
  title: LocalizedLabel;
  order: number;
  /** 上から順に評価。最初に一致した 1 本の target を使う。 */
  rules: FormSectionRule[];
}

const MAX_SECTIONS = 50;
const MAX_RULES_PER_SECTION = 20;

// ─── 並び順ヘルパー ──────────────────────────────────────────────────────────

function ordered(sections: readonly FormSectionDef[]): FormSectionDef[] {
  return [...sections].sort((a, b) => a.order - b.order);
}

/** 並び順を 0..n-1 に振り直す（ドラッグ後・削除後に必ず通す。normalizeOrder と同じ役割）。 */
export function normalizeSectionOrder(
  sections: FormSectionDef[],
): FormSectionDef[] {
  return ordered(sections).map((s, i) => ({ ...s, order: i }));
}

// ─── 条件に使える項目 ────────────────────────────────────────────────────────

/**
 * ある項目が分岐条件に使えるか（select / number のみ — 承認条件と同じ制約。
 * lib/approval-conditions.ts の ConditionFieldType が number|select しか
 * 持たないため、条件式そのものを select/number 以外へ広げていない）。
 */
function isConditionableField(field: FormFieldDef): boolean {
  return field.type === "select" || field.type === "number";
}

/**
 * 指定セクションの分岐ルールで条件に使ってよい項目。まだ聞いていない
 * （このセクションより後の）項目には条件を張れない。セクション自身の項目は
 * 「このセクションに答え終わった時点」でルールを評価するので条件に使える。
 */
export function formConditionFieldOptions(
  sections: readonly FormSectionDef[],
  currentSectionKey: string,
  fields: readonly FormFieldDef[],
): FormFieldDef[] {
  const current = sections.find((s) => s.key === currentSectionKey);
  if (!current) return [];
  const sectionOrder = new Map(sections.map((s) => [s.key, s.order]));
  return fields.filter((f) => {
    if (!isConditionableField(f)) return false;
    if (!f.sectionKey) return false;
    const order = sectionOrder.get(f.sectionKey);
    return order != null && order <= current.order;
  });
}

// ─── 評価 ────────────────────────────────────────────────────────────────────

/** 回答から条件評価用の袋を作る（select/number 項目だけを写す）。 */
export function answersToConditionInfo(
  fields: readonly FormFieldDef[],
  answers: Record<string, FormAnswerValue>,
): ApprovalDocInfo {
  const info: ApprovalDocInfo = {};
  for (const field of fields) {
    if (!isConditionableField(field)) continue;
    const value = answers[field.key];
    if (value == null) {
      info[field.key] = null;
    } else if (field.type === "number" && typeof value === "string") {
      const n = Number(value);
      info[field.key] = Number.isFinite(n) ? n : null;
    } else if (field.type === "select" && typeof value === "string") {
      info[field.key] = value;
    } else {
      info[field.key] = null;
    }
  }
  return info;
}

/**
 * 次のセクションの key、または SECTION_SUBMIT。
 * ルールが 1 つも一致しなければ「並び順で次のセクション」に落ちる
 * （最後のセクションなら送信）。
 */
export function resolveNextSection(
  section: FormSectionDef,
  sections: readonly FormSectionDef[],
  fields: readonly FormFieldDef[],
  answers: Record<string, FormAnswerValue>,
): string {
  const info = answersToConditionInfo(fields, answers);
  const matched = matchFlowRule(section.rules, info);
  if (matched) return matched.target;
  const list = ordered(sections);
  const idx = list.findIndex((s) => s.key === section.key);
  const next = idx >= 0 ? list[idx + 1] : undefined;
  return next ? next.key : SECTION_SUBMIT;
}

/**
 * 実際に通ったセクションの key を順番に返す（先頭セクションから
 * SECTION_SUBMIT まで辿る）。存在しない target・循環に当たったら、
 * そこまでの経路で打ち切る（fail-safe — ここで例外や無限ループにしない。
 * 保存時の parseFormSections が本来の防波堤で、ここは実行時の保険）。
 */
export function computeVisitedPath(
  sections: readonly FormSectionDef[],
  fields: readonly FormFieldDef[],
  answers: Record<string, FormAnswerValue>,
): string[] {
  if (sections.length === 0) return [];
  const list = ordered(sections);
  const byKey = new Map(list.map((s) => [s.key, s]));
  const visited: string[] = [];
  const seen = new Set<string>();
  let current: string | undefined = list[0]?.key;
  while (current) {
    if (seen.has(current)) break; // 循環ガード
    const section = byKey.get(current);
    if (!section) break; // 参照切れガード
    seen.add(current);
    visited.push(current);
    const next = resolveNextSection(section, sections, fields, answers);
    if (next === SECTION_SUBMIT) break;
    current = next;
  }
  return visited;
}

/**
 * 実際に通った経路の項目だけを返す（検証・提出はこの部分集合にだけ効く）。
 * セクション無し（従来の 1 ページのフォーム）は常に全項目 — 挙動を変えない。
 */
export function fieldsOnPath(
  fields: readonly FormFieldDef[],
  sections: readonly FormSectionDef[],
  visitedKeys: readonly string[],
): FormFieldDef[] {
  if (sections.length === 0) return [...fields];
  const visited = new Set(visitedKeys);
  return fields.filter((f) => !f.sectionKey || visited.has(f.sectionKey));
}

// ─── 検証（保存時） ──────────────────────────────────────────────────────────

function isSelectValueValid(field: FormFieldDef, value: string): boolean {
  const options = field.options ?? [];
  return options.length === 0 || options.some((o) => o.value === value);
}

/**
 * セクション定義の検証。fields は同じ公開操作で保存される項目定義
 * （publishFormFields が両方を同時に検証する）。
 */
export function parseFormSections(
  value: unknown,
  fields: readonly FormFieldDef[],
  tr: Tr,
): { ok: true; sections: FormSectionDef[] } | { ok: false; error: string } {
  const e = (key: string, vars?: Record<string, unknown>) =>
    tr(
      `general.formBranching.${key}`,
      vars as Record<string, string | number | Date> | undefined,
    );

  if (!Array.isArray(value)) return { ok: false, error: e("invalidSections") };
  if (value.length > MAX_SECTIONS)
    return { ok: false, error: e("tooManySections", { n: MAX_SECTIONS }) };

  const fieldByKey = new Map(fields.map((f) => [f.key, f]));
  const sectionKeys = new Set<string>();
  const sections: FormSectionDef[] = [];

  for (const [index, raw] of value.entries()) {
    const no = index + 1;
    if (typeof raw !== "object" || raw == null)
      return { ok: false, error: e("sectionIndexInvalid", { no }) };
    const r = raw as Record<string, unknown>;

    const key = typeof r.key === "string" ? r.key : "";
    if (!key) return { ok: false, error: e("sectionKeyRequired", { no }) };
    if (sectionKeys.has(key))
      return { ok: false, error: e("duplicateSectionKey", { no }) };
    sectionKeys.add(key);

    const title = r.title as { ja?: unknown; en?: unknown } | undefined;
    const titleJa = typeof title?.ja === "string" ? title.ja.trim() : "";
    if (!titleJa)
      return { ok: false, error: e("sectionTitleRequired", { no }) };

    const order = typeof r.order === "number" ? r.order : index;

    const rawRules = Array.isArray(r.rules) ? r.rules : [];
    if (rawRules.length > MAX_RULES_PER_SECTION)
      return {
        ok: false,
        error: e("tooManyRules", { no, n: MAX_RULES_PER_SECTION }),
      };

    const rules: FormSectionRule[] = [];
    for (const [ruleIndex, rawRule] of rawRules.entries()) {
      const ruleNo = ruleIndex + 1;
      if (typeof rawRule !== "object" || rawRule == null)
        return { ok: false, error: e("ruleInvalid", { no, ruleNo }) };
      const rr = rawRule as Record<string, unknown>;
      const target = typeof rr.target === "string" ? rr.target : "";
      if (!target)
        return { ok: false, error: e("ruleTargetRequired", { no, ruleNo }) };

      const rawConditions = Array.isArray(rr.conditions) ? rr.conditions : [];
      const conditions: FlowCondition[] = [];
      for (const rawCond of rawConditions) {
        if (typeof rawCond !== "object" || rawCond == null)
          return { ok: false, error: e("conditionInvalid", { no, ruleNo }) };
        const rc = rawCond as Record<string, unknown>;
        const fieldKey = typeof rc.field === "string" ? rc.field : "";
        const field = fieldByKey.get(fieldKey);
        if (!field || !isConditionableField(field))
          return {
            ok: false,
            error: e("conditionFieldInvalid", { no, ruleNo }),
          };
        const op = rc.op as ConditionOp;
        const fieldType = field.type === "number" ? "number" : "select";
        if (!opsForType(fieldType).includes(op))
          return { ok: false, error: e("conditionOpInvalid", { no, ruleNo }) };
        if (fieldType === "number") {
          const n = typeof rc.value === "number" ? rc.value : Number.NaN;
          if (!Number.isFinite(n))
            return {
              ok: false,
              error: e("conditionValueInvalid", { no, ruleNo }),
            };
          conditions.push({ field: fieldKey, op, value: n });
        } else {
          const v = typeof rc.value === "string" ? rc.value : "";
          if (!v || !isSelectValueValid(field, v))
            return {
              ok: false,
              error: e("conditionValueInvalid", { no, ruleNo }),
            };
          conditions.push({ field: fieldKey, op, value: v });
        }
      }

      rules.push({
        isActive: rr.isActive !== false,
        conditions,
        target,
      });
    }

    sections.push({ key, title: { ja: titleJa, en: "" }, order, rules });
  }

  // target の参照先が実在するかは、全セクションの key が出そろってから確認する。
  for (const [index, section] of sections.entries()) {
    const no = index + 1;
    for (const rule of section.rules) {
      if (rule.target === SECTION_SUBMIT) continue;
      if (rule.target === section.key)
        return { ok: false, error: e("ruleTargetIsSelf", { no }) };
      if (!sectionKeys.has(rule.target))
        return { ok: false, error: e("ruleTargetNotFound", { no }) };
    }
  }

  return { ok: true, sections: normalizeSectionOrder(sections) };
}

/** 保存された sections（Json）を安全に読む。壊れていたら空配列。 */
export function sectionsFromJson(
  value: unknown,
  fields: readonly FormFieldDef[],
  tr: Tr,
): FormSectionDef[] {
  const parsed = parseFormSections(value, fields, tr);
  return parsed.ok ? parsed.sections : [];
}

/** 分岐ルール 1 本の要約（ビルダーの一覧表示用）。 */
export function describeSectionRule(
  rule: FormSectionRule,
  sections: readonly FormSectionDef[],
  fields: readonly FormFieldDef[],
  tr: Tr,
): string {
  const targetLabel =
    rule.target === SECTION_SUBMIT
      ? tr("general.formBranching.submitAndFinish")
      : (sections.find((s) => s.key === rule.target)?.title.ja ??
        tr("general.formBranching.unknownSection"));

  if (rule.conditions.length === 0) {
    return tr("general.formBranching.otherwiseGoTo", { target: targetLabel });
  }

  const opLabels: Record<ConditionOp, string> = {
    eq: tr("master.approvalConditions.eq"),
    ne: tr("master.approvalConditions.ne"),
    gte: tr("master.approvalConditions.gte"),
    lte: tr("master.approvalConditions.lte"),
  };
  const fieldByKey = new Map(fields.map((f) => [f.key, f]));
  const parts = rule.conditions.map((c) => {
    const field = fieldByKey.get(c.field);
    const label = field?.label.ja ?? c.field;
    if (field?.type === "select") {
      const optionLabel =
        field.options?.find((o) => o.value === String(c.value))?.label.ja ??
        String(c.value);
      return `${label} ${opLabels[c.op]} ${optionLabel}`;
    }
    return `${label} ${opLabels[c.op]} ${c.value}`;
  });
  return tr("general.formBranching.ifConditionsGoTo", {
    conditions: parts.join(tr("general.formBranching.conditionJoiner")),
    target: targetLabel,
  });
}

// re-export しておくと呼び出し側が approval-conditions を直接触らずに済む。
export { evaluateCondition, opsForType, type FlowCondition, type ConditionOp };
