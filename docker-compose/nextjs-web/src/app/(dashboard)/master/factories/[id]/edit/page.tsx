import { notFound } from "next/navigation";
import { FactoryForm } from "@/components/master/factories/FactoryForm";
import { prisma } from "@/lib/db";
import type { LocalizedText } from "@/lib/format";

export const dynamic = "force-dynamic";

/** 工場 編集 (MS2B edit). */
export default async function MasterFactoriesEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: idParam } = await params;
  const id = Number(idParam);
  if (!Number.isInteger(id)) notFound();
  const r = await prisma.factory.findUnique({ where: { id } });
  if (!r) notFound();

  const name = r.name as LocalizedText | null;
  const address = r.address as LocalizedText | null;

  return (
    <FactoryForm
      initial={{
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
      }}
    />
  );
}
