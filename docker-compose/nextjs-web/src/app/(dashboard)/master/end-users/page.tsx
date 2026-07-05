import { EndUserTable } from "@/components/master/end-users/EndUserTable";
import { fetchEndUsers } from "../_shared/bp-data";

export const dynamic = "force-dynamic";

/** 最終需要家 一覧 (MS02). */
export default async function MasterEndUsersPage() {
  const rows = await fetchEndUsers();
  return <EndUserTable rows={rows} />;
}
