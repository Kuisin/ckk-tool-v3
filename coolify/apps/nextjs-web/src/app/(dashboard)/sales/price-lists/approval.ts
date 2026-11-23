/**
 * approval.ts — 価格表の「独自値の追加承認」（承認設定 MS0B）。server-only.
 *
 * 価格表は通常の承認フローを持たない。**価格試算から引き継いでいない価格**
 * （手動の基準単価・見積単価と違う基準単価・段階単価の上書き）を持つときだけ、
 * 独自値の追加承認の段を通る。保存（作成・編集・コピー）のたびにここを呼び、
 * 独自値を数え直して承認の要否を決める — 判定は lib/custom-value-approval-core.ts。
 *
 * 承認待ち（PENDING）・差し戻し（REJECTED）の価格表は価格の解決に使われない
 * （components/sales/quotes/model.ts resolvePriceFromEntries）。
 */

import { getTranslations } from "next-intl/server";
import {
  cancelApprovalFlow,
  hasCustomValueSteps,
  startApprovalFlow,
} from "@/lib/approvals";
import { recordAudit } from "@/lib/audit";
import {
  customValueSignature,
  decideCustomValueApproval,
  type PriceListApprovalStatus,
  type PriceListCustomValue,
  priceListCustomValues,
} from "@/lib/custom-value-approval-core";
import { prisma } from "@/lib/db";
import {
  type DocKey,
  formatEstimateNumber,
  formatPriceListNumber,
} from "@/lib/doc-number";
import { fetchEstimateBases } from "./data";

export interface PriceEntryApprovalSync {
  status: PriceListApprovalStatus;
  /** 今回の保存で承認を（やり直して）依頼したか。 */
  requested: boolean;
  /** 依頼が作れなかったときの理由（保存自体は済んでいる）。 */
  error?: string;
}

/** 価格表 1 件の独自値（保存済みの内容から数える）。 */
export async function loadPriceEntryCustomValues(
  key: DocKey,
): Promise<PriceListCustomValue[] | null> {
  const row = await prisma.priceListEntry.findUnique({
    where: { yearMonth_seq: key },
    select: {
      variants: {
        select: {
          orderType: true,
          isActive: true,
          baseUnitPrice: true,
          estimateYearMonth: true,
          estimateSeq: true,
          tiers: {
            select: {
              minQuantity: true,
              maxQuantity: true,
              priceOverride: true,
            },
          },
        },
      },
    },
  });
  if (!row) return null;
  const numberOf = (v: (typeof row.variants)[number]) =>
    v.estimateYearMonth && v.estimateSeq != null
      ? formatEstimateNumber({
          yearMonth: v.estimateYearMonth,
          seq: v.estimateSeq,
        })
      : null;
  const bases = await fetchEstimateBases(
    row.variants.map(numberOf).filter((n): n is string => n != null),
  );
  return priceListCustomValues(
    row.variants.map((v) => {
      const estimateNumber = numberOf(v);
      return {
        orderType: v.orderType,
        isActive: v.isActive,
        baseUnitPrice: Number(v.baseUnitPrice),
        estimateNumber,
        estimateBase: estimateNumber ? (bases[estimateNumber] ?? null) : null,
        tiers: v.tiers.map((t) => ({
          minQuantity: t.minQuantity,
          maxQuantity: t.maxQuantity,
          priceOverride:
            t.priceOverride == null ? null : Number(t.priceOverride),
        })),
      };
    }),
  );
}

/**
 * 保存後に呼ぶ。独自値を数え直し、承認不要なら取り下げ、変わっていれば
 * 依頼し直す。保存そのものは済んでいるので、依頼に失敗しても例外にせず理由を
 * 返す — 価格表は PENDING のまま（= 価格の解決に使われない）残り、もう一度
 * 保存するか「承認依頼」を押せば依頼が作られる。
 */
export async function syncPriceEntryApproval(
  key: DocKey,
): Promise<PriceEntryApprovalSync> {
  const entryNumber = formatPriceListNumber(key);
  const [entry, values, layerConfigured] = await Promise.all([
    prisma.priceListEntry.findUnique({
      where: { yearMonth_seq: key },
      select: { approvalStatus: true, customValueSignature: true },
    }),
    loadPriceEntryCustomValues(key),
    hasCustomValueSteps("price_list_entries"),
  ]);
  if (!entry || !values) return { status: "NONE", requested: false };
  const status = entry.approvalStatus as PriceListApprovalStatus;
  const nextSignature = customValueSignature(values);
  const decision = decideCustomValueApproval({
    status,
    signature: entry.customValueSignature,
    nextSignature,
    layerConfigured,
  });

  if (decision.kind === "keep") return { status, requested: false };

  if (decision.kind === "clear") {
    if (status === "NONE" && entry.customValueSignature == null)
      return { status, requested: false };
    await cancelApprovalFlow({
      targetType: "price_list_entries",
      targetId: entryNumber,
    });
    await prisma.priceListEntry.update({
      where: { yearMonth_seq: key },
      data: { approvalStatus: "NONE", customValueSignature: null },
    });
    await recordAudit({
      action: "UPDATE",
      tableName: "price_list_entries",
      recordId: entryNumber,
      before: { approvalStatus: status },
      after: { approvalStatus: "NONE" },
    });
    return { status: "NONE", requested: false };
  }

  // request — 古い依頼（進行中なら）を取り下げてから 1 段目を作り直す。
  // 先に PENDING へ倒し、指紋は依頼が成立してから書く: 依頼に失敗しても
  // 承認されていない独自値が価格の解決に流れず、次の保存で依頼し直される。
  await cancelApprovalFlow({
    targetType: "price_list_entries",
    targetId: entryNumber,
  });
  await prisma.priceListEntry.update({
    where: { yearMonth_seq: key },
    data: { approvalStatus: "PENDING", customValueSignature: null },
  });
  const started = await startApprovalFlow({
    targetType: "price_list_entries",
    targetId: entryNumber,
    customValues: true,
  });
  if (!started.ok) {
    const tr = await getTranslations();
    return {
      status: "PENDING",
      requested: false,
      error: started.error ?? tr("common.approvalRequestFailed"),
    };
  }
  await prisma.priceListEntry.update({
    where: { yearMonth_seq: key },
    data: { customValueSignature: nextSignature },
  });
  await recordAudit({
    action: "UPDATE",
    tableName: "price_list_entries",
    recordId: entryNumber,
    before: { approvalStatus: status },
    after: {
      approvalStatus: "PENDING",
      customValues: values,
    },
  });
  return { status: "PENDING", requested: true };
}
