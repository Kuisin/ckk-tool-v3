"use client";

/**
 * MaterialReceiptForm — 素材入荷 新規登録 (PU13, design.md §8.3)。
 *
 * 直接調達（発注書を経由しない外部調達）の入荷登録。
 * 素材 SearchSelect（必須）/ 仕入先 Select（任意）/ 入荷先拠点 Select（任意）/
 * 数量 + 単位 / 入荷日（既定: 今日）/ 備考 / 証憑（任意・複数可）。
 * 保存で material_receipts を作成し onMaterialReceipt で在庫入庫。証憑を
 * 選択していれば作成後に /api/attachments/upload へ順次 POST（進捗通知付き・
 * 失敗しても登録自体は成立）してから詳細へ遷移する。
 * 発注入荷は素材発注書 (PU02) の「入荷完了」から自動作成される。
 */

import {
  ActionIcon,
  FileButton,
  Group,
  NumberInput,
  Paper,
  Select,
  SimpleGrid,
  Stack,
  Text,
  Textarea,
} from "@mantine/core";
import { DatePickerInput } from "@mantine/dates";
import { useForm } from "@mantine/form";
import { notifications } from "@mantine/notifications";
import { IconCalendar, IconPaperclip, IconX } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { z } from "zod";
import { searchMaterialOptions } from "@/app/(dashboard)/_shared/option-search";
import { createMaterialReceipt } from "@/app/(dashboard)/purchase/material-receipts/actions";
import {
  ATTACHMENT_ACCEPT,
  ATTACHMENT_MAX_BYTES,
} from "@/components/ui/AttachmentsPanel";
import { SecondaryButton } from "@/components/ui/buttons";
import { HelpLabel } from "@/components/ui/HelpLabel";
import { SearchSelect } from "@/components/ui/SearchSelect";
import { FormSection, FormShell } from "@/components/ui/shells";
import { unitOptions } from "@/lib/enum-labels";
import { fieldHelp } from "@/lib/field-help";
import { zodResolver } from "@/lib/form";

const BASE_PATH = "/purchase/material-receipts";

interface Option {
  value: string;
  label: string;
}

function buildSchema(tr: ReturnType<typeof useTranslations>) {
  return z.object({
    materialId: z
      .string()
      .min(1, tr("purchase.materialReceipts.selectAMaterial")),
    supplierBpId: z.string().nullable(),
    plantId: z.string().nullable(),
    quantity: z
      .number()
      .positive(tr("purchase.materialReceipts.mustBeGreaterThanZero")),
    unit: z.string().min(1, tr("common.required")),
    receivedAt: z
      .string()
      .min(1, tr("purchase.materialReceipts.enterAReceivedDate")),
    notes: z.string(),
  });
}

type FormValues = z.infer<ReturnType<typeof buildSchema>>;

const today = () => new Date().toISOString().slice(0, 10);

