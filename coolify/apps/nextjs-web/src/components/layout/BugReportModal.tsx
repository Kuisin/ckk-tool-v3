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
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { CancelButton, PrimaryButton } from "@/components/ui/buttons";
import { capturedLogs, collectDiagnostics } from "@/lib/bug-report";
import { submitBugReportAction } from "./bug-report-actions";

export function BugReportModal({
  opened,
  onClose,
}: {
  opened: boolean;
  onClose: () => void;
}) {
  const tr = useTranslations();
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
      setError(tr("layout.bugReportModal.describeTheProblem"));
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
          title: tr("layout.bugReportModal.reported"),
          message: tr("layout.bugReportModal.theBugReportWasSentThank"),
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
      title={tr("common.reportABug")}
      withinPortal
    >
      <Stack gap="sm">
        <div>
          <Text c="dimmed" mb={4} size="xs">
            {tr("layout.bugReportModal.targetPageAttachedAutomatically")}
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
          label={tr("layout.bugReportModal.whatTheProblemIs")}
          minRows={3}
          onChange={(e) => setDescription(e.currentTarget.value)}
          placeholder={tr("layout.bugReportModal.whatWentWrongTheStepsYou")}
          value={description}
          withAsterisk
        />

        <Switch
          checked={includeLogs}
          label={tr("layout.bugReportModal.attachConsoleLogsWithCount", {
            count: logCount,
          })}
          onChange={(e) => setIncludeLogs(e.currentTarget.checked)}
          size="sm"
        />
        <Text c="dimmed" size="xs">
          {tr("layout.bugReportModal.thePageUrlBrowserDetailsScreen")}
        </Text>

        <Stack gap="xs">
          <PrimaryButton
            fullWidth
            leftSection={<IconBug size={16} />}
            loading={isPending}
            onClick={submit}
          >
            {tr("layout.bugReportModal.report")}
          </PrimaryButton>
          <CancelButton fullWidth onClick={onClose} />
        </Stack>
      </Stack>
    </Modal>
  );
}
