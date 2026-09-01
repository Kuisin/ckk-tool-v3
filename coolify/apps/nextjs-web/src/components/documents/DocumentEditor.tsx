"use client";

import { Checkbox, Stack, Textarea, TextInput } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  createPage,
  savePageBody,
  updatePageSettings,
} from "@/app/(dashboard)/general/documents/actions";
import { PrimaryButton } from "@/components/ui/buttons";
import { PageHeader } from "@/components/ui/PageHeader";
import { FormActions, FormSection } from "@/components/ui/shells";
import { useTr } from "@/hooks/useTr";
import { useIsMobile } from "@/hooks/useViewport";
import { MarkdownEditor } from "./MarkdownEditor";

export function DocumentEditor({
  mode,
  pageNumber,
  initial,
}: {
  mode: "new" | "edit";
  pageNumber?: string;
  initial: {
    title: string;
    summary: string;
    folder: string;
    approvalRequired: boolean;
    body: string;
  };
}) {
  const tr = useTr();
  const router = useRouter();
  const isMobile = useIsMobile();
  const [isPending, startTransition] = useTransition();
  const [title, setTitle] = useState(initial.title);
  const [summary, setSummary] = useState(initial.summary);
  const [folder, setFolder] = useState(initial.folder);
  const [approvalRequired, setApprovalRequired] = useState(
    initial.approvalRequired,
  );
  const [body, setBody] = useState(initial.body);
  const [note, setNote] = useState("");

  const settings = { title, summary, folder, approvalRequired };

  const saveSettings = () =>
    startTransition(async () => {
      if (mode === "new") {
        const r = await createPage(settings);
        if (r.ok) {
          notifications.show({ message: tr("作成しました"), color: "green" });
          router.push(`/general/documents/${r.data.pageNumber}/edit`);
        } else {
          notifications.show({
            title: tr("エラー"),
            message: r.error,
            color: "red",
          });
        }
        return;
      }
      const r = await updatePageSettings(pageNumber as string, settings);
      if (r.ok) {
        notifications.show({ message: tr("保存しました"), color: "green" });
        router.push(`/general/documents/${pageNumber}`);
      } else {
        notifications.show({
          title: tr("エラー"),
          message: r.error,
          color: "red",
        });
      }
    });

  const saveBody = () =>
    startTransition(async () => {
      const r = await savePageBody(pageNumber as string, { title, body, note });
      if (r.ok) {
        notifications.show({
          message: `リビジョン ${r.data.revision} として保存しました`,
          color: "green",
        });
        setNote("");
        router.refresh();
      } else {
        notifications.show({
          title: tr("エラー"),
          message: r.error,
          color: "red",
        });
      }
    });

  return (
    <Stack gap="md">
      <PageHeader
        breadcrumbs={[
          { label: tr("一般") },
          { label: tr("社内文書"), href: "/general/documents" },
          { label: mode === "new" ? "新規" : tr("編集") },
        ]}
        title={mode === "new" ? "文書を作る" : tr("文書を編集")}
      />

      <FormSection title={tr("文書の情報")}>
        <TextInput
          label={tr("タイトル")}
          onChange={(e) => setTitle(e.currentTarget.value)}
          placeholder={tr("出荷手順")}
          value={title}
          withAsterisk
        />
        <TextInput
          description={tr(
            tr("スラッシュ区切りで階層にできます（例: 手順書/出荷）"),
          )}
          label={tr("フォルダ")}
          onChange={(e) => setFolder(e.currentTarget.value)}
          placeholder={tr("手順書/出荷")}
          value={folder}
        />
        <Textarea
          autosize
          label={tr("概要")}
          minRows={2}
          onChange={(e) => setSummary(e.currentTarget.value)}
          value={summary}
        />
        <Checkbox
          checked={approvalRequired}
          description={tr("承認の段数と承認者は 承認設定（MS0B）で決めます")}
          label={tr("公開に承認を必要とする")}
          onChange={(e) => setApprovalRequired(e.currentTarget.checked)}
        />
      </FormSection>

      {mode === "edit" && (
        <FormSection title={tr("本文（Markdown）")}>
          <MarkdownEditor onChange={setBody} value={body} />
          <TextInput
            description={tr("何を直したかを一言（リビジョンの履歴に出ます）")}
            label={tr("変更理由")}
            onChange={(e) => setNote(e.currentTarget.value)}
            placeholder={tr("出荷前チェックの項目を追加")}
            value={note}
          />
          <PrimaryButton
            fullWidth={isMobile}
            loading={isPending}
            onClick={saveBody}
            type="button"
          >
            {tr("本文を保存（新しいリビジョン）")}
          </PrimaryButton>
        </FormSection>
      )}

      <FormActions
        loading={isPending}
        onCancel={() =>
          router.push(
            pageNumber
              ? `/general/documents/${pageNumber}`
              : "/general/documents",
          )
        }
        onSave={saveSettings}
      />
    </Stack>
  );
}
