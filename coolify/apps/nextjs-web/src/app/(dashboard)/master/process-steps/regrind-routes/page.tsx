import { CommonRoutesPanel } from "@/components/master/process-steps/CommonRoutesPanel";
import { requireAppRead } from "@/lib/authz-page";
import { listRegrindRoutes } from "@/lib/product-routes";

export const dynamic = "force-dynamic";

/**
 * 再研磨工程リスト（共通）— 工程マスタ (MS08) のサブページ。
 *
 * 顧客の工具を預かって研ぎ直す手順（製品受入 → 研磨 → [コーティング] → [検査]）は
 * 工具の品目ごとに変わるものではないので、準備工程リストと同じく製品にも受注元にも
 * 紐づかない共通のリストとして 1 か所で持つ。再研磨の指示書はここの最新版を使う。
 */
export default async function MasterRegrindRoutesPage() {
  const denied = await requireAppRead("master-process-steps");
  if (denied) return denied;
  const routes = await listRegrindRoutes();
  return <CommonRoutesPanel kind="REGRIND" routes={routes} />;
}
