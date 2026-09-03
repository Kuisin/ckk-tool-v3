import { IconLock } from "@tabler/icons-react";
import { fetchWorkOrderStrips } from "@/app/(dashboard)/production/work-orders/data";
import { WorkOrderStripSheets } from "@/components/production/work-orders/WorkOrderStripSheets";
import { EmptyState } from "@/components/ui/EmptyState";
import { checkPermission } from "@/lib/authz";
import { PrintToolbar } from "./print-toolbar";

export const dynamic = "force-dynamic";

/** PDF 保存名が一意になるよう日時入りタイトル（コンテナ TZ=Asia/Tokyo）。 */
export function generateMetadata() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    title: `指示書ストリップ_${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`, // i18n-ignore — api/pdf/kiosk-cards/route.ts と同じファイル名規約
  };
}

/**
 * 指示書ストリップ印刷（PD02, /production/work-orders/print?ids=1,2,3）。
 *
 * (print) ルートグループ配下 — ダッシュボードシェル無しで帯だけを描く。
 * 1 枚 = 指示書 1 件の「最小限の要約 + QR」。A4 普通紙に 180×40mm を 6 本、
 * 切り取って指示書の紙や部品箱に貼る想定（寸法は lib/work-order-strip-sheet.ts）。
 *
 * QR は統一形式 `CKK:WO:<指示書番号>`（lib/qr-payload.ts）。**URL は入れない** —
 * 長い URL は QR を細かくして現場の読み取りを落とし、紙が外に出たときに
 * ホスト名を晒すため。将来キオスクがこの QR を読んで工程画面へ飛ぶ。
 *
 * ★ 原寸 — `@page` はキーワード（A4）ではなく**長さ**で書く。長さ指定は
 *   絶対ページボックスで、UA は用紙に合わせて縮小できない。キーワードは
 *   "scalable" ＝ 縮小されうる（QR カードで実際に縮んだ経緯がある）。
 */
export default async function WorkOrderStripPrintPage({
  searchParams,
}: {
  searchParams: Promise<{ ids?: string }>;
}) {
  const authz = await checkPermission("work_order", "READ");
  if (!authz.ok) {
    return <EmptyState icon={<IconLock size={28} />} message={authz.error} />;
  }

  const { ids: idsRaw } = await searchParams;
  const numbers = (idsRaw ?? "")
    .split(",")
    .map((s) => Number.parseInt(s.trim(), 10))
    .filter((n) => Number.isInteger(n) && n > 0)
    .slice(0, 120);
  const strips = await fetchWorkOrderStrips(numbers);

  return (
    <div className="wo-strip-root">
      {/* 画面表示のみのツールバー（@media print で非表示） */}
      <PrintToolbar count={strips.length} />

      <WorkOrderStripSheets strips={strips} />
    </div>
  );
}
