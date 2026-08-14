import { EndUserForm } from "@/components/master/end-users/EndUserForm";
import { requireAppRead } from "@/lib/authz-page";

export const dynamic = "force-dynamic";

/** 最終需要家 新規作成 (MS12). */
export default async function MasterEndUsersNewPage() {
  const denied = await requireAppRead("master-end-users");
  if (denied) return denied;
  return <EndUserForm />;
}
