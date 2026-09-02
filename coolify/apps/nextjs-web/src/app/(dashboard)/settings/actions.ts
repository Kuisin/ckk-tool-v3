"use server";

/**
 * Server Actions — システム設定（価格試算 価格ポリシー）.
 *
 * app.system_settings の trial_pricing.* キーを一括 upsert する。
 * 読み出しは lib/system-settings.ts（Server Component から）。
 */

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { recordAudit } from "@/lib/audit";
import { checkPermission } from "@/lib/authz";
import { prisma } from "@/lib/db";
import {
  getProductItemDefs,
  getProductTypes,
  saveProductItemDefs,
  saveProductTypes,
} from "@/lib/product-settings";
import {
  IDENTIFIER,
  type ProductItemDef,
  type ProductType,
  productItemDefsArraySchema,
  productTypesArraySchema,
} from "@/lib/product-types";
import {
  type ActionResult,
  actionError,
  actionOk,
  prismaErrorMessage,
} from "@/lib/server-action";
import {
  getTrialPricingSettings,
  saveTrialPricingSettings,
} from "@/lib/system-settings";
import type { ToolType } from "@/lib/trial-pricing";
import {
  type Criterion,
  criterionAppliesTo,
  criterionSchema,
  customInputDefSchema,
  type LookupTable,
  lookupCompositeKey,
  lookupTableSchema,
  lookupTablesArraySchema,
  RESERVED_KEYS,
  TOOL_TYPE_VALUE,
  type ToolTypeDef,
} from "@/lib/trial-pricing-criteria";
import { checkExpressionSyntax } from "@/lib/trial-pricing-engine";
import type { TrialPricingSettings } from "@/lib/trial-pricing-settings";

// 計算基準（criteria）は SY02 メインのリスト + 個別編集ページから
// `updateCriteria` で保存する。スカラー設定は下の settingsInput（criteria を
// 含まない）で保存し、criteria は現状 DB 値を維持する（相互のクロバー防止）。
function settingsInputSchema(tr: Awaited<ReturnType<typeof getTranslations>>) {
  return z.object({
    materialPriceBasis: z.enum(["MAX", "LATEST", "AVERAGE"]),
    materialPriceLookbackMonths: z.number().int().min(1).max(36),
    defaultMaterialPrice: z.number().min(0),
    customInputs: z.array(customInputDefSchema(tr)),
  });
}

function criteriaInputSchema(tr: Awaited<ReturnType<typeof getTranslations>>) {
  return z.array(criterionSchema(tr));
}

/**
 * 計算基準の検証 — 壊れた式や不正な構成が全ユーザーの価格試算を止めないよう、
 * 保存時に弾く。工具種（管理者定義リスト）ごとに有効な final がちょうど
 * 1つであること。
 */
function validateCriteria(
  criteria: Criterion[],
  toolTypes: ToolTypeDef[],
  tr: Awaited<ReturnType<typeof getTranslations>>,
): string | null {
  const enabled = criteria.filter((c) => c.enabled);
  for (const c of enabled) {
    const err = checkExpressionSyntax(c.expression);
    if (err)
      return tr("settings.trialPricingActions.criterionSyntaxError", {
        name: c.name,
        error: err,
      });
  }
  for (const tt of toolTypes) {
    const finals = enabled.filter(
      (c) => c.role === "final" && criterionAppliesTo(c, tt.value),
    );
    if (finals.length !== 1) {
      return tr("settings.trialPricingActions.exactlyOneFinalRequired", {
        label: tt.label,
      });
    }
  }
  return null;
}

