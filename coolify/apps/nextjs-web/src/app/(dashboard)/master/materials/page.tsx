import {
  type MaterialRow,
  MaterialTable,
} from "@/components/master/materials/MaterialTable";
import { requireAppRead } from "@/lib/authz-page";
import { prisma } from "@/lib/db";
import { type LocalizedText, localized } from "@/lib/format";

export const dynamic = "force-dynamic";

/**
 * 素材 一覧 (MS06).
 *
 * 行の id は **items.id**（品目統合 第 3 段）。黒皮研磨だけは items 側に FK が
 * 無い（コード 1 文字を持つだけ）ので、名称は構成マスタを 1 回読んで引き当てる
 * — 3 行程度の表なので JOIN を作るより安い。
 */
export default async function MasterMaterialsPage() {
  const denied = await requireAppRead("master-materials");
  if (denied) return denied;
  const [records, finishes] = await Promise.all([
    prisma.item.findMany({
      where: { itemType: "MATERIAL" },
      include: { materialType: true },
      orderBy: { code: "asc" },
    }),
    prisma.materialSurfaceFinish.findMany(),
  ]);
  const finishName = new Map(
    finishes.map((f) => [f.code, localized(f.name as LocalizedText | null)]),
  );

  const rows: MaterialRow[] = records.map((r) => ({
    id: r.id,
    code: r.code ?? "",
    materialTypeCode: r.materialType?.code ?? "",
    materialTypeName: localized(r.materialType?.name as LocalizedText | null),
    name: localized(r.name as LocalizedText | null),
    diameterMm: Number(r.diameterMm ?? 0),
    lengthMm: Number(r.lengthMm ?? 0),
    surfaceFinish: finishName.get(r.surfaceFinishCode ?? "") ?? "",
    unit: r.unit,
    matchNames: r.matchNames,
    isActive: r.isActive,
  }));

  return <MaterialTable rows={rows} />;
}
