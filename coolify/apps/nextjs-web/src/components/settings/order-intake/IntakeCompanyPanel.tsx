"use client";

/**
 * IntakeCompanyPanel — 取込口の自社法人（SY0C）。
 *
 * 取込で作る注文請書は、作成時にこの法人を持つ（発行元は作成後に変えられない）。
 * いまの取込口は環境ごとに 1 つ（取込フォルダ。メールと外部連携もそこへ置く）
 * なので、設定も 1 つ — lib/intake-company.ts。
 *
 * 既定は閲覧、押して編集、保存したら閲覧へ戻る（_specs/design.md §10.10）。
 */

import { Paper, Select, Stack, Text } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { updateIntakeCompany } from "@/app/(dashboard)/settings/order-intake/actions";
import { EditablePanel } from "@/components/ui/EditablePanel";
import { FieldValue } from "@/components/ui/FieldValue";
import { FormActions } from "@/components/ui/shells";

export interface IntakeCompanyOption {
  value: string;
  label: string;
}

/** 「既定の法人に従う」を表す Select の値（法人 id は正の整数なので衝突しない）。 */
const DEFAULT_VALUE = "default";

function Editor({
  companyId,
  options,
  onClose,
}: {
  companyId: number | null;
  options: IntakeCompanyOption[];
  onClose: () => void;
}) {
  const tr = useTranslations();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [value, setValue] = useState(
    companyId != null ? String(companyId) : DEFAULT_VALUE,
  );

  const save = () => {
    startTransition(async () => {
      const res = await updateIntakeCompany(
        value === DEFAULT_VALUE ? null : Number(value),
      );
      if (res.ok) {
        notifications.show({
          title: tr("common.saved2"),
          message: tr("settings.orderIntake.intakeCompanySaved"),
          color: "green",
        });
        onClose();
        router.refresh();
      } else {
        notifications.show({
          title: tr("common.error2"),
          message: res.error,
          color: "red",
        });
      }
    });
  };

  return (
    <Stack gap="md">
      <Select
        allowDeselect={false}
        data={[
          {
            value: DEFAULT_VALUE,
            label: tr("settings.orderIntake.intakeCompanyDefault"),
          },
          ...options,
        ]}
        label={tr("settings.orderIntake.intakeCompany")}
        maw={420}
        onChange={(v) => setValue(v ?? DEFAULT_VALUE)}
        value={value}
      />
      <FormActions loading={isPending} onCancel={onClose} onSave={save} />
    </Stack>
  );
}

export function IntakeCompanyPanel({
  companyId,
  options,
  canEdit,
}: {
  /** いまの設定（null = 既定の法人に従う）。 */
  companyId: number | null;
  options: IntakeCompanyOption[];
  canEdit: boolean;
}) {
  const tr = useTranslations();
  const current =
    companyId != null
      ? (options.find((o) => o.value === String(companyId))?.label ?? "—")
      : tr("settings.orderIntake.intakeCompanyDefault");

  return (
    <Paper p="md" radius="md" withBorder>
      <EditablePanel
        canEdit={canEdit}
        description={
          <Text c="dimmed" size="xs">
            {tr("settings.orderIntake.intakeCompanyDesc")}
          </Text>
        }
        edit={({ close }) => (
          <Editor companyId={companyId} onClose={close} options={options} />
        )}
        title={tr("settings.orderIntake.intakeCompanyTitle")}
        view={
          <FieldValue
            label={tr("settings.orderIntake.intakeCompany")}
            value={current}
          />
        }
      />
    </Paper>
  );
}
