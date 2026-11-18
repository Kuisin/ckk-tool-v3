import { notFound } from "next/navigation";
import { DesignVersionDetail } from "@/components/production/design-files/DesignVersionDetail";
import {
  assertFlowConfigured,
  fetchApprovalState,
  fetchApprovalTrail,
} from "@/lib/approvals";
import { fetchAuditEntries } from "@/lib/audit";
import { checkPermission } from "@/lib/authz";
import { requireAppRead } from "@/lib/authz-page";
import { listMemosByOwnerIds } from "@/lib/document-memos";
import {
  getProductItemDefs,
  getResolvedProductTypes,
} from "@/lib/product-settings";
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
    flowError,
    manage,
    del,
    auditEntries,
    productTypes,
    itemDefs,
  ] = await Promise.all([
    fetchDesignVersion(id),
    fetchApprovalState("design_versions", id),
    fetchApprovalTrail("design_versions", id),
    assertFlowConfigured("design_versions"),
    checkPermission("design_file", "UPDATE"),
    checkPermission("design_file", "DELETE"),
    fetchAuditEntries("design_versions", id),
    getResolvedProductTypes(),
    getProductItemDefs(),
  ]);
  if (!data) notFound();

  // ファイルごとのメモ（document_memos, ownerType "design_files"）を 1 回で引く。
  const memosByFile = await listMemosByOwnerIds(
    "design_files",
    data.view.files.map((f) => f.id),
  );

  return (
    <DesignVersionDetail
      approval={approval}
      approvalTrail={approvalTrail}
      auditEntries={auditEntries}
      canDelete={del.ok}
      canManage={manage.ok}
      flowConfigured={flowError == null}
      itemDefs={itemDefs}
      memosByFile={memosByFile}
      productLabel={data.productLabel}
      productTypes={productTypes}
      version={data.view}
    />
  );
}
