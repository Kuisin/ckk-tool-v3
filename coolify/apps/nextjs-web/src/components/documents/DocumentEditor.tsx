"use client";

import { Checkbox, Stack, Textarea, TextInput } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import {
  createPage,
  savePageBody,
  updatePageSettings,
} from "@/app/(dashboard)/general/documents/actions";
import { PrimaryButton } from "@/components/ui/buttons";
import { PageHeader } from "@/components/ui/PageHeader";
import { FormActions, FormSection } from "@/components/ui/shells";
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
  const tr = useTranslations();
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
          notifications.show({ message: tr("common.created"), color: "green" });
          router.push(`/general/documents/${r.data.pageNumber}/edit`);
        } else {
          notifications.show({
            title: tr("common.error2"),
            message: r.error,
            color: "red",
          });
        }
        return;
      }
      const r = await updatePageSettings(pageNumber as string, settings);
      if (r.ok) {
        notifications.show({ message: tr("common.saved2"), color: "green" });
        router.push(`/general/documents/${pageNumber}`);
      } else {
        notifications.show({
          title: tr("common.error2"),
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
          title: tr("common.error2"),
          message: r.error,
          color: "red",
        });
      }
    });

  return (
    <Stack gap="md">
      <PageHeader
        breadcrumbs={[
          { label: tr("common.general") },
          { label: tr("common.internalDocuments"), href: "/general/documents" },
          { label: mode === "new" ? "新規" : tr("common.edit2") },
        ]}
        title={
          mode === "new"
            ? "文書を作る"
            : tr("documents.documentEditor.editTheDocument")
        }
      />

      <FormSection title={tr("documents.documentEditor.documentInformation")}>
        <TextInput
          label={tr("common.title")}
          onChange={(e) => setTitle(e.currentTarget.value)}
          placeholder={tr("documents.documentEditor.shippingSteps")}
          value={title}
          withAsterisk
        />
        <TextInput
          description={tr(
            "documents.documentEditor.useSlashesToMakeAHierarchy",
          )}
          label={tr("common.folder")}
          onChange={(e) => setFolder(e.currentTarget.value)}
          placeholder={tr("documents.documentEditor.procedureShipping")}
          value={folder}
        />
        <Textarea
          autosize
          label={tr("common.overview")}
          minRows={2}
          onChange={(e) => setSummary(e.currentTarget.value)}
          value={summary}
        />
        <Checkbox
          checked={approvalRequired}
          description={tr("documents.documentEditor.theNumberOfStepsAndThe")}
          label={tr("documents.documentEditor.requireApprovalToPublish")}
          onChange={(e) => setApprovalRequired(e.currentTarget.checked)}
        />
      </FormSection>

      {mode === "edit" && (
        <FormSection title={tr("documents.documentEditor.bodyMarkdown")}>
          <MarkdownEditor onChange={setBody} value={body} />
          <TextInput
            description={tr("documents.documentEditor.aLineOnWhatYouFixed")}
            label={tr("documents.documentEditor.reasonForTheChange")}
            onChange={(e) => setNote(e.currentTarget.value)}
            placeholder={tr(
              "documents.documentEditor.addAPreShipmentCheckItem",
            )}
            value={note}
          />
          <PrimaryButton
            fullWidth={isMobile}
            loading={isPending}
            onClick={saveBody}
            type="button"
          >
            {tr("documents.documentEditor.saveTheBodyNewRevision")}
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
