"use client";

/**
 * IntakeUploader — 「原本を選んで AI に読ませる」だけの部品。
 *
 * 購買側の 2 つの入口（素材発注書の下書き / 納品書からの入荷）で共通。
 * 読み取り結果の見せ方は入口ごとに違うので、ここは
 *   ファイルを選ぶ → 押す → 待つ → 失敗を説明する
 * までしか持たない。成功したら `onDraft` に渡して降りる。
 *
 * 失敗は `lib/intake-extract-error` が分類したもの（原因・対処・再試行の
 * 可否）をそのまま出す。「HTTP 502」とだけ出しても、利用者にできることが
 * 何も分からないため。**鍵やモデルの設定違いは再試行しても直らない**ので、
 * その旨をはっきり書く。
 */

import { Alert, FileButton, Group, Stack, Text } from "@mantine/core";
import {
  IconAlertTriangle,
  IconFileUpload,
  IconSparkles,
} from "@tabler/icons-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import {
  GhostButton,
  PrimaryButton,
  SecondaryButton,
} from "@/components/ui/buttons";
import type { ExtractFailure } from "@/lib/intake-extract-error";

/** 抽出器が読める形式だけ（サーバー側も同じ集合で弾く）。 */
const ACCEPT = "application/pdf,image/png,image/jpeg,image/webp";

export function IntakeUploader({
  endpoint,
  description,
  onDraft,
  onFile,
}: {
  /** POST 先（/api/extract/material-order など）。 */
  endpoint: string;
  description: string;
  /** 読み取れた下書き。 */
  onDraft: (draft: unknown) => void;
  /** 読ませた原本（保存後に証憑として添付するため呼び出し側が保持する）。 */
  onFile: (file: File | null) => void;
}) {
  const tr = useTranslations();
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [failure, setFailure] = useState<ExtractFailure | null>(null);

  const pick = (selected: File | null) => {
    setFile(selected);
    setFailure(null);
    onFile(selected);
  };

  const read = async () => {
    if (!file) return;
    setLoading(true);
    setFailure(null);
    try {
      const body = new FormData();
      body.set("file", file);
      const res = await fetch(endpoint, { method: "POST", body });
      const json = (await res.json().catch(() => null)) as {
        draft?: unknown;
        error?: ExtractFailure | string;
      } | null;
      if (!res.ok || !json?.draft) {
        const err = json?.error;
        setFailure(
          typeof err === "string"
            ? { summary: err, hint: "", retryable: true }
            : (err ?? {
                summary: tr("purchase.intake.extractFailed"),
                hint: "",
                retryable: true,
              }),
        );
        return;
      }
      onDraft(json.draft);
    } catch {
      setFailure({
        summary: tr("purchase.intake.extractFailed"),
        hint: "",
        retryable: true,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Stack gap="sm">
      <Text c="dimmed" size="sm">
        {description}
      </Text>

      <Group gap="sm" wrap="wrap">
        <FileButton accept={ACCEPT} onChange={pick}>
          {(props) => (
            <SecondaryButton
              disabled={loading}
              leftSection={<IconFileUpload size={14} />}
              {...props}
            >
              {tr("purchase.intake.selectDocument")}
            </SecondaryButton>
          )}
        </FileButton>
        {file && (
          <Text className="min-w-0" size="sm" truncate>
            {file.name}
          </Text>
        )}
        {file && !loading && (
          <GhostButton onClick={() => pick(null)} size="xs">
            {tr("purchase.intake.clearFile")}
          </GhostButton>
        )}
        <PrimaryButton
          disabled={!file}
          leftSection={<IconSparkles size={14} />}
          loading={loading}
          onClick={read}
        >
          {tr("purchase.intake.read")}
        </PrimaryButton>
      </Group>

      {loading && (
        <Text c="dimmed" size="xs">
          {tr("purchase.intake.readingHint")}
        </Text>
      )}

      {failure && (
        <Alert
          color="red"
          icon={<IconAlertTriangle size={16} />}
          title={failure.summary}
          variant="light"
        >
          <Stack gap={2}>
            {failure.cause && <Text size="xs">{failure.cause}</Text>}
            {failure.hint && <Text size="xs">{failure.hint}</Text>}
            {failure.retryable === false && (
              <Text fw={600} size="xs">
                {tr("purchase.intake.notRetryable")}
              </Text>
            )}
            {failure.detail && (
              <Text c="dimmed" size="xs">
                {failure.detail}
              </Text>
            )}
          </Stack>
        </Alert>
      )}
    </Stack>
  );
}
