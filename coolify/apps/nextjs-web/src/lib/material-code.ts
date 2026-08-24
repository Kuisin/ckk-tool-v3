/**
 * material-code.ts — 材種/素材コードの組立・導出（採番表 ver1.2, _specs/tables.md）.
 *
 * 材種コード: [A-Z][0-9]{2}[ABC-Z][0-9]{4}  例: B01B0001
 *   = manufacturer(1) + grade(2) + shape(1) + kind(4)
 * 素材コード: [材種コード]-[A-C][0-9]{3}-[0-9]{3}  例: B01B0001-A083-330
 *   = 材種 + surface_finish(1) + diameter(3 = TEXT(径mm×10,'000'))
 *     + '-' + length(3 = TEXT(全長mm,'000'))
 *
 * Pure functions — server/client 両用、ユニットテスト対象。
 */

export const MATERIAL_TYPE_CODE_RE = /^[A-Z][0-9]{2}[A-Z][0-9]{4}$/;
export const MATERIAL_CODE_RE =
  /^[A-Z][0-9]{2}[A-Z][0-9]{4}-[A-C][0-9]{3}-[0-9]{3}$/;

/** 構造化（変換済）材種 id か — レガシー取込のプレースホルダは uuid。 */
export function isStructuredMaterialTypeId(id: string): boolean {
  return MATERIAL_TYPE_CODE_RE.test(id);
}

export function composeMaterialTypeCode(
  manufacturerCode: string,
  gradeCode: string,
  shapeCode: string,
  kindCode: string,
): string {
  const code = `${manufacturerCode}${gradeCode}${shapeCode}${kindCode}`;
  if (!MATERIAL_TYPE_CODE_RE.test(code)) {
    throw new Error(`invalid material type code: ${code}`);
  }
  return code;
}

/** 4桁の種類連番（0001〜9999）。 */
export function formatKindSerial(n: number): string {
  if (!Number.isInteger(n) || n < 1 || n > 9999) {
    throw new Error(`kind serial out of range: ${n}`);
  }
  return String(n).padStart(4, "0");
}

/** 直径コード: TEXT(径mm × 10, '000')。有効範囲 0.1〜99.9mm。 */
export function diameterCodeFromMm(mm: number): string {
  const tenths = Math.round(mm * 10);
  if (!Number.isFinite(mm) || tenths < 1 || tenths > 999) {
    throw new Error(`diameter out of range (0.1–99.9mm): ${mm}`);
  }
  return String(tenths).padStart(3, "0");
}

/** 全長コード: TEXT(全長mm, '000')。有効範囲 1〜999mm（整数）。 */
export function lengthCodeFromMm(mm: number): string {
  const n = Math.round(mm);
  if (!Number.isFinite(mm) || n < 1 || n > 999) {
    throw new Error(`length out of range (1–999mm): ${mm}`);
  }
  return String(n).padStart(3, "0");
}

export function composeMaterialCode(
  materialTypeId: string,
  surfaceFinishCode: string,
  diameterCode: string,
  lengthVariantCode: string,
): string {
  const code = `${materialTypeId}-${surfaceFinishCode}${diameterCode}-${lengthVariantCode}`;
  if (!MATERIAL_CODE_RE.test(code)) {
    throw new Error(`invalid material code: ${code}`);
  }
  return code;
}
