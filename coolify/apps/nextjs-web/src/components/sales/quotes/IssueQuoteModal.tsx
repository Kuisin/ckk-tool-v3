"use client";

/**
 * IssueQuoteModal — 見積書 発行（DRAFT → ISSUED）.
 *
 * **順序が重要** — まず `onIssue`（issueQuote Server Action）で状態を ISSUED に
 * してから PDF を生成する。PDF ルートは未発行（DRAFT）の見積書を 403 で拒否する
 * ため、逆順だと必ず生成に失敗する。生成された PDF（Gotenberg → SeaweedFS）は
 * 詳細ページの「PDF」タブで閲覧できる。
 */

import { Checkbox, Stack, Text } from "@mantine/core";
import { DatePickerInput } from "@mantine/dates";
import { notifications } from "@mantine/notifications";
import { IconCalendar } from "@tabler/icons-react";
import { useState } from "react";
import { type ModalBaseProps, ModalShell } from "@/components/ui/modals";
import type { PdfFileMeta } from "@/components/ui/PdfAttachmentPanel";
import { useTr } from "@/hooks/useTr";

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
  const tr = useTr();
  const [validUntil, setValidUntil] = useState<string | null>(
    defaultValidUntil,
  );
  const [sendMail, setSendMail] = useState(true);
  const [loading, setLoading] = useState(false);

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
        title: tr("発行しました"),
        message: `見積書 ${quoteNumber} を発行し、PDF を保存しました${
          sendMail ? "（メール送付予約済み）" : ""
        }`,
        color: "green",
      });
    } catch {
      notifications.show({
        title: tr("発行しました（PDF 生成に失敗）"),
        message: tr(
          tr(
            tr(
              "PDF の生成に失敗しました。PDF タブの「再生成」で再試行できます。",
            ),
          ),
        ),
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
      confirmLabel={tr("発行")}
      loading={loading}
      onClose={onClose}
      onConfirm={issue}
      opened={opened}
      size="sm"
      title={tr("見積書の発行")}
    >
      <Stack gap="sm">
        <Text size="sm">
          見積書「{quoteNumber}
          」を発行します。発行と同時に PDF が生成・保存され、詳細画面の PDF
          タブで閲覧できます。
        </Text>
        <DatePickerInput
          clearable
          label={tr("有効期限")}
          leftSection={<IconCalendar size={14} />}
          onChange={setValidUntil}
          placeholder={tr("日付を選択")}
          value={validUntil}
          valueFormat="YYYY/MM/DD"
        />
        <Checkbox
          checked={sendMail}
          label={tr("発行後に顧客へメール送付する")}
          onChange={(e) => setSendMail(e.currentTarget.checked)}
        />
      </Stack>
    </ModalShell>
  );
}
