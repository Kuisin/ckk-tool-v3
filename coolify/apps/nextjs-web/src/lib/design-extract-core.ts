/**
 * design-extract-core.ts — 図面から読み取った値（design_versions.extract）の扱い（純関数）。
 *
 * 図脳 SXF を読むと仕様欄が埋まる。読み取った欄は**既定で読み取り専用**にし、
 * 人が「手入力」に切り替えたときだけ上書きできる。上書きしても**読み取った値は
 * 参照として残す** — 図面とどこが違うのかが、あとから画面で分かるように。
 *
 * 形:
 *   source     … どのファイルをいつ読んだか
 *   values     … 読み取った値（キー → 文字列）
 *   overridden … 手入力に切り替えたキー（その欄の実際の値は版の列が持つ）
 *
 * キーは欄の場所をそのまま名前にする:
 *   "diameterMm" / "lengthMm" / "titleBlock.<項目>" / "spec.<製品項目のキー>"
 *
 * **サーバーでも同じ規則を通す**（enforceExtract）— 読み取り専用の欄に画面の外から
 * 別の値を送っても、手入力に切り替えていなければ図面の値に戻す。
 */

import type { TitleBlock, TitleBlockField } from "./design-files-core";
import { TITLE_BLOCK_FIELDS } from "./design-files-core";
import {
  type SpecFieldDefLike,
  type SxfDrawingReading,
  sxfSpecPatch,
  sxfTitleBlock,
} from "./sxf-core";

export type ExtractKey =
  | "diameterMm"
  | "lengthMm"
  | `titleBlock.${TitleBlockField}`
  | `spec.${string}`;

export interface DesignExtract {
  source: {
    fileName: string | null;
    sheetNumber: string | null;
    software: string | null;
    /** 読み取った日時（ISO）。 */
    readAt: string;
  };
  values: Record<string, string>;
  overridden: string[];
}

const KEY_RE =
  /^(diameterMm|lengthMm|titleBlock\.[A-Za-z]+|spec\.[A-Za-z0-9_]+)$/;

/** 知らない形のキーを捨てる（JSON 列・画面からの入力の両方に通す）。 */
export function isExtractKey(key: string): key is ExtractKey {
  if (!KEY_RE.test(key)) return false;
  if (key.startsWith("titleBlock.")) {
    return (TITLE_BLOCK_FIELDS as readonly string[]).includes(
      key.slice("titleBlock.".length),
    );
  }
  return true;
}

/** JSON 列 → 読み取り結果（壊れていれば null）。 */
export function toDesignExtract(value: unknown): DesignExtract | null {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const v = value as Record<string, unknown>;
  const src = (v.source ?? {}) as Record<string, unknown>;
  const str = (x: unknown) => (typeof x === "string" && x ? x : null);
  const values: Record<string, string> = {};
  if (v.values && typeof v.values === "object" && !Array.isArray(v.values)) {
    for (const [k, val] of Object.entries(
      v.values as Record<string, unknown>,
    )) {
      if (isExtractKey(k) && typeof val === "string" && val.trim() !== "") {
        values[k] = val;
      }
    }
  }
  if (Object.keys(values).length === 0) return null;
  const overridden = Array.isArray(v.overridden)
    ? [
        ...new Set(
          v.overridden.filter(
            (k): k is string => typeof k === "string" && k in values,
          ),
        ),
      ]
    : [];
  return {
    source: {
      fileName: str(src.fileName),
      sheetNumber: str(src.sheetNumber),
      software: str(src.software),
      readAt: str(src.readAt) ?? new Date(0).toISOString(),
    },
    values,
    overridden,
  };
}

/** 読み取った値があり、手入力に切り替えていない = 読み取り専用。 */
export function isLocked(extract: DesignExtract | null, key: string): boolean {
  return (
    extract != null &&
    key in extract.values &&
    !extract.overridden.includes(key)
  );
}

/** 読み取った値（無ければ null）。 */
export function extractedValue(
  extract: DesignExtract | null,
  key: string,
): string | null {
  return extract?.values[key] ?? null;
}

/** 手入力の切り替え。読み取っていないキーは何もしない。 */
export function setOverride(
  extract: DesignExtract,
  key: string,
  on: boolean,
): DesignExtract {
  if (!(key in extract.values)) return extract;
  const rest = extract.overridden.filter((k) => k !== key);
  return { ...extract, overridden: on ? [...rest, key] : rest };
}

/**
 * 新しい読み取り結果に差し替える。**手入力に切り替えていた欄はそのまま** —
 * 新しい図面にもその欄があれば手入力のまま残し、人が決めた値を図面で消さない。
 */
export function replaceExtract(
  prev: DesignExtract | null,
  next: Omit<DesignExtract, "overridden">,
): DesignExtract {
  const overridden = (prev?.overridden ?? []).filter((k) => k in next.values);
  return { ...next, overridden };
}

/** 仕様の値（版の列の形）。 */
export interface ExtractTarget {
  diameterMm: number | null;
  lengthMm: number | null;
  spec: Record<string, string> | null;
  titleBlock: TitleBlock;
}

function toNumber(v: string): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * 読み取り専用の欄を図面の値に揃える（画面での差し込みとサーバーの最終ガードの両方）。
 * 手入力に切り替えた欄には触らない。
 */
export function enforceExtract<T extends ExtractTarget>(
  target: T,
  extract: DesignExtract | null,
): T {
  if (!extract) return target;
  const out: T = {
    ...target,
    spec: target.spec ? { ...target.spec } : null,
    titleBlock: { ...target.titleBlock },
  };
  for (const [key, value] of Object.entries(extract.values)) {
    if (extract.overridden.includes(key)) continue;
    if (key === "diameterMm") out.diameterMm = toNumber(value);
    else if (key === "lengthMm") out.lengthMm = toNumber(value);
    else if (key.startsWith("titleBlock.")) {
      out.titleBlock[key.slice("titleBlock.".length) as TitleBlockField] =
        value;
    } else if (key.startsWith("spec.")) {
      out.spec = { ...(out.spec ?? {}), [key.slice("spec.".length)]: value };
    }
  }
  return out;
}

/** 読み取った欄の数と、そのうち手入力にした数（要約表示用）。 */
export function extractCounts(extract: DesignExtract | null): {
  read: number;
  overridden: number;
} {
  return {
    read: extract ? Object.keys(extract.values).length : 0,
    overridden: extract?.overridden.length ?? 0,
  };
}

/**
 * SXF の読み取り → 読み取り結果（どの欄に何が入るか）。製品項目は型に合う
 * ものだけ（sxfSpecPatch と同じ規則）。
 */
export function extractFromSxf(
  reading: SxfDrawingReading,
  defs: readonly SpecFieldDefLike[],
  fileName: string | null,
  now: Date,
): Omit<DesignExtract, "overridden"> {
  const values: Record<string, string> = {};
  if (reading.diameterMm != null)
    values.diameterMm = String(reading.diameterMm);
  if (reading.lengthMm != null) values.lengthMm = String(reading.lengthMm);
  for (const [f, v] of Object.entries(sxfTitleBlock(reading))) {
    if (v) values[`titleBlock.${f}`] = v;
  }
  for (const [k, v] of Object.entries(sxfSpecPatch(reading, defs).specValues)) {
    values[`spec.${k}`] = v;
  }
  return {
    source: {
      fileName,
      sheetNumber: reading.sheetNumber,
      software: reading.software,
      readAt: now.toISOString(),
    },
    values,
  };
}
