"use client";

/**
 * IssueQuoteModal — 見積書 発行（DRAFT → ISSUED）.
 *
 * **順序が重要** — まず `onIssue`（issueQuote Server Action）で状態を ISSUED に
 * してから PDF を生成する。PDF ルートは未発行（DRAFT）の見積書を 403 で拒否する
 * ため、逆順だと必ず生成に失敗する。生成された PDF（Gotenberg → SeaweedFS）は
 * 詳細ページの「PDF」タブで閲覧できる。
 *
 * メール送付（任意）は **PDF の保存が済んでから**送る。メールに PDF は付けず、
 * 宛先に束縛した書類リンク（開くと確認コード）を載せる（lib/quote-mail.ts）—
 * リンク先で顧客が保存済みの PDF を開く。宛先は開いたときにサーバーへ
 * 問い合わせて表示し、送れない（宛先なし・送信口なし・ポータル無効）ときは
 * チェックを外して理由を出す。
 */

import { Checkbox, Stack, Text } from "@mantine/core";
import { DatePickerInput } from "@mantine/dates";
import { notifications } from "@mantine/notifications";
import { IconCalendar } from "@tabler/icons-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import {
  emailQuote,
  previewQuoteMail,
} from "@/app/(dashboard)/sales/quotes/actions";
import { type ModalBaseProps, ModalShell } from "@/components/ui/modals";
import type { PdfFileMeta } from "@/components/ui/PdfAttachmentPanel";

export function IssueQuoteModal({
  opened,
  onClose,
  quoteId,
  quoteNumber,
  defaultValidUntil,
  onIssue,
  onIssued,
}: ModalBaseProps & {
  quoteId: string;
  quoteNumber: string;
  defaultValidUntil: string | null;
  /** 発行（Server Action）。成功 = true のときだけ PDF を生成する。 */
  onIssue: (validUntil: string | null) => Promise<boolean>;
  /** 発行 + PDF 生成後に呼ぶ（meta は生成できなかった場合 null）。 */
  onIssued: (pdf: PdfFileMeta | null) => void;
}) {
  const tr = useTranslations();
  const [validUntil, setValidUntil] = useState<string | null>(
    defaultValidUntil,
  );
  const [sendMail, setSendMail] = useState(false);
  const [loading, setLoading] = useState(false);
  // 宛先の確認結果。null = 問い合わせ中。
  const [recipient, setRecipient] = useState<
    { name: string; email: string } | { reason: string } | null
  >(null);

  useEffect(() => {
    if (!opened) return;
    let alive = true;
    setRecipient(null);
    void previewQuoteMail(quoteNumber).then((r) => {
      if (!alive) return;
      const value = r.ok ? r.data : { reason: r.error };
      setRecipient(value);
      setSendMail("email" in value);
    });
    return () => {
      alive = false;
    };
  }, [opened, quoteNumber]);

  const canMail = recipient != null && "email" in recipient;

  const issue = async () => {
    setLoading(true);
    // 1) 発行（失敗時は呼び出し側がエラー通知を出す — モーダルは開いたまま）。
    const issued = await onIssue(validUntil);
    if (!issued) {
      setLoading(false);
      return;
    }
    // 2) PDF 生成: route が Gotenberg でレンダリングし SeaweedFS に保存する。
    let meta: PdfFileMeta | null = null;
    try {
      const res = await fetch(
        `/api/pdf/quote?id=${encodeURIComponent(quoteId)}`,
      );
      if (!res.ok) throw new Error(`PDF route ${res.status}`);
      const blob = await res.blob();
      meta = { sizeBytes: blob.size, generatedAt: new Date().toISOString() };
      notifications.show({
        title: tr("common.issued"),
        message: tr("sales.issueQuoteModal.issuedAndSaved", {
          number: quoteNumber,
        }),
        color: "green",
      });
      // 3) メール送付（PDF が保存できたときだけ）。失敗しても発行は済んでいる
      //    ので、詳細画面の「メールで送付」から送り直せると案内する。
      if (sendMail && canMail) {
        const mailed = await emailQuote(quoteNumber);
        notifications.show(
          mailed.ok
            ? {
                title: tr("sales.issueQuoteModal.mailSentTitle"),
                message: tr("sales.issueQuoteModal.mailSent", {
                  email: mailed.data.to,
                }),
                color: "green",
              }
            : {
                title: tr("sales.issueQuoteModal.mailFailed"),
                message: mailed.error,
                color: "orange",
              },
        );
      }
    } catch {
      notifications.show({
        title: tr("sales.quotes.issuedPdfGenerationFailed"),
        message: tr("sales.quotes.pDFGenerationFailedYouCanRetry"),
        color: "orange",
      });
    } finally {
      setLoading(false);
    }
    onIssued(meta);
    onClose();
  };

  return (
    <ModalShell
      confirmColor="blue"
      confirmLabel={tr("common.issue")}
      loading={loading}
      onClose={onClose}
      onConfirm={issue}
      opened={opened}
      size="sm"
      title={tr("sales.quotes.issueTheQuote")}
    >
      <Stack gap="sm">
        <Text size="sm">
          {tr("sales.issueQuoteModal.confirmIssueMessage", {
            number: quoteNumber,
          })}
        </Text>
        <DatePickerInput
          clearable
          label={tr("common.validUntil2")}
          leftSection={<IconCalendar size={14} />}
          onChange={setValidUntil}
          placeholder={tr("common.pickADate")}
          value={validUntil}
          valueFormat="YYYY/MM/DD"
        />
        <Checkbox
          checked={sendMail}
          description={
            recipient == null
              ? undefined
              : "email" in recipient
                ? tr("sales.issueQuoteModal.sendTo", {
                    name: recipient.name,
                    email: recipient.email,
                  })
                : recipient.reason
          }
          disabled={!canMail}
          label={tr("sales.quotes.emailItToTheCustomerOnce")}
          onChange={(e) => setSendMail(e.currentTarget.checked)}
        />
      </Stack>
    </ModalShell>
  );
}
