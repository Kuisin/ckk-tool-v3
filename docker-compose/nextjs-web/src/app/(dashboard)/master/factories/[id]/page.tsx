import { notFound } from "next/navigation";
import {
  FactoryDetail,
  type FactoryDetailData,
} from "@/components/master/factories/FactoryDetail";
import { fetchAuditEntries } from "@/lib/audit";
import { prisma } from "@/lib/db";
import type { LocalizedText } from "@/lib/format";

export const dynamic = "force-dynamic";

/** 工場 詳細 (MS2B). */
export default async function MasterFactoriesDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: idParam } = await params;
  const id = Number(idParam);
  if (!Number.isInteger(id)) notFound();
  const [r, auditEntries] = await Promise.all([
    prisma.factory.findUnique({ where: { id } }),
    fetchAuditEntries("factories", String(id)),
  ]);
  if (!r) notFound();

  const name = r.name as LocalizedText | null;
  const address = r.address as LocalizedText | null;

  const record: FactoryDetailData = {
    id: r.id,
    code: r.code,
    nameJa: name?.ja ?? "",
    nameEn: name?.en ?? "",
    nameKana: r.nameKana ?? "",
    countryCode: r.countryCode,
    postalCode: r.postalCode ?? "",
    addressJa: address?.ja ?? "",
    addressEn: address?.en ?? "",
    phone: r.phone ?? "",
    email: r.email ?? "",
    contactPerson: r.contactPerson ?? "",
    isActive: r.isActive,
    notes: r.notes ?? "",
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };

  return <FactoryDetail auditEntries={auditEntries} record={record} />;
}
