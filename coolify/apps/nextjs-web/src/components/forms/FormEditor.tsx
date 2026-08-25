"use client";

/**
 * FormEditor — フォームの設定と項目を編集する（新規・編集の両方）。
 *
 * 項目定義の保存は必ず「新しいバージョンの公開」になる。既存バージョンを
 * 書き換えないので、過去の回答は回答時点の形のまま読める。
 */

import {
  Checkbox,
  Group,
  Select,
  Stack,
  Text,
  Textarea,
  TextInput,
} from "@mantine/core";
import { DateTimePicker } from "@mantine/dates";
import { notifications } from "@mantine/notifications";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  CancelButton,
  PrimaryButton,
  SaveButton,
} from "@/components/ui/buttons";
import { PageHeader } from "@/components/ui/PageHeader";
import { FormSection } from "@/components/ui/shells";
import type { FormFieldDef } from "@/lib/form-schema";
import { FormBuilder } from "./FormBuilder";

export interface FormSettingsValues {
  title: string;
  description: string;
  kind: "SURVEY" | "REQUEST";
  respondentVisibility: "SHOWN" | "HIDDEN";
  approvalEnabled: boolean;
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
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [values, setValues] = useState(initialSettings);
  const [fields, setFields] = useState(initialFields);

  const set = (patch: Partial<FormSettingsValues>) =>
    setValues({ ...values, ...patch });

  const saveSettings = () =>
    startTransition(async () => {
      const result = await onSaveSettings(values);
      if (result.ok) {
        notifications.show({ message: "保存しました", color: "green" });
        router.push(`/general/forms/${result.code ?? code}`);
      } else {
        notifications.show({
          title: "エラー",
          message: result.error ?? "保存に失敗しました",
          color: "red",
        });
      }
    });

  const publish = () =>
    startTransition(async () => {
      if (!onPublishFields) return;
      const result = await onPublishFields(fields);
      if (result.ok) {
        notifications.show({
          message: "項目を公開しました（新しいバージョン）",
          color: "green",
        });
        router.refresh();
      } else {
        notifications.show({
          title: "エラー",
          message: result.error ?? "公開に失敗しました",
          color: "red",
        });
      }
    });

  return (
    <Stack gap="md">
      <PageHeader
        breadcrumbs={[
          { label: "一般" },
          { label: "フォーム", href: "/general/forms" },
          { label: mode === "new" ? "新規" : "編集" },
        ]}
        title={mode === "new" ? "フォームを作る" : "フォームを編集"}
      />

      <FormSection title="基本設定">
        <TextInput
          label="タイトル"
          onChange={(e) => set({ title: e.currentTarget.value })}
          placeholder="商談メモ"
          value={values.title}
          withAsterisk
        />
        <Textarea
          autosize
          description="回答画面の先頭に出る説明。匿名で集計する場合はその旨もここに書く"
          label="説明"
          minRows={2}
          onChange={(e) => set({ description: e.currentTarget.value })}
          value={values.description}
        />
        <Select
          data={[
            { value: "SURVEY", label: "アンケート（回答を集める）" },
            {
              value: "REQUEST",
              label: "申請・報告（承認ステップを付けられる）",
            },
          ]}
          label="種類"
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
            { value: "SHOWN", label: "回答者を表示する" },
            { value: "HIDDEN", label: "回答者を表示しない（匿名で集計）" },
          ]}
          description="「表示しない」でも回答者はシステムに記録されます（本人の編集と操作履歴のため）。完全な匿名ではありません"
          label="回答者の表示"
          onChange={(v) =>
            set({ respondentVisibility: (v as "SHOWN" | "HIDDEN") ?? "SHOWN" })
          }
          value={values.respondentVisibility}
        />
        {values.kind === "REQUEST" && (
          <Checkbox
            checked={values.approvalEnabled}
            description="承認の段数と承認者は 承認設定（MS0B）で決めます"
            label="承認フローを使う"
            onChange={(e) => set({ approvalEnabled: e.currentTarget.checked })}
          />
        )}
        <Checkbox
          checked={!values.allowMultiple}
          label="1 人 1 回だけ回答できるようにする"
          onChange={(e) => set({ allowMultiple: !e.currentTarget.checked })}
        />
      </FormSection>

      <FormSection title="受付期間">
        <DateTimePicker
          clearable
          description="空なら公開した時点から受け付けます"
          label="受付開始"
          onChange={(v) => set({ opensAt: toIso(v) })}
          value={values.opensAt ? new Date(values.opensAt) : null}
          valueFormat="YYYY/MM/DD HH:mm"
        />
        <DateTimePicker
          clearable
          description="この時刻を過ぎると自動で受付を終了します（操作は不要）"
          label="受付終了"
          onChange={(v) => set({ closesAt: toIso(v) })}
          value={values.closesAt ? new Date(values.closesAt) : null}
          valueFormat="YYYY/MM/DD HH:mm"
        />
        <Select
          data={[
            { value: "NONE", label: "編集できない（提出したら確定）" },
            { value: "UNTIL_CLOSE", label: "受付終了まで編集できる" },
            { value: "UNTIL_DATE", label: "指定した日時まで編集できる" },
          ]}
          label="回答者による編集"
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
            label="編集期限"
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
        <FormSection title="項目">
          <Text c="dimmed" size="sm">
            保存すると新しいバージョンとして公開されます。これまでの回答は
            回答した時点の項目のまま残ります。
          </Text>
          <FormBuilder fields={fields} onChange={setFields} />
          <Group justify="flex-end">
            <PrimaryButton loading={isPending} onClick={publish} type="button">
              項目を公開
            </PrimaryButton>
          </Group>
        </FormSection>
      )}

      <div className="form-actions">
        <CancelButton
          onClick={() =>
            router.push(code ? `/general/forms/${code}` : "/general/forms")
          }
        />
        <SaveButton loading={isPending} onClick={saveSettings} type="button" />
      </div>
    </Stack>
  );
}
