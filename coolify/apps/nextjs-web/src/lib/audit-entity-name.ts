/**
 * audit-entity-name.ts — audit-entity-name-core.ts の続き（DB 参照）。server-only.
 *
 * `record_key`（`lib/audit-record-key-core.ts` の `identity` 形 — 監査キーが
 * その表の PK そのもの）を使って、名前を持つ表の現在の名前を引く。**改名
 * された行は最新の名前が出る** — before/after のスナップショットに頼ると
 * 記録時点の古い名前のまま固定されてしまうため、生きている行は常に DB を
 * 直接引くのが正しい（削除済みの行だけスナップショットへ倒れる）。
 *
 * SY07 一覧は 1 ページに複数行あるため、行ごとに 1 クエリを投げず、
 * `resolveEntityNames` で**表ごとにまとめて** 1 クエリに束ねる。
 */

import {
  extractNameFromPayload,
  hasEntityName,
  jaOf,
  splitCompositeKey,
} from "./audit-entity-name-core";
import { prisma } from "./db";

/** `${tableName}:${recordKey}` → 名前。 */
export type EntityNameMap = Map<string, string>;

function mapKey(tableName: string, recordKey: string): string {
  return `${tableName}:${recordKey}`;
}

/** 表ごとに 1 クエリで `id → 名前` を引く。未対応の表は空 Map。 */
async function lookupEntityNamesForTable(
  tableName: string,
  ids: string[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (ids.length === 0) return out;

  switch (tableName) {
    case "kiosk_devices": {
      const rows = await prisma.kioskDevice.findMany({
        where: { id: { in: ids } },
        select: { id: true, name: true },
      });
      for (const r of rows) {
        const n = jaOf(r.name);
        if (n) out.set(r.id, n);
      }
      break;
    }
    case "display_devices": {
      const rows = await prisma.displayDevice.findMany({
        where: { id: { in: ids } },
        select: { id: true, name: true },
      });
      for (const r of rows) {
        const n = jaOf(r.name);
        if (n) out.set(r.id, n);
      }
      break;
    }
    case "approval_groups": {
      const rows = await prisma.approvalGroup.findMany({
        where: { id: { in: ids.map(Number) } },
        select: { id: true, name: true },
      });
      for (const r of rows) {
        const n = jaOf(r.name);
        if (n) out.set(String(r.id), n);
      }
      break;
    }
    case "inspection_templates": {
      const rows = await prisma.inspectionTemplate.findMany({
        where: { id: { in: ids.map(Number) } },
        select: { id: true, name: true },
      });
      for (const r of rows) {
        const n = jaOf(r.name);
        if (n) out.set(String(r.id), n);
      }
      break;
    }
    case "inspection_template_groups": {
      const rows = await prisma.inspectionTemplateGroup.findMany({
        where: { id: { in: ids.map(Number) } },
        select: { id: true, name: true },
      });
      for (const r of rows) {
        const n = jaOf(r.name);
        if (n) out.set(String(r.id), n);
      }
      break;
    }
    case "products": {
      const rows = await prisma.product.findMany({
        where: { id: { in: ids.map(Number) } },
        select: { id: true, name: true },
      });
      for (const r of rows) {
        const n = jaOf(r.name);
        if (n) out.set(String(r.id), n);
      }
      break;
    }
    case "materials": {
      const rows = await prisma.material.findMany({
        where: { id: { in: ids.map(Number) } },
        select: { id: true, name: true },
      });
      for (const r of rows) {
        const n = jaOf(r.name);
        if (n) out.set(String(r.id), n);
      }
      break;
    }
    case "material_types": {
      const rows = await prisma.materialType.findMany({
        where: { id: { in: ids.map(Number) } },
        select: { id: true, name: true },
      });
      for (const r of rows) {
        const n = jaOf(r.name);
        if (n) out.set(String(r.id), n);
      }
      break;
    }
    case "plants": {
      const rows = await prisma.plant.findMany({
        where: { id: { in: ids.map(Number) } },
        select: { id: true, name: true },
      });
      for (const r of rows) {
        const n = jaOf(r.name);
        if (n) out.set(String(r.id), n);
      }
      break;
    }
    case "regions": {
      const rows = await prisma.region.findMany({
        where: { id: { in: ids.map(Number) } },
        select: { id: true, name: true },
      });
      for (const r of rows) {
        const n = jaOf(r.name);
        if (n) out.set(String(r.id), n);
      }
      break;
    }
    case "storage_shelves": {
      // name は nullable — 無ければ code（採番表の呼び名）へ落ちる。
      const rows = await prisma.storageShelf.findMany({
        where: { id: { in: ids.map(Number) } },
        select: { id: true, name: true, code: true },
      });
      for (const r of rows) {
        const n = jaOf(r.name) ?? r.code;
        if (n) out.set(String(r.id), n);
      }
      break;
    }
    case "storage_locations": {
      const rows = await prisma.storageLocation.findMany({
        where: { id: { in: ids.map(Number) } },
        select: { id: true, name: true },
      });
      for (const r of rows) {
        const n = jaOf(r.name);
        if (n) out.set(String(r.id), n);
      }
      break;
    }
    case "process_step_catalog": {
      const rows = await prisma.processStepCatalog.findMany({
        where: { id: { in: ids.map(Number) } },
        select: { id: true, name: true },
      });
      for (const r of rows) {
        const n = jaOf(r.name);
        if (n) out.set(String(r.id), n);
      }
      break;
    }
    case "product_process_routes": {
      const rows = await prisma.productProcessRoute.findMany({
        where: { id: { in: ids.map(Number) } },
        select: { id: true, name: true },
      });
      for (const r of rows) {
        const n = jaOf(r.name);
        if (n) out.set(String(r.id), n);
      }
      break;
    }
    case "defect_types": {
      const rows = await prisma.defectType.findMany({
        where: { id: { in: ids.map(Number) } },
        select: { id: true, name: true },
      });
      for (const r of rows) {
        const n = jaOf(r.name);
        if (n) out.set(String(r.id), n);
      }
      break;
    }
    case "work_location_groups": {
      const rows = await prisma.workLocationGroup.findMany({
        where: { id: { in: ids.map(Number) } },
        select: { id: true, name: true },
      });
      for (const r of rows) {
        const n = jaOf(r.name);
        if (n) out.set(String(r.id), n);
      }
      break;
    }
    case "business_partners": {
      const rows = await prisma.businessPartner.findMany({
        where: { id: { in: ids } },
        select: { id: true, name: true },
      });
      for (const r of rows) {
        const n = jaOf(r.name);
        if (n) out.set(r.id, n);
      }
      break;
    }
    case "material_manufacturers": {
      const rows = await prisma.materialManufacturer.findMany({
        where: { code: { in: ids } },
        select: { code: true, name: true },
      });
      for (const r of rows) {
        const n = jaOf(r.name);
        if (n) out.set(r.code, n);
      }
      break;
    }
    case "material_shapes": {
      const rows = await prisma.materialShape.findMany({
        where: { code: { in: ids } },
        select: { code: true, name: true },
      });
      for (const r of rows) {
        const n = jaOf(r.name);
        if (n) out.set(r.code, n);
      }
      break;
    }
    case "material_surface_finishes": {
      const rows = await prisma.materialSurfaceFinish.findMany({
        where: { code: { in: ids } },
        select: { code: true, name: true },
      });
      for (const r of rows) {
        const n = jaOf(r.name);
        if (n) out.set(r.code, n);
      }
      break;
    }
    case "material_diameters": {
      // displayName（name ではない）。無ければ実径 (mm) へ落ちる。
      const rows = await prisma.materialDiameter.findMany({
        where: { code: { in: ids } },
        select: { code: true, displayName: true, diameterMm: true },
      });
      for (const r of rows) {
        const n = jaOf(r.displayName) ?? `φ${r.diameterMm}`;
        if (n) out.set(r.code, n);
      }
      break;
    }
    case "material_length_variants": {
      // displayName（name ではない）。無ければ全長 (mm) へ落ちる。
      const rows = await prisma.materialLengthVariant.findMany({
        where: { code: { in: ids } },
        select: { code: true, displayName: true, lengthMm: true },
      });
      for (const r of rows) {
        const n = jaOf(r.displayName) ?? `${r.lengthMm}mm`;
        if (n) out.set(r.code, n);
      }
      break;
    }
    case "material_manufacturer_grades": {
      // 複合キー "parentCode/code" → { manufacturerCode, code }。
      const pairs = ids
        .map((id) => splitCompositeKey(id))
        .filter((p): p is { parent: string; code: string } => p !== null);
      if (pairs.length === 0) break;
      const rows = await prisma.materialManufacturerGrade.findMany({
        where: {
          OR: pairs.map((p) => ({
            manufacturerCode: p.parent,
            code: p.code,
          })),
        },
        select: { manufacturerCode: true, code: true, name: true },
      });
      for (const r of rows) {
        const n = jaOf(r.name);
        if (n) out.set(`${r.manufacturerCode}/${r.code}`, n);
      }
      break;
    }
    case "material_kinds": {
      const pairs = ids
        .map((id) => splitCompositeKey(id))
        .filter((p): p is { parent: string; code: string } => p !== null);
      if (pairs.length === 0) break;
      const rows = await prisma.materialKind.findMany({
        where: {
          OR: pairs.map((p) => ({ shapeCode: p.parent, code: p.code })),
        },
        select: { shapeCode: true, code: true, name: true },
      });
      for (const r of rows) {
        const n = jaOf(r.name);
        if (n) out.set(`${r.shapeCode}/${r.code}`, n);
      }
      break;
    }
    case "portal_accounts": {
      const rows = await prisma.portalAccount.findMany({
        where: { id: { in: ids } },
        select: { id: true, displayName: true },
      });
      for (const r of rows) out.set(r.id, r.displayName);
      break;
    }
    case "kiosk_floor_maps": {
      const rows = await prisma.kioskFloorMap.findMany({
        where: { id: { in: ids } },
        select: { id: true, name: true },
      });
      for (const r of rows) out.set(r.id, r.name);
      break;
    }
    case "link_blacklist": {
      const rows = await prisma.linkBlacklist.findMany({
        where: { id: { in: ids } },
        select: { id: true, pattern: true },
      });
      for (const r of rows) out.set(r.id, r.pattern);
      break;
    }
    case "portal_document_links": {
      const rows = await prisma.portalDocumentLink.findMany({
        where: { id: { in: ids } },
        select: { id: true, label: true },
      });
      for (const r of rows) {
        if (r.label) out.set(r.id, r.label);
      }
      break;
    }
    // user_plants / user_role_relation の record_key は users.id そのもの
    // （lib/audit-record-key-core.ts のコメント参照 — 対象は行ではなく人）。
    case "users":
    case "user_plants":
    case "user_role_relation": {
      const rows = await prisma.user.findMany({
        where: { id: { in: ids } },
        select: { id: true, displayName: true },
      });
      for (const r of rows) out.set(r.id, r.displayName);
      break;
    }
    default:
      break;
  }
  return out;
}

/**
 * 複数行ぶんの名前を、表ごとに 1 クエリへ束ねてまとめて引く。
 *
 * `recordKey` が無い行（未解決・対象外の表）はスキップ — 呼び出し側は
 * `extractNameFromPayload` で before/after からの穴埋めを別途行うこと。
 * 失敗しても例外は投げない（名前が引けないだけで番号表示に戻る）。
 */
export async function resolveEntityNames(
  rows: { tableName: string; recordKey: string | null }[],
): Promise<EntityNameMap> {
  const idsByTable = new Map<string, Set<string>>();
  for (const row of rows) {
    if (!row.recordKey || !hasEntityName(row.tableName)) continue;
    if (!idsByTable.has(row.tableName))
      idsByTable.set(row.tableName, new Set());
    idsByTable.get(row.tableName)?.add(row.recordKey);
  }

  const result: EntityNameMap = new Map();
  for (const [tableName, idSet] of idsByTable) {
    try {
      const names = await lookupEntityNamesForTable(tableName, [...idSet]);
      for (const [id, name] of names) result.set(mapKey(tableName, id), name);
    } catch (e) {
      console.error("resolveEntityNames failed", tableName, e);
    }
  }
  return result;
}

/**
 * 1 行ぶんの名前。DB に無ければ（削除済み等）監査ペイロードへ落ちる。
 * `names` は `resolveEntityNames` の戻り値をそのまま渡すこと。
 */
export function entityNameOf(
  names: EntityNameMap,
  tableName: string,
  recordKey: string | null,
  fallbackPayload: unknown,
): string | undefined {
  if (recordKey) {
    const hit = names.get(mapKey(tableName, recordKey));
    if (hit) return hit;
  }
  return extractNameFromPayload(fallbackPayload);
}