/** スカラー設定・カスタム入力・カスタム計算 JS を保存（criteria は不変）。 */
export async function updateTrialPricingSettings(
  payload: TrialPricingSettings,
): Promise<ActionResult> {
  const tr = await getTranslations();
  const authz = await checkPermission("system", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  const parsed = settingsInputSchema(tr).safeParse(payload);
  if (!parsed.success) {
    return actionError(
      parsed.error.issues[0]?.message ?? tr("common.invalidInput"),
    );
  }
  // カスタム入力キー — 予約語衝突・重複を弾く。
  const seenKeys = new Set<string>();
  for (const d of parsed.data.customInputs) {
    if (RESERVED_KEYS.has(d.key)) {
      return actionError(
        tr("settings.trialPricingActions.customInputKeyReserved", {
          key: d.key,
        }),
      );
    }
    if (seenKeys.has(d.key)) {
      return actionError(
        tr("settings.trialPricingActions.customInputKeyDuplicate", {
          key: d.key,
        }),
      );
    }
    seenKeys.add(d.key);
  }
  try {
    const before = await getTrialPricingSettings();
    // criteria は現状 DB 値を維持（criteria の保存は updateCriteria が担当）。
    await saveTrialPricingSettings({ ...before, ...parsed.data });
    await recordAudit({
      action: "UPDATE",
      tableName: "system_settings",
      recordId: "trial_pricing",
      before: { ...before },
      after: { ...before, ...parsed.data },
    });
    revalidatePath("/settings");
    revalidatePath("/sales/trial-estimates");
    return actionOk();
  } catch (e) {
    return actionError(
      prismaErrorMessage(
        e,
        tr("settings.trialPricingActions.settingsSaveFailed"),
        tr,
      ),
    );
  }
}

/** 計算基準（criteria）のみを保存（リスト操作・個別編集ページから）。 */
export async function updateCriteria(
  criteria: Criterion[],
): Promise<ActionResult> {
  const tr = await getTranslations();
  const authz = await checkPermission("system", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  const parsed = criteriaInputSchema(tr).safeParse(criteria);
  if (!parsed.success) {
    return actionError(
      parsed.error.issues[0]?.message ??
        tr("settings.trialPricingActions.invalidCriteria"),
    );
  }
  try {
    const before = await getTrialPricingSettings();
    const invalid = validateCriteria(parsed.data, before.toolTypes, tr);
    if (invalid) return actionError(invalid);
    await saveTrialPricingSettings({ ...before, criteria: parsed.data });
    await recordAudit({
      action: "UPDATE",
      tableName: "system_settings",
      recordId: "trial_pricing.criteria",
      before: { criteria: before.criteria },
      after: { criteria: parsed.data },
    });
    revalidatePath("/settings/trial-pricing-engine");
    revalidatePath("/sales/trial-estimates");
    return actionOk();
  } catch (e) {
    return actionError(
      prismaErrorMessage(
        e,
        tr("settings.trialPricingActions.criteriaSaveFailed"),
        tr,
      ),
    );
  }
}

// ── 工具種（SY02 工具種管理） ────────────────────────────────────────────────

function addToolTypeInputSchema(
  tr: Awaited<ReturnType<typeof getTranslations>>,
) {
  return z.object({
    value: z
      .string()
      .regex(
        TOOL_TYPE_VALUE,
        tr("settings.toolTypesPanel.useUppercaseLettersDigitsAndStarting"),
      ),
    label: z
      .string()
      .min(1, tr("settings.trialPricingActions.enterDisplayName")),
  });
}

/** 工具種・計算基準を保存 + 監査 + 再検証パスの共通処理。 */
async function persistToolTypes(
  next: { toolTypes: ToolTypeDef[]; criteria: Criterion[] },
  before: TrialPricingSettings,
  tr: Awaited<ReturnType<typeof getTranslations>>,
): Promise<ActionResult> {
  const invalid = validateCriteria(next.criteria, next.toolTypes, tr);
  if (invalid) return actionError(invalid);
  try {
    await saveTrialPricingSettings({ ...before, ...next });
    await recordAudit({
      action: "UPDATE",
      tableName: "system_settings",
      recordId: "trial_pricing.tool_types",
      before: { toolTypes: before.toolTypes, criteria: before.criteria },
      after: next,
    });
    revalidatePath("/settings/trial-pricing-engine");
    revalidatePath("/settings/trial-pricing-engine/tool-types");
    revalidatePath("/sales/trial-estimates");
    return actionOk();
  } catch (e) {
    return actionError(
      prismaErrorMessage(
        e,
        tr("settings.trialPricingActions.toolTypeSaveFailed"),
        tr,
      ),
    );
  }
}

/**
 * 工具種を追加。既存の「全工具種適用」基準（toolTypes 未指定 or 全種を含む）
 * は新種にも適用される。final が1つも適用されない場合は最初の有効 final を
 * 自動適用し、「種ごとに final ちょうど1つ」の不変条件を保つ。
 */
export async function addToolType(payload: {
  value: string;
  label: string;
}): Promise<ActionResult> {
  const tr = await getTranslations();
  const authz = await checkPermission("system", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  const parsed = addToolTypeInputSchema(tr).safeParse(payload);
  if (!parsed.success) {
    return actionError(
      parsed.error.issues[0]?.message ?? tr("common.invalidInput"),
    );
  }
  const { value, label } = parsed.data;
  const before = await getTrialPricingSettings();
  if (before.toolTypes.some((t) => t.value === value)) {
    return actionError(
      tr("settings.trialPricingActions.toolTypeAlreadyExists", { value }),
    );
  }
  const existingValues = before.toolTypes.map((t) => t.value);
  const maxOrder = Math.max(0, ...before.toolTypes.map((t) => t.order));
  const toolTypes: ToolTypeDef[] = [
    ...before.toolTypes,
    { value, label, order: maxOrder + 10, builtin: false },
  ];
  // 全種に適用中の基準は新種にも適用（明示リストの場合のみ追記が必要）。
  let criteria = before.criteria.map((c) =>
    c.toolTypes && existingValues.every((v) => c.toolTypes?.includes(v))
      ? { ...c, toolTypes: [...c.toolTypes, value] }
      : c,
  );
  // final が適用されない場合は最初の有効 final を適用（不変条件の維持）。
  const hasFinal = criteria.some(
    (c) => c.enabled && c.role === "final" && criterionAppliesTo(c, value),
  );
  if (!hasFinal) {
    const firstFinal = criteria
      .filter((c) => c.enabled && c.role === "final")
      .sort((a, b) => a.order - b.order)[0];
    if (!firstFinal) {
      return actionError(
        tr("settings.trialPricingActions.noFinalCriterionAvailable"),
      );
    }
    criteria = criteria.map((c) =>
      c.id === firstFinal.id
        ? { ...c, toolTypes: [...(c.toolTypes ?? existingValues), value] }
        : c,
    );
  }
  return persistToolTypes({ toolTypes, criteria }, before, tr);
}

/**
 * 工具種を削除。組み込み種は不可。価格試算（estimates）で使用中の種も不可
 * （未使用のみ削除可）。削除時は各基準の適用工具種からも取り除く。
 */
export async function removeToolType(value: ToolType): Promise<ActionResult> {
  const tr = await getTranslations();
  const authz = await checkPermission("system", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  const before = await getTrialPricingSettings();
  const def = before.toolTypes.find((t) => t.value === value);
  if (!def)
    return actionError(tr("settings.trialPricingActions.toolTypeNotFound"));
  if (def.builtin) {
    return actionError(
      tr("settings.trialPricingActions.builtinToolTypeCannotBeDeleted", {
        label: def.label,
      }),
    );
  }
  try {
    const used = await prisma.estimate.count({ where: { toolType: value } });
    if (used > 0) {
      return actionError(
        tr("settings.trialPricingActions.toolTypeInUse", {
          label: def.label,
          count: used,
        }),
      );
    }
  } catch (e) {
    return actionError(
      prismaErrorMessage(
        e,
        tr("settings.trialPricingActions.usageCheckFailed"),
        tr,
      ),
    );
  }
  const toolTypes = before.toolTypes.filter((t) => t.value !== value);
  const criteria = before.criteria.map((c) =>
    c.toolTypes?.includes(value)
      ? { ...c, toolTypes: c.toolTypes.filter((v) => v !== value) }
      : c,
  );
  return persistToolTypes({ toolTypes, criteria }, before, tr);
}

/**
 * 工具種ごとの適用基準の割り当て（工具種管理ページから）。
 * criterionIds = この種に適用する component/intermediate 基準、
 * finalId = この種の見積単価（final）基準。各基準の適用工具種
 * （toolTypes）のメンバーシップとして書き戻す。undefined（全種適用）の
 * 基準は現在の全種リストへ実体化してから編集する。
 */
export async function updateToolTypeAssignments(payload: {
  value: ToolType;
  criterionIds: string[];
  finalId: string;
}): Promise<ActionResult> {
  const tr = await getTranslations();
  const authz = await checkPermission("system", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  const { value, criterionIds, finalId } = payload;
  const before = await getTrialPricingSettings();
  if (!before.toolTypes.some((t) => t.value === value)) {
    return actionError(tr("settings.trialPricingActions.toolTypeNotFound"));
  }
  const allValues = before.toolTypes.map((t) => t.value);
  const wanted = new Set(criterionIds);
  const criteria = before.criteria.map((c) => {
    // undefined = 全種適用 → 現在の全種リストへ実体化してから編集する。
    const materialized = c.toolTypes ?? allValues;
    const include = c.role === "final" ? c.id === finalId : wanted.has(c.id);
    const next = include
      ? materialized.includes(value)
        ? materialized
        : [...materialized, value]
      : materialized.filter((v) => v !== value);
    return { ...c, toolTypes: next };
  });
  return persistToolTypes(
    { toolTypes: before.toolTypes, criteria },
    before,
    tr,
  );
}

/** ルックアップ表を保存（表名の一意性を検証）。 */
/** ID の一意性・キー列名の一意性・行のキー数一致/一意/数値型を検証。 */
function validateLookupTables(
  tables: LookupTable[],
  tr: Awaited<ReturnType<typeof getTranslations>>,
): string | null {
  const ids = new Set<string>();
  for (const t of tables) {
    const label = t.name?.ja || t.id;
    if (ids.has(t.id))
      return tr("settings.trialPricingActions.duplicateId", { id: t.id });
    ids.add(t.id);
    const colSet = new Set(t.keyColumns);
    if (colSet.size !== t.keyColumns.length)
      return tr("settings.trialPricingActions.duplicateKeyColumns", { label });
    const combos = new Set<string>();
    for (const r of t.rows) {
      if (r.keys.length !== t.keyColumns.length)
        return tr("settings.trialPricingActions.keyCountMismatch", { label });
      const combo = lookupCompositeKey(r.keys);
      if (combos.has(combo))
        return tr("settings.trialPricingActions.duplicateKeyCombination", {
          label,
          keys: r.keys.join(" / "),
        });
      combos.add(combo);
      if (
        t.valueType === "number" &&
        r.value.trim() !== "" &&
        !Number.isFinite(Number(r.value))
      )
        return tr("settings.trialPricingActions.valueNotNumeric", {
          label,
          value: r.value,
        });
    }
  }
  return null;
}

/** ルックアップ表を保存（監査 + 再検証）。呼び出し前に検証済みの配列を渡す。 */
async function persistLookupTables(
  next: LookupTable[],
  before: TrialPricingSettings,
  tr: Awaited<ReturnType<typeof getTranslations>>,
): Promise<ActionResult> {
  try {
    await saveTrialPricingSettings({ ...before, lookupTables: next });
    await recordAudit({
      action: "UPDATE",
      tableName: "system_settings",
      recordId: "trial_pricing.lookup_tables",
      before: { lookupTables: before.lookupTables },
      after: { lookupTables: next },
    });
    revalidatePath("/settings/trial-pricing-engine");
    revalidatePath("/settings/trial-pricing-engine/lookups");
    revalidatePath("/sales/trial-estimates");
    return actionOk();
  } catch (e) {
    return actionError(
      prismaErrorMessage(
        e,
        tr("settings.trialPricingActions.lookupTableSaveFailed"),
        tr,
      ),
    );
  }
}

export async function updateLookupTables(
  tables: LookupTable[],
): Promise<ActionResult> {
  const tr = await getTranslations();
  const authz = await checkPermission("system", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  const parsed = lookupTablesArraySchema(tr).safeParse(tables);
  if (!parsed.success) {
    return actionError(
      parsed.error.issues[0]?.message ??
        tr("settings.trialPricingActions.invalidLookupTable"),
    );
  }
  const err = validateLookupTables(parsed.data, tr);
  if (err) return actionError(err);
  const before = await getTrialPricingSettings();
  return persistLookupTables(parsed.data, before, tr);
}

/** 単一のルックアップ表を追加/更新（id で upsert）。詳細ページの保存から呼ぶ。 */
export async function upsertLookupTable(
  table: LookupTable,
): Promise<ActionResult> {
  const tr = await getTranslations();
  const authz = await checkPermission("system", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  const parsed = lookupTableSchema(tr).safeParse(table);
  if (!parsed.success) {
    return actionError(
      parsed.error.issues[0]?.message ??
        tr("settings.trialPricingActions.invalidLookupTable"),
    );
  }
  const before = await getTrialPricingSettings();
  const idx = before.lookupTables.findIndex((t) => t.id === parsed.data.id);
  const next =
    idx >= 0
      ? before.lookupTables.map((t, i) => (i === idx ? parsed.data : t))
      : [...before.lookupTables, parsed.data];
  const err = validateLookupTables(next, tr);
  if (err) return actionError(err);
  return persistLookupTables(next, before, tr);
}

/** 単一のルックアップ表を削除（id 指定）。詳細ページから呼ぶ。 */
export async function deleteLookupTable(id: string): Promise<ActionResult> {
  const tr = await getTranslations();
  const authz = await checkPermission("system", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  const before = await getTrialPricingSettings();
  const next = before.lookupTables.filter((t) => t.id !== id);
  if (next.length === before.lookupTables.length)
    return actionError(tr("settings.trialPricingActions.lookupTableNotFound"));
  return persistLookupTables(next, before, tr);
}

// ── 製品種別（SY04） ──────────────────────────────────────────────────────────

/** 種別 id / 種別内の項目キーの重複を検出。 */
function validateItemDefs(
  defs: ProductItemDef[],
  tr: Awaited<ReturnType<typeof getTranslations>>,
): string | null {
  const keys = new Set<string>();
  for (const d of defs) {
    if (!IDENTIFIER.test(d.key))
      return tr("settings.productItemActions.keyNotIdentifier", {
        key: d.key || tr("settings.productItemActions.emptyKeyPlaceholder"),
      });
    if (keys.has(d.key))
      return tr("settings.productItemActions.duplicateItemKey", {
        key: d.key,
      });
    keys.add(d.key);
    if (d.type === "select" && (d.options ?? []).length === 0)
      return tr("settings.productItemActions.selectRequiresOptions", {
        label: d.label.ja,
      });
    if (d.type === "string" && d.pattern) {
      try {
        new RegExp(d.pattern);
      } catch {
        return tr("settings.productItemActions.invalidRegex", {
          label: d.label.ja,
        });
      }
    }
  }
  return null;
}

function validateTypes(
  types: ProductType[],
  defKeys: Set<string>,
  tr: Awaited<ReturnType<typeof getTranslations>>,
): string | null {
  const ids = new Set<string>();
  for (const t of types) {
    if (ids.has(t.id))
      return tr("settings.productItemActions.duplicateTypeId", { id: t.id });
    ids.add(t.id);
    const seen = new Set<string>();
    for (const a of t.assignments) {
      if (seen.has(a.itemKey))
        return tr("settings.productItemActions.duplicateAssignedItem", {
          name: t.name.ja,
          key: a.itemKey,
        });
      seen.add(a.itemKey);
      if (!defKeys.has(a.itemKey))
        return tr("settings.productItemActions.assignedItemNotFound", {
          name: t.name.ja,
          key: a.itemKey,
        });
    }
  }
  return null;
}

/** 項目定義（ライブラリ）を保存（製品項目 一覧ページから）。 */
export async function updateProductItemDefs(
  defs: ProductItemDef[],
): Promise<ActionResult> {
  const tr = await getTranslations();
  const authz = await checkPermission("system", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  const parsed = productItemDefsArraySchema.safeParse(defs);
  if (!parsed.success) {
    return actionError(
      parsed.error.issues[0]?.message ??
        tr("settings.productItemActions.invalidItemDefs"),
    );
  }
  const invalid = validateItemDefs(parsed.data, tr);
  if (invalid) return actionError(invalid);
  try {
    const before = await getProductItemDefs();
    await saveProductItemDefs(parsed.data);
    await recordAudit({
      action: "UPDATE",
      tableName: "system_settings",
      recordId: "product_item.definitions",
      before: { definitions: before },
      after: { definitions: parsed.data },
    });
    revalidatePath("/settings/product-items");
    revalidatePath("/master/products");
    return actionOk();
  } catch (e) {
    return actionError(
      prismaErrorMessage(
        e,
        tr("settings.productItemActions.itemDefsSaveFailed"),
        tr,
      ),
    );
  }
}

/** 製品種別（項目の割り当て）を保存。 */
export async function updateProductTypes(
  types: ProductType[],
): Promise<ActionResult> {
  const tr = await getTranslations();
  const authz = await checkPermission("system", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  const parsed = productTypesArraySchema.safeParse(types);
  if (!parsed.success) {
    return actionError(
      parsed.error.issues[0]?.message ??
        tr("settings.productItemActions.invalidProductTypes"),
    );
  }
  const defKeys = new Set((await getProductItemDefs()).map((d) => d.key));
  const invalid = validateTypes(parsed.data, defKeys, tr);
  if (invalid) return actionError(invalid);
  try {
    const before = await getProductTypes();
    await saveProductTypes(parsed.data);
    await recordAudit({
      action: "UPDATE",
      tableName: "system_settings",
      recordId: "product_item.types",
      before: { types: before },
      after: { types: parsed.data },
    });
    revalidatePath("/settings/product-items");
    revalidatePath("/settings/product-items/types");
    revalidatePath("/master/products");
    return actionOk();
  } catch (e) {
    return actionError(
      prismaErrorMessage(
        e,
        tr("settings.productItemActions.productTypesSaveFailed"),
        tr,
      ),
    );
  }
}