export function MaterialReceiptForm({
  supplierOptions,
  plantOptions,
}: {
  /** 仕入先（VENDOR ロールの有効 BP）。value = uuid。 */
  supplierOptions: Option[];
  /** 入荷先拠点（有効のみ）。value = String(内部 id)。 */
  plantOptions: Option[];
}) {
  const tr = useTranslations();
  const locale = useLocale();
  const schema = buildSchema(tr);
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  // 証憑（任意・複数可）。登録成功後に順次アップロードする。
  const [files, setFiles] = useState<File[]>([]);

  const addFiles = (selected: File[]) => {
    const tooLarge = selected.filter((f) => f.size > ATTACHMENT_MAX_BYTES);
    if (tooLarge.length > 0) {
      notifications.show({
        title: tr("common.error2"),
        message: tr("purchase.materialReceipts.filesTooLargeToAttach", {
          files: tooLarge.map((f) => f.name).join(", "),
        }),
        color: "red",
      });
    }
    setFiles((cur) => [
      ...cur,
      ...selected.filter((f) => f.size <= ATTACHMENT_MAX_BYTES),
    ]);
  };

  /** 登録した入荷（uuid）へ証憑を順次アップロード（進捗通知付き・best-effort）。 */
  const uploadAttachments = async (receiptId: string) => {
    const notificationId = notifications.show({
      title: tr("purchase.materialReceipts.uploadingTheSupportingDocument"),
      message: tr("purchase.materialReceipts.uploadProgress", {
        current: 0,
        total: files.length,
      }),
      loading: true,
      autoClose: false,
      withCloseButton: false,
    });
    const failed: string[] = [];
    for (const [index, file] of files.entries()) {
      notifications.update({
        id: notificationId,
        title: tr("purchase.materialReceipts.uploadingTheSupportingDocument"),
        message: tr("purchase.materialReceipts.uploadProgressWithFile", {
          current: index + 1,
          total: files.length,
          name: file.name,
        }),
        loading: true,
        autoClose: false,
        withCloseButton: false,
      });
      try {
        const body = new FormData();
        body.set("ownerType", "material_receipts");
        body.set("ownerId", receiptId);
        body.set("file", file);
        const res = await fetch("/api/attachments/upload", {
          method: "POST",
          body,
        });
        const json = (await res.json().catch(() => null)) as {
          ok?: boolean;
        } | null;
        if (!(res.ok && json?.ok)) failed.push(file.name);
      } catch {
        failed.push(file.name);
      }
    }
    if (failed.length > 0) {
      notifications.update({
        id: notificationId,
        title: tr(
          "purchase.materialReceipts.someSupportingDocumentsCouldNotBe",
        ),
        message: tr("purchase.materialReceipts.failedFilesRetryFromDetail", {
          files: failed.join(", "),
        }),
        color: "orange",
        loading: false,
        autoClose: 8000,
        withCloseButton: true,
      });
    } else {
      notifications.update({
        id: notificationId,
        title: tr("purchase.materialReceipts.theSupportingDocumentWasAttached"),
        message: tr("purchase.materialReceipts.filesCount", {
          count: files.length,
        }),
        color: "green",
        loading: false,
        autoClose: 4000,
        withCloseButton: true,
      });
    }
  };

  const form = useForm<FormValues>({
    validate: zodResolver(schema),
    initialValues: {
      materialId: "",
      supplierBpId: null,
      plantId: null,
      quantity: 1,
      unit: tr("common.pcs"),
      receivedAt: today(),
      notes: "",
    },
  });

  const handleSubmit = (values: FormValues) => {
    startTransition(async () => {
      const result = await createMaterialReceipt({
        materialId: values.materialId,
        supplierBpId: values.supplierBpId,
        plantId: values.plantId,
        quantity: values.quantity,
        unit: values.unit,
        receivedAt: values.receivedAt,
        notes: values.notes,
      });
      if (result.ok) {
        notifications.show({
          title: tr("common.registered"),
          message: tr(
            "purchase.materialReceipts.theMaterialReceiptWasRegisteredAnd",
          ),
          color: "green",
        });
        // 証憑が選択されていれば作成した入荷へ順次添付してから遷移する。
        if (files.length > 0) {
          await uploadAttachments(result.data.id);
        }
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
        tr("common.purchasing"),
        { label: tr("common.materialReceipt"), href: BASE_PATH },
        tr("purchase.materialReceipts.register"),
      ]}
      isDirty={form.isDirty()}
      isPending={isPending}
      onCancel={() => router.push(BASE_PATH)}
      onSubmit={form.onSubmit(handleSubmit)}
      submitLabel={tr("common.register")}
      title={tr("purchase.materialReceipts.newMaterialReceipt")}
    >
      <FormSection
        description={tr(
          "purchase.materialReceipts.registersADirectPurchaseAReceipt",
        )}
        title={tr("purchase.materialReceipts.receiptInformation")}
      >
        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
          <SearchSelect
            error={form.errors.materialId}
            label={
              <HelpLabel {...fieldHelp(tr, "materialReceipt", "material")} />
            }
            onChange={(v) => form.setFieldValue("materialId", v ?? "")}
            onSearch={searchMaterialOptions}
            placeholder={tr("common.searchMaterials")}
            storageKey="material"
            value={form.values.materialId || null}
            withAsterisk
          />
          <Select
            clearable
            data={supplierOptions}
            label={
              <HelpLabel {...fieldHelp(tr, "materialReceipt", "supplier")} />
            }
            placeholder={tr(
              "purchase.materialReceipts.selectASupplierOptional",
            )}
            searchable
            {...form.getInputProps("supplierBpId")}
          />
          <Select
            clearable
            data={plantOptions}
            label={<HelpLabel {...fieldHelp(tr, "materialReceipt", "plant")} />}
            placeholder={tr("common.selectASiteOptional")}
            {...form.getInputProps("plantId")}
          />
          <DatePickerInput
            label={
              <HelpLabel
                {...fieldHelp(tr, "materialReceipt", "receivedDate")}
              />
            }
            leftSection={<IconCalendar size={14} />}
            valueFormat="YYYY/MM/DD"
            withAsterisk
            {...form.getInputProps("receivedAt")}
          />
          <NumberInput
            decimalScale={3}
            label={
              <HelpLabel {...fieldHelp(tr, "materialReceipt", "quantity")} />
            }
            min={0}
            withAsterisk
            {...form.getInputProps("quantity")}
          />
          <Select
            data={unitOptions(locale)}
            label={tr("common.unit")}
            withAsterisk
            {...form.getInputProps("unit")}
          />
        </SimpleGrid>
        <Textarea
          autosize
          label={tr("common.notes")}
          minRows={2}
          mt="sm"
          placeholder={tr("common.notesOptional")}
          {...form.getInputProps("notes")}
        />
      </FormSection>

      {/* 証憑（任意） — 登録成功後に順次アップロードして詳細へ */}
      <FormSection
        description={tr(
          "purchase.materialReceipts.youCanAttachDeliveryNoteCopies",
        )}
        title={tr("purchase.materialReceipts.supportingDocumentOptional")}
      >
        <Stack gap="xs">
          {files.map((file, index) => (
            <Paper key={`${file.name}-${index}`} p="xs" radius="sm" withBorder>
              <Group gap="sm" justify="space-between" wrap="nowrap">
                <Group className="min-w-0" gap="xs" wrap="nowrap">
                  <IconPaperclip size={14} />
                  <Text size="sm" truncate>
                    {file.name}
                  </Text>
                  <Text c="dimmed" className="shrink-0" size="xs">
                    {file.size < 1024 * 1024
                      ? `${Math.max(1, Math.round(file.size / 1024))} KB`
                      : `${(file.size / (1024 * 1024)).toFixed(1)} MB`}
                  </Text>
                </Group>
                <ActionIcon
                  aria-label={tr("purchase.materialReceipts.removeFile", {
                    name: file.name,
                  })}
                  color="gray"
                  onClick={() =>
                    setFiles((cur) => cur.filter((_, i) => i !== index))
                  }
                  variant="subtle"
                >
                  <IconX size={14} />
                </ActionIcon>
              </Group>
            </Paper>
          ))}
          <Group>
            <FileButton accept={ATTACHMENT_ACCEPT} multiple onChange={addFiles}>
              {(props) => (
                <SecondaryButton
                  leftSection={<IconPaperclip size={14} />}
                  {...props}
                >
                  {tr("common.selectAFile")}
                </SecondaryButton>
              )}
            </FileButton>
          </Group>
        </Stack>
      </FormSection>
    </FormShell>
  );
}
