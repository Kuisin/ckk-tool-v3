"use client";

/**
 * ご利用案内 PDF を開くボタン（SY0H）。
 *
 * 素の `<a href>` にしないのは、発行を断られる場合があるから（未有効化の
 * アカウント・アカウントが 1 つも無い取引先）。リンクのままだと**空白の
 * タブが開いて JSON が出る**ので、先に取りに行って、断られたら理由を通知で
 * 出し、成功したときだけ新しいタブへ渡す。
 *
 * 取ってきた PDF は Blob URL にして開く（同じ URL を 2 度呼ばない）。
 */

import { notifications } from "@mantine/notifications";
import { IconFileTypePdf } from "@tabler/icons-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { SecondaryButton } from "@/components/ui/buttons";

/** 発行できなかった理由（route が返す鍵）→ 画面の文言。 */
const ERROR_KEYS = new Set([
  "settings.portalGuide.accountNotFound",
  "settings.portalGuide.activateBeforeIssuing",
  "settings.portalGuide.noActiveAccounts",
]);

export function PortalGuideButton({
  accountId,
  bpId,
  label,
  compact = false,
}: {
  /** どちらか一方。account = その 1 名ぶん / bp = 取引先の全員ぶん。 */
  accountId?: string;
  bpId?: string;
  label: string;
  compact?: boolean;
}) {
  const tr = useTranslations();
  const [loading, setLoading] = useState(false);

  async function open() {
    setLoading(true);
    try {
      const query = accountId
        ? `account=${encodeURIComponent(accountId)}`
        : `bp=${encodeURIComponent(bpId ?? "")}`;
      const res = await fetch(`/api/pdf/portal-guide?${query}`);
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        const key = body?.error ?? "";
        notifications.show({
          color: "red",
          title: tr("common.error2"),
          // 未知の理由はそのまま出さない（訳の無い鍵を利用者に見せない）。
          message: ERROR_KEYS.has(key)
            ? tr(key)
            : tr("settings.portalGuide.couldNotIssueTheGuide"),
        });
        return;
      }
      const url = URL.createObjectURL(await res.blob());
      window.open(url, "_blank", "noopener");
      // 開いたタブが読み終えるまでは残す必要があるので、すぐには revoke しない。
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch {
      notifications.show({
        color: "red",
        title: tr("common.error2"),
        message: tr("settings.portalGuide.couldNotIssueTheGuide"),
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <SecondaryButton
      leftSection={<IconFileTypePdf size={14} />}
      loading={loading}
      onClick={open}
      size={compact ? "compact-xs" : "sm"}
    >
      {label}
    </SecondaryButton>
  );
}
