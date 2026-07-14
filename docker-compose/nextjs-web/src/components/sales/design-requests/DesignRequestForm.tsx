"use client";

/**
 * DesignRequestForm — 設計依頼書 新規作成 / 編集 (SA04, design.md §8.3).
 *
 * 新規: トリガー SegmentedControl（見積時 / 受注時）→ トリガーに応じて
 * 見積書 Select（サーバー読込の直近見積）/ 注文請書 SearchSelect を切替、
 * 製品 SearchSelect（任意）+ 依頼内容 Textarea。
 * 保存は createDesignRequest が DSG-YYYYMM-NNNNN を採番し、詳細ページへ遷移。
 *
 * 編集: 製品・依頼内容のみ（未着手・進行中のみ、ガードはサーバー側でも実施）。
 * トリガー・参照元（見積書/注文請書）は作成後変更不可 — FieldValue 表示。
 */

import {
  Badge,
  Input,
  SegmentedControl,
  Select,
  SimpleGrid,
  Textarea,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { notifications } from "@mantine/notifications";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { z } from "zod";
import {
  searchProductOptions,
  searchSalesOrderOptions,
} from "@/app/(dashboard)/_shared/option-search";
import {
  createDesignRequest,
  updateDesignRequest,
} from "@/app/(dashboard)/sales/design-requests/actions";
import type { QuoteOption } from "@/app/(dashboard)/sales/design-requests/data";
import { FieldValue } from "@/components/ui/FieldValue";
import { PRODUCT_F4 } from "@/components/ui/f4-presets";
import { SearchSelect } from "@/components/ui/SearchSelect";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { FormSection, FormShell } from "@/components/ui/shells";
import { DESIGN_TRIGGER_LABEL } from "@/lib/enum-labels";
import { zodResolver } from "@/lib/form";
import { DESIGN_TRIGGER_COLOR, type DesignRequest } from "./model";

const BASE_PATH = "/sales/design-requests";

const TRIGGERS = ["QUOTE", "SALES_ORDER"] as const;
type Trigger = (typeof TRIGGERS)[number];

const schema = z.object({
  trigger: z.enum(TRIGGERS),
  quoteNumber: z.string().nullable(),
  salesOrderId: z.string().nullable(),
  productId: z.string().nullable(),
  productName: z.string(),
  description: z.string(),
});

type FormValues = z.infer<typeof schema>;

function toFormValues(request: DesignRequest): FormValues {
  return {
    trigger: request.trigger,
    quoteNumber: request.quoteNumber,
    salesOrderId: request.salesOrderId,
    productId: request.productId,
    productName: request.productName ?? "",
    description: request.description ?? "",
  };
}

export function DesignRequestForm({
  mode,
  request,
  quoteOptions = [],
}: {
  mode: "create" | "edit";
  /** 編集時: 対象設計依頼書（サーバー取得の view-model）。 */
  request?: DesignRequest | null;
  /** 新規時: 見積書リンク用の直近見積 options（サーバー読込）。 */
  quoteOptions?: QuoteOption[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const requestId = mode === "edit" ? request?.id : undefined;

  const form = useForm<FormValues>({
    validate: zodResolver(schema),
    initialValues:
      mode === "edit" && request
        ? toFormValues(request)
        : {
            trigger: "QUOTE",
            quoteNumber: null,
            salesOrderId: null,
            productId: null,
            productName: "",
            description: "",
          },
  });

  /** トリガー切替 — もう一方の参照元をクリアする（作成後は変更不可）。 */
  const onTriggerChange = (value: string) => {
    form.setFieldValue("trigger", value as Trigger);
    form.setFieldValue("quoteNumber", null);
    form.setFieldValue("salesOrderId", null);
  };

  const handleSubmit = (values: FormValues) => {
    startTransition(async () => {
      const result =
        mode === "edit" && requestId
          ? await updateDesignRequest(requestId, {
              productId: values.productId,
              description: values.description || null,
            })
          : await createDesignRequest({
              trigger: values.trigger,
              quoteNumber: values.quoteNumber,
              salesOrderId: values.salesOrderId,
              productId: values.productId,
              description: values.description || null,
            });
      if (result.ok) {
        notifications.show({
          title: "保存しました",
          message:
            mode === "edit"
              ? "設計依頼書を更新しました"
              : `設計依頼書 ${result.data.number} を作成しました`,
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
        "販売",
        { label: "設計依頼書", href: BASE_PATH },
        mode === "edit" ? "編集" : "新規作成",
      ]}
      isPending={isPending}
      onCancel={() =>
        router.push(requestId ? `${BASE_PATH}/${requestId}` : BASE_PATH)
      }
      onSubmit={form.onSubmit(handleSubmit)}
      status={
        mode === "edit" && request ? (
          <StatusBadge entity="DesignRequest" status={request.status} />
        ) : undefined
      }
      title={
        mode === "edit"
          ? `設計依頼書 編集 ${requestId ?? ""}`
          : "設計依頼書 新規作成"
      }
    >
      <FormSection
        description="トリガー（見積時 / 受注時）と参照元は作成後に変更できません。保存時に依頼番号 DSG-YYYYMM-NNNNN が採番されます。"
        title="基本情報"
      >
        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
          {mode === "create" ? (
            <>
              <Input.Wrapper label="トリガー" withAsterisk>
                <SegmentedControl
                  data={TRIGGERS.map((t) => ({
                    value: t,
                    label: DESIGN_TRIGGER_LABEL[t] ?? t,
                  }))}
                  fullWidth
                  onChange={onTriggerChange}
                  value={form.values.trigger}
                />
              </Input.Wrapper>
              {form.values.trigger === "QUOTE" ? (
                <Select
                  clearable
                  data={quoteOptions}
                  description="§1 見積と並行して設計を依頼する場合の見積元（任意）"
                  label="見積書"
                  placeholder="直近の見積書から選択"
                  searchable
                  {...form.getInputProps("quoteNumber")}
                />
              ) : (
                <SearchSelect
                  description="§3 受注と並行して設計を依頼する場合の注文請書（任意）"
                  label="注文請書"
                  onChange={(v) => form.setFieldValue("salesOrderId", v)}
                  onSearch={searchSalesOrderOptions}
                  placeholder="注文請書を検索"
                  storageKey="sales-order"
                  value={form.values.salesOrderId}
                />
              )}
            </>
          ) : (
            <>
              {/* トリガー・参照元は作成後変更不可。 */}
              <FieldValue
                label="トリガー"
                value={
                  request ? (
                    <Badge
                      color={DESIGN_TRIGGER_COLOR[request.trigger] ?? "gray"}
                      variant="light"
                    >
                      {DESIGN_TRIGGER_LABEL[request.trigger] ?? request.trigger}
                    </Badge>
                  ) : (
                    "—"
                  )
                }
              />
              <FieldValue
                label={request?.trigger === "QUOTE" ? "見積書" : "注文請書"}
                value={
                  request?.trigger === "QUOTE"
                    ? (request?.quoteNumber ?? "—")
                    : (request?.salesOrderNumber ?? "—")
                }
              />
            </>
          )}
          <SearchSelect
            error={form.errors.productId}
            f4={PRODUCT_F4}
            initialOption={
              form.values.productId
                ? {
                    value: form.values.productId,
                    label: form.values.productName,
                  }
                : null
            }
            label="製品"
            onChange={(v, opt) => {
              form.setFieldValue("productId", v);
              form.setFieldValue("productName", opt?.label ?? "");
            }}
            onSearch={searchProductOptions}
            placeholder="製品を検索（任意）"
            storageKey="product"
            value={form.values.productId}
          />
        </SimpleGrid>
      </FormSection>

      <FormSection title="依頼内容">
        <Textarea
          autosize
          label="依頼内容"
          minRows={4}
          placeholder="設計依頼の内容・要件（任意）"
          {...form.getInputProps("description")}
        />
      </FormSection>
    </FormShell>
  );
}
