"use client";

/**
 * DeliveryNoteForm — 納品書 新規作成 / 編集 (SH02, design.md §8.3).
 *
 * 新規: 出荷書 Select（確定済み・出荷済みのみ、サーバーロードの候補一覧。
 * `?shippingOrder=SHP-…` でプリセレクト可）を選択すると、納品先（= 注文請書の
 * 顧客 + 支店）・最終需要家・明細（出荷書明細 + 受注単価）が既定生成される。
 * 納品方法: 通常納品（価格記載 既定 ON）/ ユーザー直送（最終需要家 必須・
 * 価格記載 既定 OFF）。価格記載 OFF のときは単価・金額を保存しない。
 *
 * 編集: 下書きのみ（ガードはサーバー側でも実施）。出荷書・納品先は変更不可。
 */

import {
  ActionIcon,
  Box,
  Divider,
  Group,
  Input,
  NumberInput,
  SegmentedControl,
  Select,
  SimpleGrid,
  Switch,
  Text,
  Textarea,
  TextInput,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { notifications } from "@mantine/notifications";
import { IconPlus, IconTrash } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { z } from "zod";
import { searchProductOptions } from "@/app/(dashboard)/_shared/option-search";
import {
  createDeliveryNote,
  searchEndUserOptions,
  updateDeliveryNote,
} from "@/app/(dashboard)/shipping/delivery-notes/actions";
import { GhostButton } from "@/components/ui/buttons";
import { FieldValue } from "@/components/ui/FieldValue";
import { PRODUCT_F4 } from "@/components/ui/f4-presets";
import { SearchSelect } from "@/components/ui/SearchSelect";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { FormSection, FormShell } from "@/components/ui/shells";
import { DELIVERY_METHOD_LABEL } from "@/lib/enum-labels";
import { zodResolver } from "@/lib/form";
import { formatMoney } from "@/lib/format";
import type {
  DeliveryMethod,
  DeliveryNote,
  ShippingOrderCandidate,
} from "./model";

const BASE_PATH = "/shipping/delivery-notes";

const DELIVERY_METHODS = ["NORMAL", "DIRECT_TO_USER"] as const;

const itemSchema = z.object({
  rowId: z.string(),
  productId: z.string().min(1, "製品を選択してください"),
  productName: z.string(),
  quantity: z.number().int().min(1, "1以上"),
  unitPrice: z.number().min(0, "0以上"),
  notes: z.string(),
});

const schema = z
  .object({
    shippingOrderNumber: z.string().min(1, "出荷書を選択してください"),
    deliveryMethod: z.enum(DELIVERY_METHODS),
    endUserBpId: z.string().nullable(),
    includePrice: z.boolean(),
    notes: z.string(),
    items: z.array(itemSchema).min(1, "明細を1件以上追加してください"),
  })
  .superRefine((v, ctx) => {
    // ユーザー直送は届け先（最終需要家）が必須。
    if (v.deliveryMethod === "DIRECT_TO_USER" && !v.endUserBpId) {
      ctx.addIssue({
        code: "custom",
        path: ["endUserBpId"],
        message: "最終需要家を選択してください",
      });
    }
  });

type FormValues = z.infer<typeof schema>;
type ItemForm = FormValues["items"][number];

let rowSeq = 0;
const newRowId = () => `row-${++rowSeq}-${Date.now()}`;

const emptyItem = (
  productId = "",
  productName = "",
  quantity = 1,
  unitPrice = 0,
): ItemForm => ({
  rowId: newRowId(),
  productId,
  productName,
  quantity,
  unitPrice,
  notes: "",
});

/** 出荷書候補 → 明細の既定行（単価は注文請書の単価）。 */
function candidateItems(cand: ShippingOrderCandidate): ItemForm[] {
  if (cand.items.length === 0) return [emptyItem()];
  return cand.items.map((it) =>
    emptyItem(it.productId, it.productName, it.quantity, it.unitPrice),
  );
}

function fromCandidate(cand: ShippingOrderCandidate): FormValues {
  return {
    shippingOrderNumber: cand.number,
    deliveryMethod: "NORMAL",
    endUserBpId: cand.endUserBpId,
    includePrice: true,
    notes: "",
    items: candidateItems(cand),
  };
}

function toFormValues(note: DeliveryNote): FormValues {
  return {
    shippingOrderNumber: note.shippingOrderNumber,
    deliveryMethod: note.deliveryMethod,
    endUserBpId: note.endUserId,
    includePrice: note.includePrice,
    notes: note.notes ?? "",
    items: note.items.map((it) => ({
      rowId: newRowId(),
      productId: it.productId,
      productName: it.productName,
      quantity: it.quantity,
      unitPrice: it.unitPrice ?? 0,
      notes: it.notes ?? "",
    })),
  };
}

export function DeliveryNoteForm({
  mode,
  note,
  candidates,
  initialShippingOrder,
}: {
  mode: "create" | "edit";
  /** 編集時: 対象納品書（サーバー取得の view-model）。 */
  note?: DeliveryNote | null;
  /** 新規時: 出荷書候補（確定済み・出荷済み、サーバーロード）。 */
  candidates: ShippingOrderCandidate[];
  /** `?shippingOrder=SHP-…` のプリセレクト（候補に無ければ無視）。 */
  initialShippingOrder?: string | null;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const noteId = mode === "edit" ? note?.id : undefined;

  const preselected =
    mode === "create" && initialShippingOrder
      ? (candidates.find((c) => c.number === initialShippingOrder) ?? null)
      : null;

  const form = useForm<FormValues>({
    validate: zodResolver(schema),
    initialValues:
      mode === "edit" && note
        ? toFormValues(note)
        : preselected
          ? fromCandidate(preselected)
          : {
              shippingOrderNumber: "",
              deliveryMethod: "NORMAL",
              endUserBpId: null,
              includePrice: true,
              notes: "",
              items: [emptyItem()],
            },
  });

  const selectedCandidate =
    mode === "create"
      ? (candidates.find((c) => c.number === form.values.shippingOrderNumber) ??
        null)
      : null;

  // 納品先表示（作成後変更不可）: 新規 = 選択候補由来 / 編集 = 保存値。
  const recipientLabel =
    mode === "edit" && note
      ? note.recipientBranchName
        ? `${note.recipientName} / ${note.recipientBranchName}`
        : note.recipientName
      : selectedCandidate
        ? selectedCandidate.customerBranchName
          ? `${selectedCandidate.customerName} / ${selectedCandidate.customerBranchName}`
          : selectedCandidate.customerName
        : "—";

  // 最終需要家の初期ラベル（SearchSelect の initialOption 用）。
  const endUserInitialOption = (() => {
    const id = form.values.endUserBpId;
    if (!id) return null;
    if (mode === "edit" && note?.endUserId === id && note.endUserName) {
      return { value: id, label: note.endUserName };
    }
    const cand = selectedCandidate ?? preselected;
    if (cand?.endUserBpId === id && cand.endUserName) {
      return { value: id, label: cand.endUserName };
    }
    return null;
  })();

  /** 出荷書選択 → 納品先・最終需要家・明細を候補の既定値で再生成する。 */
  const onShippingOrderChange = (number: string | null) => {
    if (!number) {
      form.setFieldValue("shippingOrderNumber", "");
      return;
    }
    const cand = candidates.find((c) => c.number === number);
    if (!cand) {
      form.setFieldValue("shippingOrderNumber", number);
      return;
    }
    form.setValues((prev) => ({
      ...prev,
      shippingOrderNumber: cand.number,
      endUserBpId: cand.endUserBpId,
      items: candidateItems(cand),
    }));
  };

  /** 納品方法変更 → 価格記載の既定を切替（通常=ON / 直送=OFF）。 */
  const onMethodChange = (method: DeliveryMethod) => {
    form.setValues((prev) => ({
      ...prev,
      deliveryMethod: method,
      includePrice: method === "NORMAL",
    }));
  };

  const totalQuantity = form.values.items.reduce(
    (sum, it) => sum + it.quantity,
    0,
  );
  const totalAmount = form.values.items.reduce(
    (sum, it) => sum + it.unitPrice * it.quantity,
    0,
  );

  const handleSubmit = (values: FormValues) => {
    startTransition(async () => {
      const payload = {
        deliveryMethod: values.deliveryMethod,
        endUserBpId:
          values.deliveryMethod === "DIRECT_TO_USER"
            ? values.endUserBpId
            : null,
        includePrice: values.includePrice,
        notes: values.notes || null,
        items: values.items.map((it) => ({
          productId: it.productId,
          quantity: it.quantity,
          // 価格記載なしのときは単価を送らない（サーバー側でも null 化）。
          unitPrice: values.includePrice ? it.unitPrice : null,
          notes: it.notes || null,
        })),
      };
      const result =
        mode === "edit" && noteId
          ? await updateDeliveryNote(noteId, payload)
          : await createDeliveryNote({
              ...payload,
              shippingOrderNumber: values.shippingOrderNumber,
            });
      if (result.ok) {
        notifications.show({
          title: "保存しました",
          message:
            mode === "edit"
              ? "納品書を更新しました"
              : `納品書 ${result.data.number} を作成しました`,
          color: "green",
        });
        router.push(`${BASE_PATH}/${result.data.number}`);
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
      breadcrumbs={[
        "出荷",
        { label: "納品書", href: BASE_PATH },
        mode === "edit" ? "編集" : "新規作成",
      ]}
      isDirty={form.isDirty()}
      isPending={isPending}
      onCancel={() =>
        router.push(noteId ? `${BASE_PATH}/${noteId}` : BASE_PATH)
      }
      onSubmit={form.onSubmit(handleSubmit)}
      status={
        mode === "edit" && note ? (
          <StatusBadge entity="DeliveryNote" status={note.status} />
        ) : undefined
      }
      title={
        mode === "edit" ? `納品書 編集 ${noteId ?? ""}` : "納品書 新規作成"
      }
    >
      <FormSection title="基本情報">
        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
          {mode === "create" ? (
            <Select
              data={candidates.map((c) => ({
                value: c.number,
                label: c.label,
              }))}
              error={form.errors.shippingOrderNumber}
              label="出荷書"
              onChange={onShippingOrderChange}
              placeholder="確定済み・出荷済みの出荷書を選択"
              searchable={candidates.length > 5}
              value={form.values.shippingOrderNumber || null}
              withAsterisk
            />
          ) : (
            <FieldValue label="出荷書" value={note?.shippingOrderNumber} />
          )}
          <Input.Wrapper label="納品方法" withAsterisk>
            <SegmentedControl
              data={DELIVERY_METHODS.map((m) => ({
                value: m,
                label: DELIVERY_METHOD_LABEL[m] ?? m,
              }))}
              fullWidth
              onChange={(v) => onMethodChange(v as DeliveryMethod)}
              value={form.values.deliveryMethod}
            />
          </Input.Wrapper>
          {/* 納品先 = 注文請書の顧客（+支店）。作成後変更不可。 */}
          <FieldValue label="納品先" value={recipientLabel} />
          {form.values.deliveryMethod === "DIRECT_TO_USER" && (
            <SearchSelect
              description="ユーザー直送の届け先（配送完了書に価格なし・納品書別送）"
              error={form.errors.endUserBpId}
              initialOption={endUserInitialOption}
              label="最終需要家"
              onChange={(v) => form.setFieldValue("endUserBpId", v)}
              onSearch={searchEndUserOptions}
              placeholder="最終需要家を検索"
              storageKey="end-user"
              value={form.values.endUserBpId}
              withAsterisk
            />
          )}
          <Switch
            checked={form.values.includePrice}
            label="価格記載（納品書に単価・金額を記載する）"
            mt="xs"
            onChange={(e) =>
              form.setFieldValue("includePrice", e.currentTarget.checked)
            }
          />
          <Textarea
            autosize
            label="備考"
            minRows={1}
            placeholder="備考（任意）"
            {...form.getInputProps("notes")}
          />
        </SimpleGrid>
      </FormSection>

      <FormSection
        description="出荷書を選択すると明細が既定生成されます（単価は注文請書の単価）。価格記載 OFF のときは単価・金額を保存しません。"
        title="明細"
      >
        <Group justify="flex-end" mb="xs">
          {typeof form.errors.items === "string" && (
            <Text c="red" size="xs">
              {form.errors.items}
            </Text>
          )}
        </Group>
        {form.values.items.map((item, ri) => (
          <Box key={item.rowId}>
            {ri > 0 && <Divider my="md" />}
            <Group align="flex-end" gap="sm" wrap="nowrap">
              <Box flex={1}>
                <Group
                  align="flex-end"
                  gap="sm"
                  grow
                  preventGrowOverflow={false}
                >
                  <SearchSelect
                    error={form.errors[`items.${ri}.productId`]}
                    f4={PRODUCT_F4}
                    initialOption={
                      item.productId
                        ? { value: item.productId, label: item.productName }
                        : null
                    }
                    label="製品"
                    onChange={(v, opt) =>
                      form.setFieldValue(`items.${ri}`, {
                        ...item,
                        productId: v ?? "",
                        productName: opt?.label ?? "",
                      })
                    }
                    onSearch={searchProductOptions}
                    placeholder="製品を検索"
                    storageKey="product"
                    value={item.productId || null}
                    withAsterisk
                  />
                  <NumberInput
                    error={form.errors[`items.${ri}.quantity`]}
                    label="数量"
                    maw={110}
                    min={1}
                    onChange={(v) =>
                      form.setFieldValue(
                        `items.${ri}.quantity`,
                        typeof v === "number" ? v : 0,
                      )
                    }
                    value={item.quantity}
                    withAsterisk
                  />
                  <NumberInput
                    decimalScale={2}
                    disabled={!form.values.includePrice}
                    error={form.errors[`items.${ri}.unitPrice`]}
                    label="単価"
                    maw={160}
                    min={0}
                    onChange={(v) =>
                      form.setFieldValue(
                        `items.${ri}.unitPrice`,
                        typeof v === "number" ? v : 0,
                      )
                    }
                    prefix="¥"
                    thousandSeparator=","
                    value={item.unitPrice}
                  />
                  <TextInput
                    label="備考"
                    placeholder="行の備考（任意）"
                    {...form.getInputProps(`items.${ri}.notes`)}
                  />
                </Group>
              </Box>
              <Text
                className="tabular-nums"
                ff="mono"
                fw={600}
                mb={8}
                size="sm"
                w={110}
              >
                {form.values.includePrice
                  ? formatMoney(item.unitPrice * item.quantity)
                  : "—"}
              </Text>
              <ActionIcon
                aria-label="明細を削除"
                color="red"
                disabled={form.values.items.length <= 1}
                mb={4}
                onClick={() => form.removeListItem("items", ri)}
                variant="subtle"
              >
                <IconTrash size={16} />
              </ActionIcon>
            </Group>
          </Box>
        ))}

        <GhostButton
          leftSection={<IconPlus size={16} />}
          mt="md"
          onClick={() => {
            const first = (selectedCandidate ?? preselected)?.items[0];
            form.insertListItem(
              "items",
              emptyItem(
                first?.productId ?? "",
                first?.productName ?? "",
                1,
                first?.unitPrice ?? 0,
              ),
            );
          }}
          size="xs"
        >
          明細を追加
        </GhostButton>

        <Divider my="md" />
        <Group gap="xl" justify="flex-end">
          <Text fw={700}>数量合計 {totalQuantity}</Text>
          {form.values.includePrice && (
            <Text fw={700}>合計金額 {formatMoney(totalAmount)}</Text>
          )}
        </Group>
      </FormSection>
    </FormShell>
  );
}
