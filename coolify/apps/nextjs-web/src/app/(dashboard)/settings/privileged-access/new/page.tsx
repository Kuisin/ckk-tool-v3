import { PrivilegedRequestForm } from "@/components/settings/privileged/PrivilegedRequestForm";
import { requireAppRead } from "@/lib/authz-page";
import { requestableCodes } from "@/lib/privileged-access";
import { ELEVATION_CODES } from "@/lib/privileged-operations";

export const dynamic = "force-dynamic";

/** 特権アクセスの申請（SY0G）。選べるのは自分が申請できる権限コードだけ。 */
export default async function NewPrivilegedAccessPage() {
  const denied = await requireAppRead("privileged-access");
  if (denied) return denied;
  const codes = await requestableCodes(ELEVATION_CODES);
  return <PrivilegedRequestForm codes={codes} />;
}
