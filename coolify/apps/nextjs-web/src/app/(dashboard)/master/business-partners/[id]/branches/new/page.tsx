import { notFound } from "next/navigation";
import { BranchForm } from "@/components/master/bp/BranchForm";
import { requireAppRead } from "@/lib/authz-page";
import { fetchBpDetail } from "../../../../_shared/bp-data";

export const dynamic = "force-dynamic";

/** 支店 新規作成（取引先配下）. */
export default async function BpBranchNewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const denied = await requireAppRead("master-business-partners");
  if (denied) return denied;
  const { id } = await params;
  const parent = await fetchBpDetail(id);
  if (!parent) notFound();
  return (
    <BranchForm
      parentBpCode={parent.bpCode}
      parentId={parent.id}
      parentName={parent.nameJa}
    />
  );
}
