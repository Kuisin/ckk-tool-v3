"use client";

/**
 * FormEditor — フォームの設定と項目を編集する（新規・編集の両方）。
 *
 * 項目定義の保存は必ず「新しいバージョンの公開」になる。既存バージョンを
 * 書き換えないので、過去の回答は回答時点の形のまま読める。
 */

import {
  Checkbox,
  Select,
  Stack,
  Text,
  Textarea,
  TextInput,
} from "@mantine/core";
import { DateTimePicker } from "@mantine/dates";
import { notifications } from "@mantine/notifications";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { FormActions, FormSection } from "@/components/ui/shells";
import { type FormFieldDef, normalizeOrder } from "@/lib/form-schema";
import { FormBuilder } from "./FormBuilder";

export interface FormSettingsValues {
  title: string;
  description: string;
  kind: "SURVEY" | "REQUEST";
  respondentVisibility: "SHOWN" | "HIDDEN";
  approvalEnabled: boolean;
  editableUntilFirstApproval: boolean;
  allowMultiple: boolean;
  opensAt: string | null;
  closesAt: string | null;
  responseEditMode: "NONE" | "UNTIL_CLOSE" | "UNTIL_DATE";
  responseEditableUntil: string | null;
}

export const EMPTY_SETTINGS: FormSettingsValues = {
  title: "",
  description: "",
  kind: "SURVEY",
  respondentVisibility: "SHOWN",
  approvalEnabled: false,
  editableUntilFirstApproval: false,
  allowMultiple: true,
  opensAt: null,
  closesAt: null,
  responseEditMode: "NONE",
  responseEditableUntil: null,
};

