/**
 * design-spec-core.ts — 設計図の版が持つ仕様の組み立てと検証（純関数・唯一の定義元）。
 *
 * 仕様は以前は製品マスタ (MS04) が持っていた。いまは版 (design_versions) が持ち、
 * 入力画面は設計図 (PD16 / 版の詳細) にある。ここは画面とサーバーが同じ規則を
 * 通すための共通部分:
 *
 *   - 素材指定（材種 + 直径 + 全長）— 材種を入れたら直径・全長も必須
 *   - 製品項目（SY03）の値 — 製品種別（SY04）の項目 + 追加項目 + 定義外の旧キー
 *     を 1 つの平らな JSON（spec）に合成する。種別 id は予約キー `_product_type`
 *
 * DB にも React にも触らない（クライアントのフォームとサーバーの両方から使う）。
 */

import type { Tr } from "./i18n";
import {
  PRODUCT_TYPE_SPEC_KEY,
  type ProductItemDef,
  type ResolvedProductType,
  validateItemValue,
} from "./product-types";

// 直径/全長の許容範囲（素材ビルダー material-code と同じ）。
export const DIAMETER_MIN = 0.1;
export const DIAMETER_MAX = 99.9;
export const LENGTH_MIN = 1;
export const LENGTH_MAX = 999;

/**
 * 素材指定の検証。問題のある欄とその理由。無ければ空。
 *
 *   - 材種を入れたら直径・全長も必須（どの素材を切り出すかが決まらない）
 *   - 直径・全長は**材種なしでも持てる** — 図面から読んだ寸法は、材種がまだ
 *     決まっていなくても版の記録として意味がある（旧製品マスタは 3 つを 1 組に
 *     していたが、図面の寸法を捨てることになるので版ではやめた）
 *   - 入っている寸法は範囲を見る
 */
export function materialSpecErrors(
  v: {
    materialTypeId: string | number | null;
    diameterMm: number | null;
    lengthMm: number | null;
  },
  tr: Tr,
): { diameterMm?: string; lengthMm?: string } {
  const hasMaterial = v.materialTypeId != null && v.materialTypeId !== "";
  const out: { diameterMm?: string; lengthMm?: string } = {};
  const d = v.diameterMm;
  if (
    (hasMaterial && d == null) ||
    (d != null && (d < DIAMETER_MIN || d > DIAMETER_MAX))
  ) {
    out.diameterMm = tr("master.productForm.diameterRange", {
      min: DIAMETER_MIN,
      max: DIAMETER_MAX,
    });
  }
  const l = v.lengthMm;
  if (
    (hasMaterial && l == null) ||
    (l != null && (l < LENGTH_MIN || l > LENGTH_MAX))
  ) {
    out.lengthMm = tr("master.productForm.lengthRange", {
      min: LENGTH_MIN,
      max: LENGTH_MAX,
    });
  }
  return out;
}

/** JSON 列 → key/value（文字列以外の値は文字列にする。null / 配列は空）。 */
export function specRecord(value: unknown): Record<string, string> {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (v == null) continue;
    out[k] = typeof v === "string" ? v : String(v);
  }
  return out;
}

/** 画面で編集する形（種別 / 種別項目 / 追加項目 / 定義外の旧キー）。 */
export interface SpecEditorState {
  typeId: string | null;
  typeValues: Record<string, string>;
  extraKeys: string[];
  extraValues: Record<string, string>;
  /** 定義外の旧キー。画面では触らず、保存時にそのまま戻す。 */
  preserved: Record<string, string>;
}

/**
 * spec → 編集する形に分解する。種別の項目・ライブラリの項目・定義外の旧キーを
 * 分けておかないと、定義から消えた項目の値が保存のたびに黙って消える。
 */
export function decomposeSpec(
  spec: Record<string, string>,
  types: readonly ResolvedProductType[],
  defs: readonly ProductItemDef[],
): SpecEditorState {
  const typeId = spec[PRODUCT_TYPE_SPEC_KEY] ?? null;
  const type = types.find((t) => t.id === typeId) ?? null;
  const typeKeys = new Set(type?.items.map((i) => i.key) ?? []);
  const defKeys = new Set(defs.map((d) => d.key));
  const typeValues: Record<string, string> = {};
  for (const it of type?.items ?? []) {
    typeValues[it.key] = spec[it.key] ?? it.default ?? "";
  }
  const extraKeys: string[] = [];
  const extraValues: Record<string, string> = {};
  const preserved: Record<string, string> = {};
  for (const [k, v] of Object.entries(spec)) {
    if (k === PRODUCT_TYPE_SPEC_KEY || typeKeys.has(k)) continue;
    if (defKeys.has(k)) {
      extraKeys.push(k);
      extraValues[k] = v;
    } else {
      preserved[k] = v;
    }
  }
  return {
    typeId: type ? typeId : null,
    typeValues,
    extraKeys,
    extraValues,
    preserved,
  };
}

