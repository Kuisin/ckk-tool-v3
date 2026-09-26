"use client";

/**
 * RegrindItemForm.tsx — 再研磨品目 新規作成 (MS1H).
 *
 * コードは保存時に採番する（RGD-YYYYMM-NNNN）ので入力欄が無い。
 * 詳細ページを持たないマスタなので、保存後は一覧へ戻る（編集は一覧のモーダル）。
 */

import { notifications } from "@mantine/notifications";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { createRegrindItem } from "@/app/(dashboard)/master/regrind-items/actions";
import { FormSection, FormShell } from "@/components/ui/shells";
import {
  RegrindItemFields,
  type RegrindItemFieldValues,
} from "./RegrindItemFields";

const BASE_PATH = "/master/regrind-items";

const EMPTY: RegrindItemFieldValues = {
  flutes: null,
  isActive: true,
  location: null,
  matchNames: [],
  nameJa: "",
  nameTranslations: {},
  notes: "",
  sizeMaxMm: null,
  sizeMinMm: null,
  standardUnitPrice: null,
  toolClass: null,
  // i18n-ignore — 単位は DB に入るデータ（既定値）。訳す対象ではない
  unit: "本",
};

export function RegrindItemForm() {
  const tr = useTranslations();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [values, setValues] = useState<RegrindItemFieldValues>(EMPTY);
  const [nameError, setNameError] = useState<string | null>(null);

  const dirty = JSON.stringify(values) !== JSON.stringify(EMPTY);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!values.nameJa.trim()) {
      setNameError(tr("common.nameJaRequired"));
      return;
    }
    setNameError(null);
    startTransition(async () => {
      const result = await createRegrindItem(values);
      if (result.ok) {
        notifications.show({
          title: tr("common.saved2"),
          message: tr("master.regrindItems.created", {
            code: result.data.code,
          }),
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
        { label: tr("master.regrindItems.pageTitle"), href: BASE_PATH },
        tr("common.new2"),
      ]}
      isDirty={dirty}
      isPending={isPending}
      onCancel={() => router.push(BASE_PATH)}
      onSubmit={handleSubmit}
      title={tr("master.regrindItems.newRegrindItem")}
    >
      <FormSection
        description={tr("master.regrindItems.formHelp")}
        title={tr("common.basicInformation")}
      >
        <RegrindItemFields
          nameError={nameError}
          onChange={(part) => {
            if (part.nameJa !== undefined) setNameError(null);
            setValues((v) => ({ ...v, ...part }));
          }}
          values={values}
        />
      </FormSection>
    </FormShell>
  );
}
