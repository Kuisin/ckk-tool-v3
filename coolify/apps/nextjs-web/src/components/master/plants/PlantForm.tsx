"use client";

/**
 * PlantForm.tsx — 拠点 新規作成 / 編集フォーム (MS1C / MS2C edit).
 *
 * 拠点コードは手入力（unique）。識別子のため編集時は変更不可（disabled）。
 * 名称・住所は { ja, en } ペア入力（LocalizedTextInput）。
 */

import {
  Select,
  SimpleGrid,
  Stack,
  Switch,
  Textarea,
  TextInput,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { notifications } from "@mantine/notifications";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useTransition } from "react";
import { z } from "zod";
import {
  createPlant,
  updatePlant,
} from "@/app/(dashboard)/master/plants/actions";
import { ActiveBadge } from "@/components/ui/ActiveBadge";
import { HelpLabel } from "@/components/ui/HelpLabel";
import {
  FormSection,
  FormShell,
  LocalizedTextInput,
} from "@/components/ui/shells";
import { useIsMobile } from "@/hooks/useViewport";
import { countryOptions } from "@/lib/enum-labels";
import { fieldHelp, fieldHelpTip } from "@/lib/field-help";
import { zodResolver } from "@/lib/form";

const BASE_PATH = "/master/plants";

interface FormValues {
  code: string;
  nameJa: string;
  nameTranslations: Record<string, string>;
  nameKana: string;
  countryCode: string | null;
  regionId: string | null;
  postalCode: string;
  addressJa: string;
  addressTranslations: Record<string, string>;
  phone: string;
  email: string;
  contactPerson: string;
  isActive: boolean;
  notes: string;
}

export interface PlantFormInitial {
  id: number;
  code: string;
  nameJa: string;
  nameTranslations: Record<string, string>;
  nameKana: string;
  countryCode: string | null;
  regionId: number | null;
  postalCode: string;
  addressJa: string;
  addressTranslations: Record<string, string>;
  phone: string;
  email: string;
  contactPerson: string;
  isActive: boolean;
  notes: string;
}

