import {
  type MovementTypeRow,
  MovementTypeTable,
} from "@/components/inventory/movement-types/MovementTypeTable";
import { requireAppRead } from "@/lib/authz-page";
import { prisma } from "@/lib/db";
import {
  type LocalizedText,
  localized,
  localizedTranslations,
} from "@/lib/format";

export const dynamic = "force-dynamic";

/** 移動タイプ 一覧 (ST09) — 手動入出庫 (ST06) が選ぶ番号つきの型。 */
export default async function MovementTypesPage() {
  const denied = await requireAppRead("movement-types");
  if (denied) return denied;
  const records = await prisma.movementType.findMany({
    orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
  });

  const rows: MovementTypeRow[] = records.map((r) => {
    const name = r.name as LocalizedText | null;
    return {
      id: r.id,
      code: r.code,
      name: localized(name),
      nameJa: name?.ja ?? "",
      nameTranslations: localizedTranslations(name),
      direction: r.direction,
      requiresFrom: r.requiresFrom,
      requiresTo: r.requiresTo,
      sortOrder: r.sortOrder,
      isActive: r.isActive,
      notes: r.notes,
    };
  });

  return <MovementTypeTable rows={rows} />;
}