/** 編集する形 → spec（空の値は落とす。何も無ければ null）。 */
export function mergeSpec(
  state: SpecEditorState,
  types: readonly ResolvedProductType[],
): Record<string, string> | null {
  const out: Record<string, string> = { ...state.preserved };
  const type = types.find((t) => t.id === state.typeId) ?? null;
  if (type) {
    for (const it of type.items) {
      const v = (state.typeValues[it.key] ?? "").trim();
      if (v !== "") out[it.key] = v;
    }
    out[PRODUCT_TYPE_SPEC_KEY] = type.id;
  }
  for (const k of state.extraKeys) {
    const v = (state.extraValues[k] ?? "").trim();
    if (v !== "") out[k] = v;
  }
  return Object.keys(out).length > 0 ? out : null;
}

/**
 * spec を型で検証する（画面とサーバーの両方で通す最終ガード）。
 * 最初に見つかった問題の文言、無ければ null。
 */
export function validateSpec(
  spec: Record<string, string> | null,
  types: readonly ResolvedProductType[],
  defs: readonly ProductItemDef[],
  tr: Tr,
): string | null {
  const values = spec ?? {};
  const type = types.find((t) => t.id === values[PRODUCT_TYPE_SPEC_KEY]);
  const typeKeys = new Set(type?.items.map((i) => i.key) ?? []);
  for (const it of type?.items ?? []) {
    const msg = validateItemValue(it, values[it.key], tr);
    if (msg) return msg;
  }
  const defByKey = new Map(defs.map((d) => [d.key, d]));
  for (const [k, v] of Object.entries(values)) {
    if (k === PRODUCT_TYPE_SPEC_KEY || typeKeys.has(k)) continue;
    const def = defByKey.get(k);
    if (def) {
      const msg = validateItemValue(def, v, tr);
      if (msg) return msg;
    }
  }
  return null;
}

/**
 * 値を 1 つずつ差し込む（SXF 読み取りの反映）。種別の項目ならそこへ、そうで
 * なければ追加項目として足す。**既に入っている値は上書きする** — 読み取りを
 * 押した = 図面の値で埋めたい、という操作なので。
 */
export function applySpecValues(
  state: SpecEditorState,
  values: Record<string, string>,
  types: readonly ResolvedProductType[],
): SpecEditorState {
  const type = types.find((t) => t.id === state.typeId) ?? null;
  const typeKeys = new Set(type?.items.map((i) => i.key) ?? []);
  const next: SpecEditorState = {
    ...state,
    typeValues: { ...state.typeValues },
    extraKeys: [...state.extraKeys],
    extraValues: { ...state.extraValues },
  };
  for (const [k, v] of Object.entries(values)) {
    if (typeKeys.has(k)) {
      next.typeValues[k] = v;
    } else {
      if (!next.extraKeys.includes(k)) next.extraKeys.push(k);
      next.extraValues[k] = v;
    }
  }
  return next;
}

/** 1 行の表示（閲覧モード）。値が選択肢ならそのラベル、真偽ならはい/いいえ。 */
export function specDisplayRows(
  spec: Record<string, string>,
  types: readonly ResolvedProductType[],
  defs: readonly ProductItemDef[],
  tr: Tr,
): { key: string; label: string; value: string }[] {
  const type = types.find((t) => t.id === spec[PRODUCT_TYPE_SPEC_KEY]);
  const defByKey = new Map<string, ProductItemDef>(defs.map((d) => [d.key, d]));
  for (const it of type?.items ?? []) defByKey.set(it.key, it);
  const order = [
    ...(type?.items.map((i) => i.key) ?? []),
    ...Object.keys(spec).filter((k) => !type?.items.some((i) => i.key === k)),
  ];
  const rows: { key: string; label: string; value: string }[] = [];
  for (const k of order) {
    if (k === PRODUCT_TYPE_SPEC_KEY) continue;
    const raw = spec[k];
    if (raw == null || raw === "") continue;
    const def = defByKey.get(k);
    let value = raw;
    if (def?.type === "select") {
      value = def.options?.find((o) => o.value === raw)?.label ?? raw;
    } else if (def?.type === "boolean") {
      value = raw === "true" ? tr("common.yes") : tr("common.no");
    }
    rows.push({ key: k, label: def?.label.ja || def?.label.en || k, value });
  }
  return rows;
}
