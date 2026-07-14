"use client";

/**
 * MaterialReceiptForm — 素材入荷 新規登録 (PU11, design.md §8.3)。
 *
 * 直接調達（発注書を経由しない外部調達）の入荷登録。
 * 素材 SearchSelect（必須）/ 仕入先 Select（任意）/ 入荷先工場 Select（任意）/
 * 数量 + 単位 / 入荷日（既定: 今日）/ 備考 / 証憑（任意・複数可）。
 * 保存で material_receipts を作成し onMaterialReceipt で在庫入庫。証憑を
 * 選択していれば作成後に /api/attachments/upload へ順次 POST（進捗通知付き・
 * 失敗しても登録自体は成立）してから詳細へ遷移する。
 * 発注入荷は素材発注書 (PU03) の「入荷完了」から自動作成される。
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
import { useState, useTransition } from "react";
import { z } from "zod";
import { searchMaterialOptions } from "@/app/(dashboard)/_shared/option-search";
import { createMaterialReceipt } from "@/app/(dashboard)/purchase/material-receipts/actions";
import {
  ATTACHMENT_ACCEPT,
  ATTACHMENT_MAX_BYTES,
} from "@/components/ui/AttachmentsPanel";
import { SecondaryButton } from "@/components/ui/buttons";
import { SearchSelect } from "@/components/ui/SearchSelect";
import { FormSection, FormShell } from "@/components/ui/shells";
import { UNIT_OPTIONS } from "@/lib/enum-labels";
import { zodResolver } from "@/lib/form";

const BASE_PATH = "/purchase/material-receipts";

interface Option {
  value: string;
  label: string;
}

const schema = z.object({
  materialId: z.string().min(1, "素材を選択してください"),
  supplierBpId: z.string().nullable(),
  factoryId: z.string().nullable(),
  quantity: z.number().positive("0より大きい値"),
  unit: z.string().min(1, "必須"),
  receivedAt: z.string().min(1, "入荷日を入力してください"),
  notes: z.string(),
});

type FormValues = z.infer<typeof schema>;

const today = () => new Date().toISOString().slice(0, 10);

export function MaterialReceiptForm({
  supplierOptions,
  factoryOptions,
}: {
  /** 仕入先（VENDOR ロールの有効 BP）。value = uuid。 */
  supplierOptions: Option[];
  /** 入荷先工場（有効のみ）。value = String(内部 id)。 */
  factoryOptions: Option[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  // 証憑（任意・複数可）。登録成功後に順次アップロードする。
  const [files, setFiles] = useState<File[]>([]);

  const addFiles = (selected: File[]) => {
    const tooLarge = selected.filter((f) => f.size > ATTACHMENT_MAX_BYTES);
    if (tooLarge.length > 0) {
      notifications.show({
        title: "エラー",
        message: `20MB を超えるファイルは添付できません: ${tooLarge
          .map((f) => f.name)
          .join(", ")}`,
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
      title: "証憑をアップロード中",
      message: `0 / ${files.length} 件`,
      loading: true,
      autoClose: false,
      withCloseButton: false,
    });
    const failed: string[] = [];
    for (const [index, file] of files.entries()) {
      notifications.update({
        id: notificationId,
        title: "証憑をアップロード中",
        message: `${index + 1} / ${files.length} 件: ${file.name}`,
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
        title: "一部の証憑を添付できませんでした",
        message: `${failed.join(", ")} — 詳細画面から再度添付してください`,
        color: "orange",
        loading: false,
        autoClose: 8000,
        withCloseButton: true,
      });
    } else {
      notifications.update({
        id: notificationId,
        title: "証憑を添付しました",
        message: `${files.length} 件`,
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
      factoryId: null,
      quantity: 1,
      unit: "本",
      receivedAt: today(),
      notes: "",
    },
  });

  const handleSubmit = (values: FormValues) => {
    startTransition(async () => {
      const result = await createMaterialReceipt({
        materialId: values.materialId,
        supplierBpId: values.supplierBpId,
        factoryId: values.factoryId,
        quantity: values.quantity,
        unit: values.unit,
        receivedAt: values.receivedAt,
        notes: values.notes,
      });
      if (result.ok) {
        notifications.show({
          title: "登録しました",
          message: "素材入荷を登録し、素材在庫へ入庫しました",
          color: "green",
        });
        // 証憑が選択されていれば作成した入荷へ順次添付してから遷移する。
        if (files.length > 0) {
          await uploadAttachments(result.data.id);
        }
        router.push(`${BASE_PATH}/${result.data.id}`);
      } else {
        notifications.show({
          title: "エラー",
          message: result.error,
          color: "red",
        });
      }
    });
  };

  return (
    <FormShell
      breadcrumbs={["購買", { label: "素材入荷", href: BASE_PATH }, "新規登録"]}
      isPending={isPending}
      onCancel={() => router.push(BASE_PATH)}
      onSubmit={form.onSubmit(handleSubmit)}
      submitLabel="登録"
      title="素材入荷 新規登録"
    >
      <FormSection
        description="直接調達（発注書を経由しない入荷）を登録します。登録と同時に入荷先工場の素材在庫へ入庫されます。発注入荷は素材発注書の「入荷完了」から自動登録されます。"
        title="入荷情報"
      >
        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
          <SearchSelect
            error={form.errors.materialId}
            label="素材"
            onChange={(v) => form.setFieldValue("materialId", v ?? "")}
            onSearch={searchMaterialOptions}
            placeholder="素材を検索"
            storageKey="material"
            value={form.values.materialId || null}
            withAsterisk
          />
          <Select
            clearable
            data={supplierOptions}
            label="仕入先"
            placeholder="仕入先を選択（任意）"
            searchable
            {...form.getInputProps("supplierBpId")}
          />
          <Select
            clearable
            data={factoryOptions}
            label="入荷先工場"
            placeholder="工場を選択（任意）"
            {...form.getInputProps("factoryId")}
          />
          <DatePickerInput
            label="入荷日"
            leftSection={<IconCalendar size={14} />}
            valueFormat="YYYY/MM/DD"
            withAsterisk
            {...form.getInputProps("receivedAt")}
          />
          <NumberInput
            decimalScale={3}
            label="数量"
            min={0}
            withAsterisk
            {...form.getInputProps("quantity")}
          />
          <Select
            data={UNIT_OPTIONS}
            label="単位"
            withAsterisk
            {...form.getInputProps("unit")}
          />
        </SimpleGrid>
        <Textarea
          autosize
          label="備考"
          minRows={2}
          mt="sm"
          placeholder="備考（任意）"
          {...form.getInputProps("notes")}
        />
      </FormSection>

      {/* 証憑（任意） — 登録成功後に順次アップロードして詳細へ */}
      <FormSection
        description="納品書控え・検収書等を添付できます（PDF / PNG / JPG / WEBP / HEIC / XLSX / CSV、各 20MB まで）。入荷登録の完了後にアップロードされます。"
        title="証憑（任意）"
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
                  aria-label={`${file.name} を取り消す`}
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
                  ファイルを選択
                </SecondaryButton>
              )}
            </FileButton>
          </Group>
        </Stack>
      </FormSection>
    </FormShell>
  );
}
