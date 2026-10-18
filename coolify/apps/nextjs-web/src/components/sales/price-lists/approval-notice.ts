/**
 * approval-notice.ts — 価格表を保存したあとの「独自値の追加承認」の知らせ。
 *
 * 承認依頼は保存のたびに自動で出る（app/(dashboard)/sales/price-lists/approval.ts）。
 * 出したこと・出せなかったことを利用者が知らないと、見積書で価格が引けない
 * 理由が分からないので、保存の完了通知とは別にもう 1 枚出す。
 */

import { notifications } from "@mantine/notifications";
import type { PriceEntrySaveResult } from "@/app/(dashboard)/sales/price-lists/actions";
import type { Tr } from "@/lib/i18n";

export function notifyPriceEntryApproval(
  result: PriceEntrySaveResult,
  tr: Tr,
): void {
  if (result.approvalError) {
    notifications.show({
      title: tr("common.error2"),
      message: tr("sales.priceLists.approvalRequestFailedOnSave", {
        error: result.approvalError,
      }),
      color: "orange",
    });
  } else if (result.approvalRequested) {
    notifications.show({
      title: tr("common.approvalRequested"),
      message: tr("sales.priceLists.approvalRequestedOnSave"),
      color: "blue",
    });
  }
}
