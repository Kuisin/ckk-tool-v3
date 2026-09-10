import { PrepRoutesPanel } from "@/components/master/process-steps/PrepRoutesPanel";
import { requireAppRead } from "@/lib/authz-page";
import { listPrepRoutes } from "@/lib/product-routes";

export const dynamic = "force-dynamic";

/**
 * 準備工程リスト（共通）— 工程マスタ (MS08) のサブページ。
 *
 * 〇〇出し・受渡し と 材料準備（切断・センタレス・全長合わせ・C面）の並びは製品で
 * 変わらないので、製品ごとの工程リストから切り出して 1 か所で持つ（§7）。
 * 指示書は ここの版 + 製品の製造工程リストの版 を合わせて工程を作る。
 * 地域マスタ（/master/plants/regions）と同じ「専用アプリ・opcode なし」の置き方。
 */
export default async function MasterPrepRoutesPage() {
  const denied = await requireAppRead("master-process-steps");
  if (denied) return denied;
  const routes = await listPrepRoutes();
  return <PrepRoutesPanel routes={routes} />;
}
