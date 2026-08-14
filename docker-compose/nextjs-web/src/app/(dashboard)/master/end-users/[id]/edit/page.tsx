import { notFound } from "next/navigation";
import { EndUserForm } from "@/components/master/end-users/EndUserForm";
import { requireAppRead } from "@/lib/authz-page";
import { fetchEndUserDetail } from "../../../_shared/bp-data";

export const dynamic = "force-dynamic";

/** 最終需要家 編集 (MS22). */
export default async function MasterEndUsersEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const denied = await requireAppRead("master-end-users");
  if (denied) return denied;
  const { id } = await params;
  const record = await fetchEndUserDetail(id);
  if (!record) notFound();
  return <EndUserForm initial={record} />;
}
