import { notFound } from "next/navigation";
import { DesignVersionDetail } from "@/components/production/design-files/DesignVersionDetail";
import {
  approvalNeed,
  fetchApprovalState,
  fetchApprovalTrail,
} from "@/lib/approvals";
import { fetchAuditEntries } from "@/lib/audit";
import { checkPermission } from "@/lib/authz";
import { requireAppRead } from "@/lib/authz-page";
import { listDesignPrograms } from "@/lib/design-programs";
import { fetchSeriesMemo } from "@/lib/design-series-memo";
import { listMemosByOwnerIds } from "@/lib/document-memos";
import {
  getProductItemDefs,
  getResolvedProductTypes,
} from "@/lib/product-settings";
import { fetchMachineModelOptions } from "@/lib/work-locations";
import { fetchCatalogStepOptions } from "../../../work-orders/data";
import { fetchDesignVersion } from "../../data";

export const dynamic = "force-dynamic";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * 設計図の版 詳細 — 1 版の仕様・ファイル・状態（下書き → (承認) → 確定）。
 *
 * URL id は版の uuid（版には業務キーが無い）。承認依頼の遷移先
 * （lib/approval-targets.ts design_versions.href）もここ。
 */
export default async function ProductionDesignVersionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const denied = await requireAppRead("design-files");
  if (denied) return denied;
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();

  const [
    data,
    approval,
    approvalTrail,
    need,
    manage,
    del,
    auditEntries,
    productTypes,
    itemDefs,
    programs,
    machineModelOptions,
    stepOptions,
  ] = await Promise.all([
    fetchDesignVersion(id),
    fetchApprovalState("design_versions", id),
    fetchApprovalTrail("design_versions", id),
    approvalNeed("design_versions"),
    checkPermission("design_file", "UPDATE"),
    checkPermission("design_file", "DELETE"),
    fetchAuditEntries("design_versions", id),
    getResolvedProductTypes(),
    getProductItemDefs(),
    listDesignPrograms(id),
    fetchMachineModelOptions(),
    fetchCatalogStepOptions(),
  ]);
  if (!data) notFound();

  // 保留中の加工プログラムの変更ごとの承認状態（カードの承認 / 差し戻し）。
  const pendingChangeIds = [
    ...programs.programs.flatMap((p) => (p.pending ? [p.pending.id] : [])),
    ...programs.pendingAdds.map((c) => c.id),
  ];
  const changeApprovals = Object.fromEntries(
    await Promise.all(
      pendingChangeIds.map(
        async (cid) =>
          [
            cid,
            await fetchApprovalState("design_program_changes", cid),
          ] as const,
      ),
    ),
  );

  // ファイルごとのメモ（document_memos, ownerType "design_files"）を 1 回で引く。
  // 系列メモ（この版が属する 製品 × 受注元 の全版で共通）も一緒に。
  const [memosByFile, seriesMemos] = await Promise.all([
    listMemosByOwnerIds(
      "design_files",
      data.view.files.map((f) => f.id),
    ),
    fetchSeriesMemo(data.view.itemId, data.view.customerBpId ?? null),
  ]);

  return (
    <DesignVersionDetail
      approval={approval}
      approvalTrail={approvalTrail}
      auditEntries={auditEntries}
      canDelete={del.ok}
      canManage={manage.ok}
      changeApprovals={changeApprovals}
      flowConfigured={need.kind === "flow"}
      itemDefs={itemDefs}
      machineModelOptions={machineModelOptions}
      memosByFile={memosByFile}
      productLabel={data.productLabel}
      productTypes={productTypes}
      programs={programs}
      seriesMemos={seriesMemos}
      stepOptions={stepOptions}
      version={data.view}
    />
  );
}
