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
import { useState, useTransition } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { FormActions, FormSection } from "@/components/ui/shells";
import { useTr } from "@/hooks/useTr";
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
  const tr = useTr();
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
          title: tr("エラー"),
          message: saved.error ?? tr("保存に失敗しました"),
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
            title: tr("項目を保存できませんでした"),
            message: tr("{v0}（設定は保存しました）", {
              v0: published.error ?? "項目定義が不正です",
            }),
            color: "red",
          });
          return;
        }
        notifications.show({
          message: tr("保存しました（項目は新しいバージョンとして公開）"),
          color: "green",
        });
      } else {
        notifications.show({ message: tr("保存しました"), color: "green" });
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
          { label: tr("一般") },
          { label: tr("フォーム"), href: "/general/forms" },
          { label: mode === "new" ? "新規" : tr("編集") },
        ]}
        title={mode === "new" ? "フォームを作る" : tr("フォームを編集")}
      />

      <FormSection title={tr("基本設定")}>
        <TextInput
          label={tr("タイトル")}
          onChange={(e) => set({ title: e.currentTarget.value })}
          placeholder={tr("商談メモ")}
          value={values.title}
          withAsterisk
        />
        <Textarea
          autosize
          description={tr(
            tr(
              tr(
                "回答画面の先頭に出る説明。匿名で集計する場合はその旨もここに書く",
              ),
            ),
          )}
          label={tr("説明")}
          minRows={2}
          onChange={(e) => set({ description: e.currentTarget.value })}
          value={values.description}
        />
        <Select
          data={[
            { value: "SURVEY", label: tr("アンケート（回答を集める）") },
            {
              value: "REQUEST",
              label: tr("申請・報告（承認ステップを付けられる）"),
            },
          ]}
          label={tr("種類")}
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
            { value: "SHOWN", label: tr("回答者を表示する") },
            { value: "HIDDEN", label: tr("回答者を表示しない（匿名で集計）") },
          ]}
          description={tr(
            tr(
              tr(
                "「表示しない」でも回答者はシステムに記録されます（本人の編集と操作履歴のため）。完全な匿名ではありません",
              ),
            ),
          )}
          label={tr("回答者の表示")}
          onChange={(v) =>
            set({ respondentVisibility: (v as "SHOWN" | "HIDDEN") ?? "SHOWN" })
          }
          value={values.respondentVisibility}
        />
        {values.kind === "REQUEST" && (
          <Checkbox
            checked={values.approvalEnabled}
            description={tr(
              tr(
                tr(
                  "承認の段と承認グループは、このフォームの「承認」タブで決めます",
                ),
              ),
            )}
            label={tr("承認フローを使う")}
            onChange={(e) => set({ approvalEnabled: e.currentTarget.checked })}
          />
        )}
        {values.kind === "REQUEST" && values.approvalEnabled && (
          <Checkbox
            checked={values.editableUntilFirstApproval}
            description={tr(
              tr(
                tr(
                  "承認者が「ここを直して」と言う場面のための設定。1 人でも承認したら締まります（差し戻しは設定に関係なく直せます）",
                ),
              ),
            )}
            label={tr("承認依頼中でも、最初の承認が下りるまでは回答者が直せる")}
            ml="md"
            onChange={(e) =>
              set({ editableUntilFirstApproval: e.currentTarget.checked })
            }
          />
        )}
        {values.kind === "REQUEST" && (
          <Text c="dimmed" size="xs">
            {tr(
              tr(
                tr(
                  "完了（承認フローを使うなら全段の承認、使わないなら提出）したときの\n            通知先は、「共有」タブで共有先ごとに「完了通知」を付けて決めます。\n            通知を受け取った人は、承認・予定 (CM01) の「完了した申請」でも\n            一覧を見られます。",
                ),
              ),
            )}
          </Text>
        )}
        <Checkbox
          checked={!values.allowMultiple}
          label={tr("1 人 1 回だけ回答できるようにする")}
          onChange={(e) => set({ allowMultiple: !e.currentTarget.checked })}
        />
      </FormSection>

      <FormSection title={tr("受付期間")}>
        <DateTimePicker
          clearable
          description={tr("空なら公開した時点から受け付けます")}
          label={tr("受付開始")}
          onChange={(v) => set({ opensAt: toIso(v) })}
          value={values.opensAt ? new Date(values.opensAt) : null}
          valueFormat="YYYY/MM/DD HH:mm"
        />
        <DateTimePicker
          clearable
          description={tr(
            "この時刻を過ぎると自動で受付を終了します（操作は不要）",
          )}
          label={tr("受付終了")}
          onChange={(v) => set({ closesAt: toIso(v) })}
          value={values.closesAt ? new Date(values.closesAt) : null}
          valueFormat="YYYY/MM/DD HH:mm"
        />
        <Select
          data={[
            { value: "NONE", label: tr("編集できない（提出したら確定）") },
            { value: "UNTIL_CLOSE", label: tr("受付終了まで編集できる") },
            { value: "UNTIL_DATE", label: tr("指定した日時まで編集できる") },
          ]}
          label={tr("回答者による編集")}
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
            label={tr("編集期限")}
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
        <FormSection title={tr("項目")}>
          <Text c="dimmed" size="sm">
            {tr(
              tr(
                tr(
                  "下の「保存」で、設定と一緒に保存されます。項目に手を入れた場合は\n            新しいバージョンとして公開され、これまでの回答は回答した時点の\n            項目のまま残ります。",
                ),
              ),
            )}
          </Text>
          <FormBuilder fields={fields} onChange={setFields} />
          {fieldsDirty && (
            <Text c="orange" size="xs">
              {tr("項目に未保存の変更があります。")}
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
