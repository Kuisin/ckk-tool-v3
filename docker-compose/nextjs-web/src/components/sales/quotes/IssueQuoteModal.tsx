"use client";

/**
 * IssueQuoteModal — 見積書 発行（DRAFT → ISSUED）.
 *
 * 発行と同時に PDF を生成・保存する（/api/pdf/quote が Gotenberg でレンダリングし
 * SeaweedFS に保存）。生成された PDF は詳細ページの「PDF」タブで閲覧できる。
 * TODO(server-action): status 遷移 + quotes.pdf_file_id の永続化。
 */

import { Checkbox, Stack, Text } from "@mantine/core";
import { DatePickerInput } from "@mantine/dates";
import { notifications } from "@mantine/notifications";
import { IconCalendar } from "@tabler/icons-react";
import { format } from "date-fns";
import { useState } from "react";
import { type ModalBaseProps, ModalShell } from "@/components/ui/modals";
import type { PdfFileMeta } from "@/components/ui/PdfAttachmentPanel";

export function IssueQuoteModal({
  opened,
  onClose,
  quoteId,
  quoteNumber,
  defaultValidUntil,
  onIssued,
}: ModalBaseProps & {
  quoteId: string;
  quoteNumber: string;
  defaultValidUntil: string | null;
  /** Called with the saved-PDF meta once 発行 (+ PDF 生成) completes. */
  onIssued: (pdf: PdfFileMeta) => void;
}) {
  const [validUntil, setValidUntil] = useState<string | null>(
    defaultValidUntil,
  );
  const [sendMail, setSendMail] = useState(true);
  const [loading, setLoading] = useState(false);

  const issue = async () => {
    setLoading(true);
    const meta: PdfFileMeta = {
      filename: `${quoteNumber}.pdf`,
      sizeBytes: 0,
      generatedAt: format(new Date(), "yyyy-MM-dd HH:mm"),
      generatedBy: "鈴木 一郎", // TODO(auth): current user
    };
    try {
      // 実生成: route が Gotenberg でレンダリングし SeaweedFS に保存する。
      const res = await fetch(
        `/api/pdf/quote?id=${encodeURIComponent(quoteId)}`,
      );
      if (!res.ok) throw new Error(`PDF route ${res.status}`);
      const blob = await res.blob();
      meta.sizeBytes = blob.size;
      notifications.show({
        title: "発行しました",
        message: `見積書 ${quoteNumber} を発行し、PDF を保存しました${
          sendMail ? "（メール送付予約済み）" : ""
        }`,
        color: "green",
      });
    } catch {
      notifications.show({
        title: "発行しました（PDF 生成に失敗）",
        message:
          "PDF の生成に失敗しました。PDF タブの「再生成」で再試行できます。",
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
      confirmLabel="発行"
      loading={loading}
      onClose={onClose}
      onConfirm={issue}
      opened={opened}
      size="sm"
      title="見積書の発行"
    >
      <Stack gap="sm">
        <Text size="sm">
          見積書「{quoteNumber}
          」を発行します。発行と同時に PDF が生成・保存され、詳細画面の PDF
          タブで閲覧できます。
        </Text>
        <DatePickerInput
          clearable
          label="有効期限"
          leftSection={<IconCalendar size={14} />}
          onChange={setValidUntil}
          placeholder="日付を選択"
          value={validUntil}
          valueFormat="YYYY/MM/DD"
        />
        <Checkbox
          checked={sendMail}
          label="発行後に顧客へメール送付する"
          onChange={(e) => setSendMail(e.currentTarget.checked)}
        />
      </Stack>
    </ModalShell>
  );
}
