"use client";

/**
 * BugReportModal — ヘッダーのバグ報告ボタンから開くモーダル。
 *
 * ユーザーが入力するのは問題の説明のみ。ページ URL・ブラウザ環境・
 * 直近のコンソールログ（lib/bug-report.ts のリングバッファ）は自動添付し、
 * 送信内容としてモーダル内に明示する。保存先は audit_logs（操作履歴 SY07 で
 * 閲覧）+ system:ADMIN への SYSTEM 通知。
 */

import {
  Alert,
  Code,
  Modal,
  Stack,
  Switch,
  Text,
  Textarea,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconBug, IconInfoCircle } from "@tabler/icons-react";
import { useState, useTransition } from "react";
import { CancelButton, PrimaryButton } from "@/components/ui/buttons";
import { useTr } from "@/hooks/useTr";
import { capturedLogs, collectDiagnostics } from "@/lib/bug-report";
import { submitBugReportAction } from "./bug-report-actions";

export function BugReportModal({
  opened,
  onClose,
}: {
  opened: boolean;
  onClose: () => void;
}) {
  const tr = useTr();
  const [description, setDescription] = useState("");
  const [includeLogs, setIncludeLogs] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // モーダルを開いた時点の件数表示用（送信時に改めて収集する）
  const logCount = opened ? capturedLogs().length : 0;
  const currentUrl =
    typeof window === "undefined"
      ? ""
      : `${window.location.pathname}${window.location.search}`;

  const reset = () => {
    setDescription("");
    setIncludeLogs(true);
    setError(null);
  };

  const submit = () => {
    setError(null);
    if (!description.trim()) {
      setError(tr("問題の内容を入力してください"));
      return;
    }
    startTransition(async () => {
      const res = await submitBugReportAction({
        description,
        diagnostics: collectDiagnostics(),
        logs: includeLogs ? capturedLogs() : [],
      });
      if (res.ok) {
        notifications.show({
          title: tr("報告しました"),
          message: tr("バグ報告を送信しました。ご協力ありがとうございます"),
          color: "green",
        });
        reset();
        onClose();
      } else {
        setError(res.error);
      }
    });
  };

  return (
    <Modal
      onClose={onClose}
      opened={opened}
      title={tr("バグを報告")}
      withinPortal
    >
      <Stack gap="sm">
        <div>
          <Text c="dimmed" mb={4} size="xs">
            {tr("対象ページ（自動添付）")}
          </Text>
          <Code block>{currentUrl}</Code>
        </div>

        {error && (
          <Alert color="red" icon={<IconInfoCircle size={16} />}>
            {error}
          </Alert>
        )}

        <Textarea
          autosize
          label={tr("問題の内容")}
          minRows={3}
          onChange={(e) => setDescription(e.currentTarget.value)}
          placeholder={tr("発生した問題・操作手順・期待した動作など")}
          value={description}
          withAsterisk
        />

        <Switch
          checked={includeLogs}
          label={tr("コンソールログを添付する（直近 {logCount} 件）", {
            logCount: logCount,
          })}
          onChange={(e) => setIncludeLogs(e.currentTarget.checked)}
          size="sm"
        />
        <Text c="dimmed" size="xs">
          {tr(
            tr(
              tr(
                "ページ URL・ブラウザ情報・画面サイズ・アプリバージョンが自動で\n          添付されます。報告は操作履歴に記録され、管理者へ通知されます。",
              ),
            ),
          )}
        </Text>

        <Stack gap="xs">
          <PrimaryButton
            fullWidth
            leftSection={<IconBug size={16} />}
            loading={isPending}
            onClick={submit}
          >
            {tr("報告する")}
          </PrimaryButton>
          <CancelButton fullWidth onClick={onClose} />
        </Stack>
      </Stack>
    </Modal>
  );
}
