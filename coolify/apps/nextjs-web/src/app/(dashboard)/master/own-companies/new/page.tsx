import { OwnCompanyForm } from "@/components/master/own-companies/OwnCompanyForm";
import { requireAppRead } from "@/lib/authz-page";

export const dynamic = "force-dynamic";

/** 自社法人 新規作成 (MS1I). */
export default async function MasterOwnCompaniesNewPage() {
  const denied = await requireAppRead("master-own-companies");
  if (denied) return denied;
  return <OwnCompanyForm />;
}
