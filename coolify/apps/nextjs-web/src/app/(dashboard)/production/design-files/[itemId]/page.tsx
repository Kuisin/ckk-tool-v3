import { notFound } from "next/navigation";
import { ProductDrawings } from "@/components/production/design-files/ProductDrawings";
import { checkPermission } from "@/lib/authz";
import { requireAppRead } from "@/lib/authz-page";
import { listMemosByOwnerIds } from "@/lib/document-memos";
import { fetchDesignFileItem, fetchDesignFilesForItem } from "../data";

export const dynamic = "force-dynamic";

/**
 * 設計図 詳細 (PD26) — 1 製品の全系列（受注元ごと）。
 *
 * URL id は製品の **品目 id（items.id）**。系列は (製品 × 受注元) だが、
 * 受注元ごとに URL を割ると
 * 「この製品の図面」を見るのに何回も行き来することになるので、製品 1 枚に
 * まとめて系列を節に分ける（一覧の行からは #series-… で直接飛べる）。
 */
export default async function ProductionDesignFileDetailPage({
  params,
}: {
  params: Promise<{ itemId: string }>;
}) {
  const denied = await requireAppRead("design-files");
  if (denied) return denied;

  const { itemId: raw } = await params;
  const itemId = Number(raw);
  if (!Number.isInteger(itemId) || itemId <= 0) notFound();

  const [product, files, manageAuthz] = await Promise.all([
    fetchDesignFileItem(itemId),
    fetchDesignFilesForItem(itemId),
    checkPermission("design_file", "UPDATE"),
  ]);
  if (!product) notFound();

  // 版ごとのメモ。行ごとに引くと版数ぶん走るので 1 回でまとめて取る。
  const memosByFile = await listMemosByOwnerIds(
    "design_files",
    files.map((f) => f.id),
  );

  return (
    <ProductDrawings
      canManage={manageAuthz.ok}
      files={files}
      itemId={product.id}
      memosByFile={memosByFile}
      productLabel={product.label}
    />
  );
}
