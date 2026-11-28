import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { TrialEstimateDetail } from "@/components/sales/trial-estimates/TrialEstimateDetail";
import type { LinkedPriceEntry } from "@/components/sales/trial-estimates/types";
import { appLabelForKey } from "@/lib/app-list";
import { fetchAuditEntries } from "@/lib/audit";
import { checkPermission } from "@/lib/authz";
import { requireAppRead } from "@/lib/authz-page";
import { prisma } from "@/lib/db";
import { docIdOf, docNo, formatProductNumber } from "@/lib/doc-number";
import { docKeyFromParam } from "@/lib/doc-param";
import { listMemos } from "@/lib/document-memos";
import {
  ESTIMATE_COST_PERMISSION,
  withoutCost,
  withoutCostFlags,
} from "@/lib/estimate-cost";
import { type LocalizedText, localized } from "@/lib/format";
import { fetchPriceHistoryByType } from "@/lib/material-pricing";
import { formatDocPageTitle } from "@/lib/page-title";
import { getScalePreset } from "@/lib/price-scale-preset-store";
import { getTrialPricingSettings } from "@/lib/system-settings";
import {
  toToolTypeOptions,
  toTrialPricingOptions,
} from "@/lib/trial-pricing-settings";
import { getServerLocale } from "@/lib/user-preferences";
import { fetchTrialEstimate } from "../data";

export const dynamic = "force-dynamic";

/** 未認証スクレイパ向けの汎用 OG（種別+番号のみ、業務データなし）。 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const locale = await getServerLocale();
  return {
    title: formatDocPageTitle(
      appLabelForKey("trial-estimates", "価格試算", locale), // i18n-ignore — ja はそのまま使う（訳の実体は appLabelForKey 内の en/zh マップ）
      docNo(decodeURIComponent(id)),
    ),
  };
}

/** 価格試算 詳細 (SA52). URL id = 法人コード付きの番号（CKK~EST-2026-00001）。 */
export default async function TrialEstimateDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const denied = await requireAppRead("trial-estimates");
  if (denied) return denied;
  const { id } = await params;
  const key = await docKeyFromParam(
    "estimates",
    "EST",
    id,
    "/sales/trial-estimates",
    "",
    searchParams,
  );

  const [
    record,
    linked,
    auditEntries,
    settings,
    memos,
    tr,
    scalePreset,
    costAuthz,
  ] = await Promise.all([
    fetchTrialEstimate(key),
    prisma.priceListVariant.findMany({
      where: { estimate: { docRef: key.docRef } },
      include: {
        entry: { include: { customerBp: true, item: true } },
        _count: { select: { tiers: true } },
      },
    }),
    fetchAuditEntries("estimates", key.docRef),
    getTrialPricingSettings(),
    listMemos("estimates", key.docRef),
    getTranslations(),
    getScalePreset(),
    checkPermission(ESTIMATE_COST_PERMISSION, "READ"),
  ]);
  if (!record) notFound();
  // 原価を見られない人には、画面の行を消すだけでなく値ごと渡さない。
  const canViewCost = costAuthz.ok;
  const pricingOptions = toTrialPricingOptions(settings);

  const typeId = Number(record.materialTypeId);
  const priceHistory =
    Number.isInteger(typeId) &&
    typeId > 0 &&
    record.diameterCode &&
    record.surfaceFinishCode
      ? await fetchPriceHistoryByType({
          materialTypeId: typeId,
          diameterCode: record.diameterCode,
          surfaceFinishCode: record.surfaceFinishCode,
        })
      : [];

  const linkedEntries: LinkedPriceEntry[] = linked.map((v) => {
    const code = formatProductNumber(
      v.entry.item?.yearMonth ?? null,
      v.entry.item?.seq ?? null,
    );
    const nm = localized(v.entry.item?.name as LocalizedText | null);
    return {
      entryId: docIdOf(v.entry),
      customerName: localized(v.entry.customerBp.name as LocalizedText | null),
      productName: code ? `${nm} ${code}` : nm,
      orderType: v.orderType,
      tierCount: v._count.tiers,
    };
  });

  return (
    <TrialEstimateDetail
      auditEntries={auditEntries}
      canViewCost={canViewCost}
      linkedEntries={linkedEntries}
      memos={memos}
      priceHistory={priceHistory}
      pricingOptions={
        canViewCost
          ? pricingOptions
          : {
              ...pricingOptions,
              criteria: pricingOptions.criteria
                ? withoutCostFlags(pricingOptions.criteria)
                : undefined,
            }
      }
      record={
        canViewCost || !record.resultSnapshot
          ? record
          : { ...record, resultSnapshot: withoutCost(record.resultSnapshot) }
      }
      scalePreset={scalePreset}
      toolTypeOptions={toToolTypeOptions(settings, tr)}
    />
  );
}
