import { notFound } from "next/navigation";
import { OwnCompanyForm } from "@/components/master/own-companies/OwnCompanyForm";
import { requireAppRead } from "@/lib/authz-page";
import { fetchOwnCompanyFormInitial } from "../../data";

export const dynamic = "force-dynamic";

/** 自社法人 編集 (MS2I edit). */
export default async function MasterOwnCompaniesEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const denied = await requireAppRead("master-own-companies");
  if (denied) return denied;
  const { id: idParam } = await params;
  const id = Number(idParam);
  if (!Number.isInteger(id)) notFound();
  const initial = await fetchOwnCompanyFormInitial(id);
  if (!initial) notFound();
  return <OwnCompanyForm initial={initial} />;
}
