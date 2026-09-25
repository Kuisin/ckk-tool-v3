import { notFound } from "next/navigation";
import { ProductDrawings } from "@/components/production/design-files/ProductDrawings";
import { checkPermission } from "@/lib/authz";
import { requireAppRead } from "@/lib/authz-page";
import { fetchDesignFileItem, fetchDesignVersionsForItem } from "../data";

export const dynamic = "force-dynamic";

/**
 * 設計図 詳細 (PD26) — 1 製品の全系列（受注元ごと）の版。
 *
 * URL id は製品の **品目 id（items.id）**。系列は (製品 × 受注元) だが、
 * 受注元ごとに URL を割ると「この製品の図面」を見るのに何回も行き来する
 * ことになるので、製品 1 枚にまとめて系列を節に分ける（一覧の行からは
 * #series-… で直接飛べる）。版そのものの操作は版の詳細（versions/[id]）。
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

  const [product, versions, createAuthz] = await Promise.all([
    fetchDesignFileItem(itemId),
    fetchDesignVersionsForItem(itemId),
    checkPermission("design_file", "CREATE"),
  ]);
  if (!product) notFound();

  return (
    <ProductDrawings
      canManage={createAuthz.ok}
      itemId={product.id}
      productLabel={product.label}
      versions={versions}
    />
  );
}
