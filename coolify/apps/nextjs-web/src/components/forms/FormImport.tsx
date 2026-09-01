"use client";

/**
 * FormImport — 書き出したフォーム定義を取り込む。
 *
 * ファイルはクライアントで読んで**テキストとして** Server Action に渡す。
 * multipart の Route Handler を作らないのは、フォーム定義が数 KB で、
 * 1MB の Server Action 上限にまったく届かないため（実ファイルの
 * アップロードとは事情が違う）。
 *
 * 取り込む前に必ず下見（previewFormImport）を挟む。取り込み先で何が起きるか
 * — 同じコードが空いているか、参照が外れないか — を先に見せてから確定させる。
 */

import {
  Alert,
  Card,
  FileInput,
  Group,
  List,
  Radio,
  Stack,
  Textarea,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import {
  IconAlertTriangle,
  IconFileImport,
  IconUpload,
} from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  type ImportPreview,
  importForm,
  previewFormImport,
} from "@/app/(dashboard)/general/forms/actions";
import { useFormat } from "@/components/layout/PreferencesProvider";
import {
  CancelButton,
  PrimaryButton,
  SecondaryButton,
} from "@/components/ui/buttons";
import { FieldValue } from "@/components/ui/FieldValue";
import { PageHeader } from "@/components/ui/PageHeader";
import { FormSection } from "@/components/ui/shells";
import { useTr } from "@/hooks/useTr";
import { useIsMobile } from "@/hooks/useViewport";

const KIND_LABEL: Record<string, string> = {
  SURVEY: "アンケート",
  REQUEST: "申請・報告",
};

