"use client";

/**
 * ApprovalGroupForm.tsx — 承認グループ 新規作成 / 編集フォーム (MS1B / MS2B).
 *
 * グループは承認者の集合。どの書類の何段目で使うかは承認フローが決める。
 * メンバーは詳細画面の「メンバー」タブで管理する（design.md §13.5）。
 */

import { SimpleGrid, Switch } from "@mantine/core";
import { useForm } from "@mantine/form";
import { notifications } from "@mantine/notifications";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { z } from "zod";
import {
  createApprovalGroup,
  updateApprovalGroup,
} from "@/app/(dashboard)/master/approval-settings/actions";
import { ActiveBadge } from "@/components/ui/ActiveBadge";
import { HelpLabel } from "@/components/ui/HelpLabel";
import {
  FormSection,
  FormShell,
  LocalizedTextInput,
} from "@/components/ui/shells";
import { useIsMobile } from "@/hooks/useViewport";
import { fieldHelp, fieldHelpTip } from "@/lib/field-help";
import { zodResolver } from "@/lib/form";
import type { Tr } from "@/lib/i18n";

const BASE_PATH = "/master/approval-settings";

function buildGroupSchema(tr: Tr) {
  return z.object({
    nameJa: z.string().min(1, tr("master.approvalGroupForm.enterNameJa")),
    nameTranslations: z.record(z.string(), z.string()).default({}),
    isActive: z.boolean(),
  });
}

type FormValues = z.infer<ReturnType<typeof buildGroupSchema>>;

export interface ApprovalGroupFormInitial {
  id: number;
  nameJa: string;
  nameTranslations: Record<string, string>;
  isActive: boolean;
}

export function ApprovalGroupForm({
  initial,
}: {
  initial?: ApprovalGroupFormInitial;
}) {
  const tr = useTranslations();
  const router = useRouter();
  const _isMobile = useIsMobile();
  const [isPending, startTransition] = useTransition();
  const isEdit = !!initial;

  const form = useForm<FormValues>({
    validate: zodResolver(buildGroupSchema(tr)),
    initialValues: {
      nameJa: initial?.nameJa ?? "",
      nameTranslations: initial?.nameTranslations ?? {},
      isActive: initial?.isActive ?? true,
    },
  });

  const handleSubmit = (values: FormValues) => {
    startTransition(async () => {
      const input = {
        nameJa: values.nameJa,
        nameTranslations: values.nameTranslations,
        isActive: values.isActive,
      };
      const result = isEdit
        ? await updateApprovalGroup(initial.id, input)
        : await createApprovalGroup(input);
      if (result.ok) {
        notifications.show({
          title: tr("common.saved2"),
          message: isEdit
            ? tr("master.approvalSettings.theApprovalGroupWasUpdated")
            : tr("master.approvalSettings.theApprovalGroupWasCreated"),
          color: "green",
        });
        router.push(`${BASE_PATH}/${result.data.id}`);
      } else {
        notifications.show({
          title: tr("common.error2"),
          message: result.error,
          color: "red",
        });
      }
    });
  };

  return (
    <FormShell
      breadcrumbs={[
        tr("common.masterData"),
        { label: tr("common.approvalGroup"), href: BASE_PATH },
        isEdit ? tr("common.edit") : tr("common.new2"),
      ]}
      isDirty={form.isDirty()}
      isPending={isPending}
      onCancel={() =>
        router.push(isEdit ? `${BASE_PATH}/${initial.id}` : BASE_PATH)
      }
      onSubmit={form.onSubmit(handleSubmit)}
      status={isEdit ? <ActiveBadge active={initial.isActive} /> : undefined}
      title={
        isEdit
          ? tr("master.approvalGroupForm.editTitle", { name: initial.nameJa })
          : tr("master.approvalSettings.newApprovalGroup")
      }
    >
      <FormSection
        description={tr("master.approvalSettings.whichDocumentAndWhichStepIt")}
        title={tr("common.basicInformation")}
      >
        <SimpleGrid cols={1} spacing="sm">
          <LocalizedTextInput
            help={fieldHelpTip("approvalGroup", "name")}
            jaProps={form.getInputProps("nameJa")}
            label={tr("common.name2")}
            required
            translationsProps={form.getInputProps("nameTranslations")}
          />
          <Switch
            label={<HelpLabel {...fieldHelp("approvalGroup", "active")} />}
            {...form.getInputProps("isActive", { type: "checkbox" })}
          />
        </SimpleGrid>
      </FormSection>
    </FormShell>
  );
}