export function PlantForm({
  initial,
  regionOptions,
}: {
  initial?: PlantFormInitial;
  /** 地域 Select の選択肢（value = String(region id)）。 */
  regionOptions: { value: string; label: string }[];
}) {
  const tr = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const isMobile = useIsMobile();
  const [isPending, startTransition] = useTransition();
  const isEdit = !!initial;

  const plantSchema = z.object({
    code: z.string().min(1, tr("master.plantForm.enterSiteCode")),
    nameJa: z.string().min(1, tr("common.enterNameInJapanese")),
    nameTranslations: z.record(z.string(), z.string()).default({}),
    nameKana: z.string(),
    countryCode: z.string().nullable(),
    regionId: z.string().nullable(),
    postalCode: z.string(),
    addressJa: z.string(),
    addressTranslations: z.record(z.string(), z.string()).default({}),
    phone: z.string(),
    email: z.string().email(tr("common.invalidEmailFormat")).or(z.literal("")),
    contactPerson: z.string(),
    isActive: z.boolean(),
    notes: z.string(),
  });

  const form = useForm<FormValues>({
    validate: zodResolver(plantSchema),
    initialValues: {
      code: initial?.code ?? "",
      nameJa: initial?.nameJa ?? "",
      nameTranslations: initial?.nameTranslations ?? {},
      nameKana: initial?.nameKana ?? "",
      countryCode: initial?.countryCode ?? "JP",
      regionId: initial?.regionId != null ? String(initial.regionId) : null,
      postalCode: initial?.postalCode ?? "",
      addressJa: initial?.addressJa ?? "",
      addressTranslations: initial?.addressTranslations ?? {},
      phone: initial?.phone ?? "",
      email: initial?.email ?? "",
      contactPerson: initial?.contactPerson ?? "",
      isActive: initial?.isActive ?? true,
      notes: initial?.notes ?? "",
    },
  });

  const handleSubmit = (values: FormValues) => {
    const payload = {
      ...values,
      regionId: values.regionId ? Number(values.regionId) : null,
    };
    startTransition(async () => {
      const result = isEdit
        ? await updatePlant(initial.id, payload)
        : await createPlant(payload);
      if (result.ok) {
        notifications.show({
          title: tr("common.saved2"),
          message: isEdit
            ? tr("master.plantForm.siteUpdatedMessage")
            : tr("master.plants.theSiteWasCreated"),
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
        { label: tr("master.plantTable.title"), href: BASE_PATH },
        isEdit ? tr("common.edit2") : tr("common.new2"),
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
          ? tr("master.plantForm.editTitle", { code: initial.code })
          : tr("master.plants.newSite")
      }
    >
      <FormSection title={tr("common.basicInformation")}>
        <SimpleGrid cols={isMobile ? 1 : 2} spacing="sm">
          <TextInput
            description={
              isEdit
                ? tr("common.itCannotBeChangedOnceCreated")
                : tr("master.plants.aUniqueCodeIdentifyingTheSite")
            }
            disabled={isEdit}
            label={<HelpLabel {...fieldHelp("plant", "code")} />}
            placeholder={tr("master.plants.eGF01")}
            withAsterisk={!isEdit}
            {...form.getInputProps("code")}
          />
          <TextInput
            label={
              <HelpLabel
                {...fieldHelp("plant", "name", { label: tr("common.kana2") })}
              />
            }
            placeholder={tr("master.plants.eGHonshaKojo")}
            {...form.getInputProps("nameKana")}
          />
        </SimpleGrid>
        <Stack gap="sm" mt="sm">
          <LocalizedTextInput
            help={fieldHelpTip("plant", "name")}
            jaProps={form.getInputProps("nameJa")}
            label={tr("common.name2")}
            required
            translationsProps={form.getInputProps("nameTranslations")}
          />
          <Switch
            label={<HelpLabel {...fieldHelp("plant", "active")} />}
            {...form.getInputProps("isActive", { type: "checkbox" })}
          />
        </Stack>
        <Textarea
          label={<HelpLabel {...fieldHelp("plant", "notes")} />}
          mt="sm"
          placeholder={tr("common.notesAndRemarks")}
          rows={3}
          {...form.getInputProps("notes")}
        />
      </FormSection>

      <FormSection title={tr("master.plants.contactAndAddress")}>
        <SimpleGrid cols={isMobile ? 1 : 2} spacing="sm">
          <Select
            clearable
            data={countryOptions(locale)}
            label={
              <HelpLabel
                {...fieldHelp("plant", "region", {
                  label: tr("common.country"),
                })}
              />
            }
            placeholder={tr("common.selectACountry")}
            {...form.getInputProps("countryCode")}
          />
          <Select
            clearable
            data={regionOptions}
            description={tr(
              "master.plants.regionsCoveredByRegionScopePermissions",
            )}
            label={
              <HelpLabel
                {...fieldHelp("plant", "region", {
                  label: tr("common.region"),
                })}
              />
            }
            placeholder={tr("master.plants.selectARegion")}
            searchable={regionOptions.length > 5}
            {...form.getInputProps("regionId")}
          />
          <TextInput
            label={
              <HelpLabel
                {...fieldHelp("plant", "address", {
                  label: tr("common.postalCode"),
                })}
              />
            }
            placeholder={tr("master.plants.eG1234567")}
            {...form.getInputProps("postalCode")}
          />
        </SimpleGrid>
        <Stack gap="sm" mt="sm">
          <LocalizedTextInput
            help={fieldHelpTip("plant", "address")}
            jaProps={form.getInputProps("addressJa")}
            label={tr("common.address")}
            translationsProps={form.getInputProps("addressTranslations")}
          />
        </Stack>
        <SimpleGrid cols={isMobile ? 1 : 2} mt="sm" spacing="sm">
          <TextInput
            label={
              <HelpLabel
                {...fieldHelp("plant", "contact", {
                  label: tr("common.phoneNumber"),
                })}
              />
            }
            placeholder={tr("master.plants.eG0312345678")}
            {...form.getInputProps("phone")}
          />
          <TextInput
            label={
              <HelpLabel
                {...fieldHelp("plant", "contact", {
                  label: tr("common.emailAddress"),
                })}
              />
            }
            placeholder={tr("master.plants.eGPlantExampleCoJp")}
            {...form.getInputProps("email")}
          />
        </SimpleGrid>
        <SimpleGrid cols={isMobile ? 1 : 2} mt="sm" spacing="sm">
          <TextInput
            label={
              <HelpLabel
                {...fieldHelp("plant", "contact", {
                  label: tr("common.assignee"),
                })}
              />
            }
            placeholder={tr("master.plants.eGTaroYamada")}
            {...form.getInputProps("contactPerson")}
          />
        </SimpleGrid>
      </FormSection>
    </FormShell>
  );
}