export function FormImport() {
  const tr = useTr();
  const router = useRouter();
  const fmt = useFormat();
  const isMobile = useIsMobile();
  const [isPending, startTransition] = useTransition();
  const [text, setText] = useState("");
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [mode, setMode] = useState<"new" | "version">("new");

  const readFile = async (file: File | null) => {
    if (!file) return;
    const content = await file.text();
    setText(content);
    setPreview(null);
    check(content);
  };

  const check = (content: string) =>
    startTransition(async () => {
      const result = await previewFormImport(content);
      if (result.ok) {
        setPreview(result.data);
        // 同じコードのフォームがあって編集もできるなら、既定は
        // 「新しいバージョンとして重ねる」— 作り直すより自然な更新になる。
        setMode(
          !result.data.codeAvailable && result.data.existingEditable
            ? "version"
            : "new",
        );
      } else {
        setPreview(null);
        notifications.show({
          title: tr("読み取れません"),
          message: tr(result.error),
          color: "red",
        });
      }
    });

  const run = () =>
    startTransition(async () => {
      const result = await importForm(text, mode);
      if (result.ok) {
        notifications.show({
          message:
            result.data.mode === "version"
              ? tr("バージョン {version} として取り込みました", {
                  version: result.data.version,
                })
              : tr("取り込みました"),
          color: "green",
        });
        router.push(`/general/forms/${result.data.code}`);
      } else {
        notifications.show({
          title: tr("エラー"),
          message: tr(result.error),
          color: "red",
        });
      }
    });

  return (
    <Stack gap="md">
      <PageHeader
        breadcrumbs={[
          { label: tr("一般") },
          { label: tr("フォーム"), href: "/general/forms" },
          { label: tr("取り込み") },
        ]}
        title={tr("フォームを取り込む")}
      />

      <FormSection title={tr("ファイルまたは貼り付け")}>
        <Alert color="gray" icon={<IconFileImport size={16} />} variant="light">
          {tr(
            tr(
              tr(
                "書き出したファイル（.txt）に含まれるのは**フォームの作りだけ**です。\n          回答と共有設定は含まれないので、取り込んだフォームは非公開で始まります。\n          受付期間も設定し直してください。",
              ),
            ),
          )}
        </Alert>
        <FileInput
          accept="text/plain,.txt"
          clearable
          label={tr("書き出したファイル")}
          leftSection={<IconUpload size={16} />}
          onChange={readFile}
          placeholder={tr("フォーム_....txt を選ぶ")}
        />
        <Textarea
          autosize
          description={tr("ファイルの中身を直接貼っても取り込めます")}
          label={tr("または貼り付け")}
          maxRows={14}
          minRows={6}
          onChange={(e) => {
            setText(e.currentTarget.value);
            setPreview(null);
          }}
          placeholder={tr("# CKK 業務管理システム — フォーム定義 ...")}
          styles={{
            input: { fontFamily: "var(--mantine-font-family-monospace)" },
          }}
          value={text}
        />
        <Group>
          <SecondaryButton
            disabled={!text.trim()}
            fullWidth={isMobile}
            loading={isPending}
            onClick={() => check(text)}
          >
            {tr("内容を確認")}
          </SecondaryButton>
        </Group>
      </FormSection>

      {preview && (
        <FormSection title={tr("取り込む内容")}>
          <Card padding="md" radius="md" withBorder>
            <Stack gap="sm">
              <Group gap="xl" wrap="wrap">
                <FieldValue label={tr("タイトル")} value={preview.title} />
                <FieldValue
                  label={tr("種類")}
                  value={KIND_LABEL[preview.kind] ?? preview.kind}
                />
                <FieldValue
                  label={tr("項目数")}
                  value={tr("{fieldCount} 個", {
                    fieldCount: preview.fieldCount,
                  })}
                />
              </Group>
              <Group gap="xl" wrap="wrap">
                <FieldValue
                  label={tr("書き出し元")}
                  value={`${preview.sourceEnv} / ${preview.sourceCode} (v${preview.sourceVersion})`}
                />
                <FieldValue
                  label={tr("書き出し日時")}
                  value={
                    preview.exportedAt ? fmt.dateTime(preview.exportedAt) : "—"
                  }
                />
                <FieldValue
                  label={tr("書き出した人")}
                  value={preview.exportedBy ?? "—"}
                />
              </Group>
            </Stack>
          </Card>

          {preview.warnings.length > 0 && (
            <Alert
              color="yellow"
              icon={<IconAlertTriangle size={16} />}
              title={tr("取り込んだあとに確認してください")}
            >
              <List size="sm">
                {preview.warnings.map((w) => (
                  <List.Item key={w}>{w}</List.Item>
                ))}
              </List>
            </Alert>
          )}

          <Radio.Group
            label={tr("取り込み方")}
            onChange={(v) => setMode(v as "new" | "version")}
            value={mode}
          >
            <Stack gap="xs" mt="xs">
              <Radio
                description={
                  preview.codeAvailable
                    ? tr(
                        "書き出し元と同じコード（{sourceCode}）で作ります。共有 URL が環境をまたいで同じになります",
                        { sourceCode: preview.sourceCode },
                      )
                    : tr("同じコードは使われているので、新しいコードで作ります")
                }
                label={tr("新しいフォームとして取り込む")}
                value="new"
              />
              <Radio
                description={
                  preview.codeAvailable
                    ? tr("同じコードのフォームがこの環境にありません")
                    : preview.existingEditable
                      ? tr(
                          "「{existingTitle}」に新しいバージョンとして重ねます。これまでの回答は回答時点の内容のまま残ります",
                          { existingTitle: preview.existingTitle },
                        )
                      : tr(
                          tr(
                            tr(
                              "同じコードのフォームはありますが、編集する権限がありません",
                            ),
                          ),
                        )
                }
                disabled={preview.codeAvailable || !preview.existingEditable}
                label={tr("既存のフォームを更新する（新しいバージョン）")}
                value="version"
              />
            </Stack>
          </Radio.Group>
        </FormSection>
      )}

      <div className="form-actions">
        {isMobile ? (
          <Stack gap="xs">
            <PrimaryButton
              disabled={!preview}
              fullWidth
              loading={isPending}
              onClick={run}
            >
              {tr("取り込む")}
            </PrimaryButton>
            <CancelButton
              fullWidth
              onClick={() => router.push("/general/forms")}
            />
          </Stack>
        ) : (
          <Group justify="flex-end">
            <CancelButton onClick={() => router.push("/general/forms")} />
            <PrimaryButton
              disabled={!preview}
              loading={isPending}
              onClick={run}
            >
              {tr("取り込む")}
            </PrimaryButton>
          </Group>
        )}
      </div>
    </Stack>
  );
}
