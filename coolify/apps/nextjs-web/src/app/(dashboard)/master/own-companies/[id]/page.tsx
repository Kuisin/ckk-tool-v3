import { notFound } from "next/navigation";
import {
  OwnCompanyDetail,
  type OwnCompanyDetailData,
} from "@/components/master/own-companies/OwnCompanyDetail";
import { requireAppRead } from "@/lib/authz-page";
import { prisma } from "@/lib/db";
import { type LocalizedText, localized } from "@/lib/format";
import { issuerBlock } from "@/lib/own-company-core";

export const dynamic = "force-dynamic";

/** 自社法人 詳細 (MS2I). */
export default async function MasterOwnCompaniesDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const denied = await requireAppRead("master-own-companies");
  if (denied) return denied;
  const { id: idParam } = await params;
  const id = Number(idParam);
  if (!Number.isInteger(id)) notFound();
  const r = await prisma.ownCompany.findUnique({
    where: { id },
    include: {
      plants: {
        orderBy: { code: "asc" },
        select: { id: true, code: true, name: true, isActive: true },
      },
    },
  });
  if (!r) notFound();
  // 自社法人が未設定の拠点は既定の法人として扱う — 既定の法人の拠点タブにも並べる
  // （一覧の拠点数と同じ数え方。並べないと、割り当て前の拠点がどこにも出ない）。
  const unassigned = r.isDefault
    ? await prisma.plant.findMany({
        where: { ownCompanyId: null },
        orderBy: { code: "asc" },
        select: { id: true, code: true, name: true, isActive: true },
      })
    : [];
  const plants = [...r.plants, ...unassigned].sort((a, b) =>
    a.code.localeCompare(b.code),
  );

  const name = r.name as LocalizedText | null;
  const address = r.address as LocalizedText | null;
  // 書類にどう刷られるか（PDF の発行元ブロックと同じ関数）。
  const preview = issuerBlock(
    {
      id: r.id,
      code: r.code,
      name,
      postalCode: r.postalCode,
      address,
      phone: r.phone,
      fax: r.fax,
      invoiceRegistrationNo: r.invoiceRegistrationNo,
      sealFileId: r.sealFileId,
      isDefault: r.isDefault,
    },
    "ja",
  );

  const record: OwnCompanyDetailData = {
    id: r.id,
    code: r.code,
    nameJa: name?.ja ?? "",
    nameEn: name?.en ?? "",
    nameKana: r.nameKana ?? "",
    postalCode: r.postalCode ?? "",
    addressJa: address?.ja ?? "",
    addressEn: address?.en ?? "",
    phone: r.phone ?? "",
    fax: r.fax ?? "",
    email: r.email ?? "",
    invoiceRegistrationNo: r.invoiceRegistrationNo ?? "",
    bankName: r.bankName ?? "",
    bankBranch: r.bankBranch ?? "",
    bankAccountType: r.bankAccountType ?? "",
    bankAccountNumber: r.bankAccountNumber ?? "",
    bankAccountHolder: r.bankAccountHolder ?? "",
    fiscalYearStartMonth: r.fiscalYearStartMonth,
    hasSeal: r.sealFileId != null,
    sealVersion: r.sealFileId,
    isDefault: r.isDefault,
    isActive: r.isActive,
    notes: r.notes ?? "",
    plants: plants.map((p) => ({
      id: p.id,
      code: p.code,
      name: localized(p.name as LocalizedText | null),
      isActive: p.isActive,
    })),
    issuerPreview: preview,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };

  return <OwnCompanyDetail record={record} />;
}
