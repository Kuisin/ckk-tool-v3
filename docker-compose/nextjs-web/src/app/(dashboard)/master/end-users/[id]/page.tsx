import { notFound } from "next/navigation";
import { EndUserDetail } from "@/components/master/end-users/EndUserDetail";
import { fetchEndUserDetail } from "../../_shared/bp-data";

export const dynamic = "force-dynamic";

/** 最終需要家 詳細 (MS22). */
export default async function MasterEndUsersDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const record = await fetchEndUserDetail(id);
  if (!record) notFound();
  return <EndUserDetail record={record} />;
}
