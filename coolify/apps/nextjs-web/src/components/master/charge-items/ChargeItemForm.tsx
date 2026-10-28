"use client";

/**
 * ChargeItemForm.tsx — 料金マスタ 新規作成 (MS1G).
 *
 * 詳細ページを持たないマスタなので、保存後は一覧へ戻る（編集は一覧のモーダル）。
 */

import { TextInput } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { createChargeItem } from "@/app/(dashboard)/master/charge-items/actions";
import { FormSection, FormShell } from "@/components/ui/shells";
import {
  ChargeItemFields,
  type ChargeItemFieldValues,
} from "./ChargeItemFields";

const BASE_PATH = "/master/charge-items";

const EMPTY: ChargeItemFieldValues = {
  amountMode: "VARIABLE",
  defaultAmount: null,
  isActive: true,
  nameJa: "",
  nameTranslations: {},
  notes: "",
  sortOrder: 0,
  taxCategoryId: null,
};

export function ChargeItemForm({
  taxCategoryOptions,
}: {
  taxCategoryOptions: { value: string; label: string }[];
}) {
  const tr = useTranslations();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [code, setCode] = useState("");
  const [values, setValues] = useState<ChargeItemFieldValues>(EMPTY);
  const [codeError, setCodeError] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);

  const dirty = code !== "" || JSON.stringify(values) !== JSON.stringify(EMPTY);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const missingCode = !code.trim();
    const missingName = !values.nameJa.trim();
    setCodeError(missingCode ? tr("common.codeRequired") : null);
    setNameError(missingName ? tr("common.nameJaRequired") : null);
    if (missingCode || missingName) return;
    startTransition(async () => {
      const result = await createChargeItem({ ...values, code });
      if (result.ok) {
        notifications.show({
          title: tr("common.saved2"),
          message: tr("master.chargeItems.created"),
          color: "green",
        });
        router.push(BASE_PATH);
        return;
      }
      notifications.show({
        title: tr("common.error2"),
        message: result.error,
        color: "red",
      });
    });
  };

  return (
    <FormShell
      breadcrumbs={[
        tr("common.masterData"),
        { label: tr("master.chargeItems.pageTitle"), href: BASE_PATH },
        tr("common.new2"),
      ]}
      isDirty={dirty}
      isPending={isPending}
      onCancel={() => router.push(BASE_PATH)}
      onSubmit={handleSubmit}
      title={tr("master.chargeItems.newChargeItem")}
    >
      <FormSection title={tr("common.basicInformation")}>
        <TextInput
          description={tr("master.chargeItems.codeHelp")}
          error={codeError}
          label={tr("common.code")}
          mb="sm"
          onChange={(e) => setCode(e.currentTarget.value)}
          placeholder={tr("master.chargeItems.codePlaceholder")}
          value={code}
          withAsterisk
        />
        <ChargeItemFields
          nameError={nameError}
          onChange={(part) => {
            if (part.nameJa !== undefined) setNameError(null);
            setValues((v) => ({ ...v, ...part }));
          }}
          taxCategoryOptions={taxCategoryOptions}
          values={values}
        />
      </FormSection>
    </FormShell>
  );
}