function toIso(v: string | Date | null): string | null {
  if (!v) return null;
  const d = typeof v === "string" ? new Date(v) : v;
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function FormEditor({
  mode,
  code,
  initialSettings,
  initialFields,
  onSaveSettings,
  onPublishFields,
}: {
  mode: "new" | "edit";
  code?: string;
  initialSettings: FormSettingsValues;
  initialFields: FormFieldDef[];
  onSaveSettings: (
    values: FormSettingsValues,
  ) => Promise<{ ok: boolean; error?: string; code?: string }>;
  onPublishFields?: (
    fields: FormFieldDef[],
  ) => Promise<{ ok: boolean; error?: string }>;
}) {
  const tr = useTranslations();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [values, setValues] = useState(initialSettings);
  const [fields, setFields] = useState(initialFields);

  const set = (patch: Partial<FormSettingsValues>) =>
    setValues({ ...values, ...patch });

  /**
   * 項目に手が入ったか。**入っていないときは公開しない** — 設定を直すたびに
   * 中身の同じバージョンが積み上がるのを避ける（バージョンは不変なので、
   * 一度作ると消せない）。
   */
  const fieldsDirty =
    JSON.stringify(normalizeOrder(fields)) !==
    JSON.stringify(normalizeOrder(initialFields));

  /**
   * 保存は 1 つ。設定と項目をまとめて保存する。
   *
   * 以前は「保存」が設定だけを保存して即座に画面を離れており、組んだ項目が
   * 黙って捨てられていた（項目の公開は別ボタンだったが、下の大きいボタンを
   * 押すのが自然なので気づけない）。保存は 1 つにして、**どちらかが失敗したら
   * 画面を離れない**。
   */
  const save = () =>
    startTransition(async () => {
      const saved = await onSaveSettings(values);
      if (!saved.ok) {
        notifications.show({
          title: tr("common.error2"),
          message: saved.error ?? tr("common.couldNotSave"),
          color: "red",
        });
        return;
      }

      const target = saved.code ?? code;

      if (mode === "edit" && onPublishFields && fieldsDirty) {
        const published = await onPublishFields(fields);
        if (!published.ok) {
          // 設定は保存済み。項目だけ落ちたので、画面はそのまま残して直させる。
          notifications.show({
            title: tr("forms.formEditor.couldNotSaveTheItem"),
            message: tr("forms.formEditor.itemErrorButSettingsSaved", {
              error:
                published.error ??
                tr("forms.formEditor.fieldDefinitionIsInvalid"),
            }),
            color: "red",
          });
          return;
        }
        notifications.show({
          message: tr("forms.formEditor.savedTheFieldsWerePublishedAs"),
          color: "green",
        });
      } else {
        notifications.show({ message: tr("common.saved2"), color: "green" });
      }

      // 新規作成の直後は、項目を組むために編集画面へ進ませる
      // （詳細画面に飛ばすと「編集」を探し直すことになる）。
      router.push(
        mode === "new"
          ? `/general/forms/${target}/edit`
          : `/general/forms/${target}`,
      );
    });

  return (
    <Stack gap="md">
      <PageHeader
        breadcrumbs={[
          { label: tr("common.general") },
          { label: tr("common.forms"), href: "/general/forms" },
          { label: mode === "new" ? tr("common.new") : tr("common.edit2") },
        ]}
        title={
          mode === "new"
            ? tr("general.forms.createAForm")
            : tr("forms.formEditor.editTheForm")
        }
      />

      <FormSection title={tr("forms.formEditor.basicSettings")}>
        <TextInput
          label={tr("common.title")}
          onChange={(e) => set({ title: e.currentTarget.value })}
          placeholder={tr("forms.formEditor.salesNotes")}
          value={values.title}
          withAsterisk
        />
        <Textarea
          autosize
          description={tr("forms.formEditor.theDescriptionAtTheTopOf")}
          label={tr("common.description")}
          minRows={2}
          onChange={(e) => set({ description: e.currentTarget.value })}
          value={values.description}
        />
        <Select
          data={[
            {
              value: "SURVEY",
              label: tr("forms.formEditor.surveyCollectResponses"),
            },
            {
              value: "REQUEST",
              label: tr("forms.formEditor.requestOrReportApprovalStepsCan"),
            },
          ]}
          label={tr("common.kind")}
          onChange={(v) =>
            set({
              kind: (v as "SURVEY" | "REQUEST") ?? "SURVEY",
              approvalEnabled: v === "REQUEST" ? values.approvalEnabled : false,
            })
          }
          value={values.kind}
        />
        <Select
          data={[
            { value: "SHOWN", label: tr("forms.formEditor.showRespondents") },
            {
              value: "HIDDEN",
              label: tr(
                "forms.formEditor.doNotShowRespondentsSummarizeAnonymously",
              ),
            },
          ]}
          description={tr("forms.formEditor.evenWithDoNotShowThe")}
          label={tr("common.showRespondents")}
          onChange={(v) =>
            set({ respondentVisibility: (v as "SHOWN" | "HIDDEN") ?? "SHOWN" })
          }
          value={values.respondentVisibility}
        />
        {values.kind === "REQUEST" && (
          <Checkbox
            checked={values.approvalEnabled}
            description={tr("forms.formEditor.theApprovalStepsAndGroupsAre")}
            label={tr("forms.formEditor.useAnApprovalFlow")}
            onChange={(e) => set({ approvalEnabled: e.currentTarget.checked })}
          />
        )}
        {values.kind === "REQUEST" && values.approvalEnabled && (
          <Checkbox
            checked={values.editableUntilFirstApproval}
            description={tr("forms.formEditor.aSettingForWhenAnApprover")}
            label={tr("forms.formEditor.evenWhilePendingTheRespondentCan")}
            ml="md"
            onChange={(e) =>
              set({ editableUntilFirstApproval: e.currentTarget.checked })
            }
          />
        )}
        {values.kind === "REQUEST" && (
          <Text c="dimmed" size="xs">
            {tr("forms.formEditor.whoIsToldOnCompletionAll")}
          </Text>
        )}
        <Checkbox
          checked={!values.allowMultiple}
          label={tr("forms.formEditor.allowOnlyOneResponsePerPerson")}
          onChange={(e) => set({ allowMultiple: !e.currentTarget.checked })}
        />
      </FormSection>

      <FormSection title={tr("forms.formEditor.openPeriod")}>
        <DateTimePicker
          clearable
          description={tr("forms.formEditor.ifEmptyItOpensTheMoment")}
          label={tr("common.opens")}
          onChange={(v) => set({ opensAt: toIso(v) })}
          value={values.opensAt ? new Date(values.opensAt) : null}
          valueFormat="YYYY/MM/DD HH:mm"
        />
        <DateTimePicker
          clearable
          description={tr(
            "forms.formEditor.itClosesAutomaticallyAfterThisTime",
          )}
          label={tr("common.closed")}
          onChange={(v) => set({ closesAt: toIso(v) })}
          value={values.closesAt ? new Date(values.closesAt) : null}
          valueFormat="YYYY/MM/DD HH:mm"
        />
        <Select
          data={[
            {
              value: "NONE",
              label: tr("forms.formEditor.notEditableFinalOnceSubmitted"),
            },
            {
              value: "UNTIL_CLOSE",
              label: tr("forms.formEditor.editableUntilItCloses"),
            },
            {
              value: "UNTIL_DATE",
              label: tr("forms.formEditor.editableUntilTheTimeYouSet"),
            },
          ]}
          label={tr("forms.formEditor.editingByTheRespondent")}
          onChange={(v) =>
            set({
              responseEditMode:
                (v as FormSettingsValues["responseEditMode"]) ?? "NONE",
            })
          }
          value={values.responseEditMode}
        />
        {values.responseEditMode === "UNTIL_DATE" && (
          <DateTimePicker
            clearable
            label={tr("forms.formEditor.editableUntil")}
            onChange={(v) => set({ responseEditableUntil: toIso(v) })}
            value={
              values.responseEditableUntil
                ? new Date(values.responseEditableUntil)
                : null
            }
            valueFormat="YYYY/MM/DD HH:mm"
            withAsterisk
          />
        )}
      </FormSection>

      {mode === "edit" && onPublishFields && (
        <FormSection title={tr("common.item")}>
          <Text c="dimmed" size="sm">
            {tr("forms.formEditor.saveBelowStoresItTogetherWith")}
          </Text>
          <FormBuilder fields={fields} onChange={setFields} />
          {fieldsDirty && (
            <Text c="orange" size="xs">
              {tr("forms.formEditor.thereAreUnsavedChangesToThe")}
            </Text>
          )}
        </FormSection>
      )}

      <FormActions
        loading={isPending}
        onCancel={() =>
          router.push(code ? `/general/forms/${code}` : "/general/forms")
        }
        onSave={save}
      />
    </Stack>
  );
}
