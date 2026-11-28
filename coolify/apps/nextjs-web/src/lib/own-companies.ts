import "server-only";

/**
 * own-companies.ts — 自社法人（書類の発行元）の読み出し。server-only.
 *
 * 決め方そのもの（拠点 → 法人、無ければ既定）は lib/own-company-core.ts が
 * 唯一の定義元で、ここは DB から候補を集めて渡すだけ。
 */

import { prisma } from "@/lib/db";
import type { DocKey } from "@/lib/doc-number";
import { toDocRef } from "@/lib/doc-ref";
import type { LocalizedTextInput } from "@/lib/format";
import type { Locale } from "@/lib/i18n";
import { label } from "@/lib/messages";
import {
  BUNDLED_LOGO_FILE,
  brandLogoHtml,
  brandLogoSource,
  type IssuerBlock,
  issuerBlock,
  type OwnCompanyRecord,
  resolveIssuer,
  resolveOwnCompanyId,
} from "@/lib/own-company-core";
import type { PdfAsset } from "@/lib/pdf";
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
    logoFileId: r.logoFileId,
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
 * 見積書の発行元 — 見積書が持つ法人（作成時に決めた own_company_id）。
 * 見積書は拠点を持たないので、法人は作成フォームの「発行会社」で決まる。
 */
export async function issuerForQuote(
  key: DocKey,
  lang: Locale,
): Promise<ResolvedIssuer> {
  const row = await prisma.quote.findUnique({
    where: { docRef: key.docRef },
    select: { ownCompanyId: true },
  });
  return issuerForCompanyId(row?.ownCompanyId, lang);
}

/**
 * 設計依頼書の発行元 — 依頼書が持つ法人（見積書 / 注文請書から継いだもの）。
 * `requestNumber` は id（`CKK~DSG-…`）・参照・番号だけ・旧番号のどれでもよい。
 * 番号だけで 2 つの法人に当たるとき・見つからないときは既定の法人。
 */
export async function issuerForDesignRequest(
  requestNumber: string,
  lang: Locale,
): Promise<ResolvedIssuer> {
  const docRef = await toDocRef("design_requests", requestNumber).catch(
    () => null,
  );
  const row = docRef
    ? await prisma.designRequest.findUnique({
        where: { docRef },
        select: { ownCompanyId: true },
      })
    : null;
  return issuerForCompanyId(row?.ownCompanyId, lang);
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
    where: { docRef: key.docRef },
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

/** PDF 見出しのロゴ: テンプレートの `{{{brand_logo}}}` と、一緒に送るファイル。 */
export interface BrandLogo {
  /** `<img class="brand-logo" …>`。刷らないときは空文字。 */
  html: string;
  /** renderPdf の `assets` に渡す（同梱の logo.svg は renderPdf が自分で送る）。 */
  assets: PdfAsset[];
}

const LOGO_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
};

/**
 * その書類の法人のロゴ。決め方は lib/own-company-core.ts brandLogoSource —
 * 自分のロゴ → （既定の法人だけ）同梱の logo.svg → 刷らない。
 *
 * **画像が読めなくても帳票は止めない**（SeaweedFS が落ちている・オブジェクトが
 * 消えた）。そのときは「ロゴを持たない法人」と同じ扱いに落ちる — 社印
 * （ownCompanyStampImg）と同じ考え方。alt はその法人の名前（受取先の言語）。
 */
export async function ownCompanyLogo(
  company: OwnCompanyRecord | null,
  lang: Locale,
): Promise<BrandLogo> {
  const alt = issuerBlock(company, lang).name;
  if (company?.logoFileId) {
    const file = await prisma.file
      .findUnique({
        where: { id: company.logoFileId },
        select: { storageKey: true, mimeType: true },
      })
      .catch(() => null);
    const ext = file ? LOGO_EXT[file.mimeType] : undefined;
    const bytes =
      file && ext ? await getObject(file.storageKey).catch(() => null) : null;
    if (file && ext && bytes) {
      const filename = `company-logo.${ext}`;
      return {
        html: brandLogoHtml(filename, alt),
        assets: [{ filename, data: bytes, type: file.mimeType }],
      };
    }
  }
  const source = brandLogoSource(company, false);
  return {
    html: brandLogoHtml(source === "bundled" ? BUNDLED_LOGO_FILE : null, alt),
    assets: [],
  };
}

/**
 * 指示書に属する紙（検査表・検査記録）のロゴ — 指示書の法人。指示書の無い
 * 白紙（マスタからの印刷）は既定の法人。社内の紙なので ja。
 */
export async function ownCompanyLogoForWorkOrder(
  workOrderNumber: number | null | undefined,
): Promise<BrandLogo> {
  const row =
    workOrderNumber != null
      ? await prisma.workOrder.findUnique({
          where: { workOrderNumber },
          select: { ownCompanyId: true },
        })
      : null;
  const { company } = await issuerForCompanyId(row?.ownCompanyId, "ja");
  return ownCompanyLogo(company, "ja");
}
