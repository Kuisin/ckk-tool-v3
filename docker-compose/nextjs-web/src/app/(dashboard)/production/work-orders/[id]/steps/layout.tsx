import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { StepListPane } from "@/components/production/step-execution/StepListPane";
import { MasterDetailShell } from "@/components/ui/MasterDetailShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { workOrderNumberLabel } from "@/lib/format";
import { fetchWorkOrderStepNav } from "../../data";

export const dynamic = "force-dynamic";

/**
 * 工程スプリットビュー — 指示書の工程一覧（左）と工程実行（右）を 1 ページに。
 * MasterDetailShell（設定アプリ共通のマスタ/詳細レイアウト）を使用:
 * デスクトップはリサイズ可能な 2 ペイン、モバイルは一覧/詳細を別表示。
 * 工程操作後は StepExecutionView が router.refresh() するので左の状態も更新される。
 */
export default async function WorkOrderStepsLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const workOrderNumber = Number(id);
  if (!Number.isInteger(workOrderNumber) || workOrderNumber < 1) notFound();

  const nav = await fetchWorkOrderStepNav(workOrderNumber);
  if (!nav) notFound();
  // 表示番号 YYYYMMDD-XXXXX（内部キーは通し連番の int のまま）。
  const woLabel = workOrderNumberLabel(nav.workOrderNumber, nav.createdAt);

  const basePath = `/production/work-orders/${workOrderNumber}/steps`;
  return (
    <MasterDetailShell
      basePath={basePath}
      header={
        <PageHeader
          breadcrumbs={[
            "生産",
            { label: "指示書", href: "/production/work-orders" },
            {
              label: woLabel,
              href: `/production/work-orders/${workOrderNumber}`,
            },
            "工程",
          ]}
          title={`工程 — 指示書 ${woLabel}`}
        />
      }
      master={<StepListPane basePath={basePath} steps={nav.steps} />}
      mobileBackLabel="工程一覧へ戻る"
    >
      {children}
    </MasterDetailShell>
  );
}
