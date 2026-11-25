import "server-only";

/**
 * own-companies.ts — 自社法人（書類の発行元）の読み出し。server-only.
 *
 * 決め方そのもの（拠点 → 法人、無ければ既定）は lib/own-company-core.ts が
 * 唯一の定義元で、ここは DB から候補を集めて渡すだけ。
 */

import { prisma } from "@/lib/db";
import type { DocKey } from "@/lib/doc-number";
import type { LocalizedTextInput } from "@/lib/format";
import type { Locale } from "@/lib/i18n";
import { label } from "@/lib/messages";
import {
  type IssuerBlock,
  issuerBlock,
  type OwnCompanyRecord,
  resolveIssuer,
  resolveOwnCompanyId,
} from "@/lib/own-company-core";
import { companyStampImg } from "@/lib/pdf-stamp";
import { getObject } from "@/lib/storage";

/** 全法人（無効も含む — 過去の書類は無効化した法人で刷られ続ける）。 */
export async function loadOwnCompanies(): Promise<OwnCompanyRecord[]> {
  const rows = await prisma.ownCompany.findMany({ orderBy: { id: "asc" } });
  return rows.map((r) => ({
    id: r.id,
    code: r.code,
    name: r.name as LocalizedTextInput | null,
    postalCode: r.postalCode,
    address: r.address as LocalizedTextInput | null,
    phone: r.phone,
    fax: r.fax,
    invoiceRegistrationNo: r.invoiceRegistrationNo,
    sealFileId: r.sealFileId,
    isDefault: r.isDefault,
  }));
}

/** 既定の法人の id（無ければ null）。 */
export async function defaultOwnCompanyId(): Promise<number | null> {
  const row = await prisma.ownCompany.findFirst({
    where: { isDefault: true },
    select: { id: true },
  });
  return row?.id ?? null;
}

/** 書類 1 通の発行元: ブロック（テンプレートへ渡す形）と法人の行。 */
export interface ResolvedIssuer {
  issuer: IssuerBlock;
  company: OwnCompanyRecord | null;
}

/** 法人 id（null = 既定）→ 発行元。 */
export async function issuerForCompanyId(
  companyId: number | null | undefined,
  lang: Locale,
): Promise<ResolvedIssuer> {
  const companies = await loadOwnCompanies();
  const company = resolveIssuer(companyId, companies);
  return { issuer: issuerBlock(company, lang), company };
}

/**
 * 納品書の発行元 — 出荷書の出荷元拠点が先、無ければ明細の注文明細の担当拠点。
 * どちらも無ければ既定の法人（= 自社法人マスタ導入前と同じ発行元）。
 */
export async function issuerForDeliveryNote(
  key: DocKey,
  lang: Locale,
): Promise<ResolvedIssuer> {
  const row = await prisma.deliveryNote.findUnique({
    where: { yearMonth_seq: { yearMonth: key.yearMonth, seq: key.seq } },
    select: {
      deliveryOrder: {
        select: {
          fromPlant: { select: { ownCompanyId: true } },
          items: {
            orderBy: { sortOrder: "asc" },
            select: {
              orderLine: {
                select: { assignedPlant: { select: { ownCompanyId: true } } },
              },
            },
          },
        },
      },
    },
  });
  const order = row?.deliveryOrder;
  const companyId = resolveOwnCompanyId(
    [
      order?.fromPlant?.ownCompanyId,
      ...(order?.items ?? []).map(
        (it) => it.orderLine?.assignedPlant?.ownCompanyId,
      ),
    ],
    null,
  );
  return issuerForCompanyId(companyId, lang);
}

/**
 * 出荷書 1 件の法人 id（請求書の束ね・スナップショット用）。決め方は
 * 納品書と同じ（出荷元拠点 → 明細の担当拠点 → 既定）。
 */
export function shipmentOwnCompanyId(
  shipment: {
    fromPlant?: { ownCompanyId: number | null } | null;
    items: {
      orderLine?: {
        assignedPlant?: { ownCompanyId: number | null } | null;
      } | null;
    }[];
  },
  defaultId: number | null,
): number | null {
  return resolveOwnCompanyId(
    [
      shipment.fromPlant?.ownCompanyId,
      ...shipment.items.map((it) => it.orderLine?.assignedPlant?.ownCompanyId),
    ],
    defaultId,
  );
}

/**
 * 社印。法人が自分の印影を持っていればそれ、無ければ**既定の法人だけ**同梱の
 * 印影（従来の画像）へ落ちる — 他の法人の書類に CKK の印を押さないため。
 * 発行前（approved=false）は常に空（lib/pdf-stamp.ts と同じ約束）。
 */
export async function ownCompanyStampImg(
  company: OwnCompanyRecord | null,
  approved: boolean,
  lang: Locale,
): Promise<string> {
  if (!approved) return "";
  if (company?.sealFileId) {
    const file = await prisma.file.findUnique({
      where: { id: company.sealFileId },
      select: { storageKey: true, mimeType: true },
    });
    const bytes = file ? await getObject(file.storageKey) : null;
    if (file && bytes) {
      const src = `data:${file.mimeType};base64,${Buffer.from(bytes).toString("base64")}`;
      const alt = label("pdf.stamp.companySeal", lang, "社印"); // i18n-ignore
      return `<img class="stamp-img" src="${src}" alt="${alt}" />`;
    }
  }
  if (company == null || company.isDefault) {
    return companyStampImg(true, lang);
  }
  return "";
}
