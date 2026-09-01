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
import { useTranslations } from "next-intl";
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
import { useIsMobile } from "@/hooks/useViewport";

const KIND_LABEL: Record<string, string> = {
  SURVEY: "アンケート",
  REQUEST: "申請・報告",
};

export function FormImport() {
  const tr = useTranslations();
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
          title: tr("forms.formImport.cannotBeRead"),
          message: result.error,
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
              ? `バージョン ${result.data.version} として取り込みました`
              : tr("common.imported"),
          color: "green",
        });
        router.push(`/general/forms/${result.data.code}`);
      } else {
        notifications.show({
          title: tr("common.error2"),
          message: result.error,
          color: "red",
        });
      }
    });

  return (
    <Stack gap="md">
      <PageHeader
        breadcrumbs={[
          { label: tr("common.general") },
          { label: tr("common.forms"), href: "/general/forms" },
          { label: tr("common.import") },
        ]}
        title={tr("forms.formImport.importAForm")}
      />

      <FormSection title={tr("forms.formImport.aFileOrPaste")}>
        <Alert color="gray" icon={<IconFileImport size={16} />} variant="light">
          {tr("forms.formImport.theExportedFileTxtContainsOnly")}
        </Alert>
        <FileInput
          accept="text/plain,.txt"
          clearable
          label={tr("forms.formImport.exportedFile")}
          leftSection={<IconUpload size={16} />}
          onChange={readFile}
          placeholder={tr("forms.formImport.chooseFormTxt")}
        />
        <Textarea
          autosize
          description={tr("forms.formImport.youCanAlsoPasteTheFile")}
          label={tr("forms.formImport.orPaste")}
          maxRows={14}
          minRows={6}
          onChange={(e) => {
            setText(e.currentTarget.value);
            setPreview(null);
          }}
          placeholder={tr(
            "forms.formImport.cKKBusinessManagementSystemFormDefinition",
          )}
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
            {tr("forms.formImport.reviewTheContents")}
          </SecondaryButton>
        </Group>
      </FormSection>

      {preview && (
        <FormSection title={tr("forms.formImport.whatIsImported")}>
          <Card padding="md" radius="md" withBorder>
            <Stack gap="sm">
              <Group gap="xl" wrap="wrap">
                <FieldValue label={tr("common.title")} value={preview.title} />
                <FieldValue
                  label={tr("common.kind")}
                  value={KIND_LABEL[preview.kind] ?? preview.kind}
                />
                <FieldValue
                  label={tr("common.items")}
                  value={`${preview.fieldCount} 個`}
                />
              </Group>
              <Group gap="xl" wrap="wrap">
                <FieldValue
                  label={tr("forms.formImport.exportedFrom")}
                  value={`${preview.sourceEnv} / ${preview.sourceCode} (v${preview.sourceVersion})`}
                />
                <FieldValue
                  label={tr("forms.formImport.exportedAt")}
                  value={
                    preview.exportedAt ? fmt.dateTime(preview.exportedAt) : "—"
                  }
                />
                <FieldValue
                  label={tr("forms.formImport.exportedBy")}
                  value={preview.exportedBy ?? "—"}
                />
              </Group>
            </Stack>
          </Card>

          {preview.warnings.length > 0 && (
            <Alert
              color="yellow"
              icon={<IconAlertTriangle size={16} />}
              title={tr("forms.formImport.checkItAfterImporting")}
            >
              <List size="sm">
                {preview.warnings.map((w) => (
                  <List.Item key={w}>{w}</List.Item>
                ))}
              </List>
            </Alert>
          )}

          <Radio.Group
            label={tr("forms.formImport.howItIsImported")}
            onChange={(v) => setMode(v as "new" | "version")}
            value={mode}
          >
            <Stack gap="xs" mt="xs">
              <Radio
                description={
                  preview.codeAvailable
                    ? `書き出し元と同じコード（${preview.sourceCode}）で作ります。共有 URL が環境をまたいで同じになります`
                    : tr("forms.formImport.thatCodeIsTakenSoA")
                }
                label={tr("forms.formImport.importItAsANewForm")}
                value="new"
              />
              <Radio
                description={
                  preview.codeAvailable
                    ? tr("forms.formImport.thereIsNoFormWithThe")
                    : preview.existingEditable
                      ? `「${preview.existingTitle}」に新しいバージョンとして重ねます。これまでの回答は回答時点の内容のまま残ります`
                      : tr("forms.formImport.aFormWithTheSameCode")
                }
                disabled={preview.codeAvailable || !preview.existingEditable}
                label={tr("forms.formImport.updateTheExistingFormANew")}
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
              {tr("forms.formImport.import")}
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
              {tr("forms.formImport.import")}
            </PrimaryButton>
          </Group>
        )}
      </div>
    </Stack>
  );
}
