import { notFound } from "next/navigation";
import { PlantForm } from "@/components/master/plants/PlantForm";
import { requireAppRead } from "@/lib/authz-page";
import { prisma } from "@/lib/db";
import type { LocalizedText } from "@/lib/format";
import { fetchRegionOptions } from "../../data";

export const dynamic = "force-dynamic";

/** 拠点 編集 (MS2B edit). */
export default async function MasterPlantsEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const denied = await requireAppRead("master-plants");
  if (denied) return denied;
  const { id: idParam } = await params;
  const id = Number(idParam);
  if (!Number.isInteger(id)) notFound();
  const [r, regionOptions] = await Promise.all([
    prisma.plant.findUnique({ where: { id } }),
    fetchRegionOptions(),
  ]);
  if (!r) notFound();

  const name = r.name as LocalizedText | null;
  const address = r.address as LocalizedText | null;

  return (
    <PlantForm
      initial={{
        id: r.id,
        code: r.code,
        nameJa: name?.ja ?? "",
        nameEn: name?.en ?? "",
        nameKana: r.nameKana ?? "",
        countryCode: r.countryCode,
        regionId: r.regionId,
        postalCode: r.postalCode ?? "",
        addressJa: address?.ja ?? "",
        addressEn: address?.en ?? "",
        phone: r.phone ?? "",
        email: r.email ?? "",
        contactPerson: r.contactPerson ?? "",
        isActive: r.isActive,
        notes: r.notes ?? "",
      }}
      regionOptions={regionOptions}
    />
  );
}
