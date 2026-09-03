"use client";

/**
 * DesignRequestForm — 設計依頼書 新規作成 / 編集 (SA06, design.md §8.3).
 *
 * 新規: トリガー SegmentedControl（見積時 / 受注時）→ トリガーに応じて
 * 見積書 Select（サーバー読込の直近見積）/ 注文明細 SearchSelect を切替、
 * 製品 SearchSelect（**必須** — 依頼区分の自動判定に要る）+ 担当者 Select（必須）
 * + 希望納期 + 優先度 + 依頼内容 Textarea。
 * 製品を選ぶと「その製品に過去の設計書があるか」をサーバーに問い合わせ、
 * **新規 / 改訂 が自動で決まる**（根拠つきで表示し、手で上書きもできる）。
 * 改訂のときだけ 元図面 と 変更理由 が出る（変更理由は必須）。
 * 保存は createDesignRequest が DSG-YYYYMM-NNNNN を採番し、詳細ページへ遷移。
 *
 * 見積書・注文明細から起票したとき（`?quote=` / `?orderLine=`）は initial* で
 * 参照元が入り、**トリガーは固定表示になる** — SegmentedControl を残すと、
 * 誤って切り替えた瞬間に呼び出し元のリンクが黙って外れるため。
 *
 * 編集: 製品・担当者・依頼内容のみ（下書き・差し戻しのみ、ガードはサーバー側
 * でも実施）。トリガー・参照元（見積書/注文明細）は作成後変更不可 — FieldValue 表示。
 */

import {
  Badge,
  Group,
  Input,
  SegmentedControl,
  Select,
  SimpleGrid,
  Stack,
  Text,
  Textarea,
} from "@mantine/core";
import { DatePickerInput } from "@mantine/dates";
import { useForm } from "@mantine/form";
import { notifications } from "@mantine/notifications";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState, useTransition } from "react";
import { z } from "zod";
import {
  searchOrderLineOptions,
  searchProductOptions,
} from "@/app/(dashboard)/_shared/option-search";
import {
  createDesignRequest,
  fetchKindContextAction,
  updateDesignRequest,
} from "@/app/(dashboard)/sales/design-requests/actions";
import type { QuoteOption } from "@/app/(dashboard)/sales/design-requests/data";
import { GhostButton } from "@/components/ui/buttons";
import { FieldValue } from "@/components/ui/FieldValue";
import { productF4 } from "@/components/ui/f4-presets";
import { HelpLabel } from "@/components/ui/HelpLabel";
import { SearchSelect } from "@/components/ui/SearchSelect";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { FormSection, FormShell } from "@/components/ui/shells";
import {
  designKindLabel,
  designKindOptions,
  designPriorityOptions,
  designTriggerLabel,
} from "@/lib/enum-labels";
import { fieldHelp } from "@/lib/field-help";
import { zodResolver } from "@/lib/form";
import {
  DESIGN_KIND_COLOR,
  DESIGN_TRIGGER_COLOR,
  type DesignKindDetection,
  type DesignRequest,
  describeDetection,
  hasSourceDocument,
} from "./model";

const BASE_PATH = "/sales/design-requests";

const TRIGGERS = ["QUOTE", "SALES_ORDER", "STANDALONE"] as const;
type Trigger = (typeof TRIGGERS)[number];

/**
 * バリデーションメッセージが訳を必要とするため、スキーマはコンポーネント内で
 * `tr` を受け取って組み立てる（型だけはモジュールスコープで使えるよう
 * `ReturnType` から導出する）。
 */
function buildSchema(tr: ReturnType<typeof useTranslations>) {
  return z
    .object({
      trigger: z.enum(TRIGGERS),
      quoteNumber: z.string().nullable(),
      orderLineId: z.string().nullable(),
      // 依頼区分の自動判定に要るので必須。名称と単位だけで製品は登録できるので、
      // 新規品でも「先に製品を登録する」で運用が回る。
      productId: z.string().min(1, tr("common.selectAProduct")),
      productName: z.string(),
      /** 版が載る系列。null = 汎用（どの顧客の指示書からも使える）。 */
      customerBpId: z.string().nullable(),
      assigneeId: z
        .string()
        .min(1, tr("sales.designRequestForm.selectAnAssignee")),
      /** null = 自動判定に従う。値が入っていれば手動指定。 */
      kind: z.enum(["NEW", "REVISION"]).nullable(),
      baseDesignFileId: z.string().nullable(),
      changeReason: z.string(),
      desiredAt: z.string().nullable(),
      priority: z.enum(["NORMAL", "HIGH"]),
      description: z.string(),
    })
    .superRefine((v, ctx) => {
      // 改訂は「なぜ描き直すか」が要る（サーバー側でも同じ条件で弾く）。
      if (v.kind === "REVISION" && !v.changeReason.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["changeReason"],
          message: tr("sales.designRequests.enterAReasonForTheChange"),
        });
      }
    });
}

type FormValues = z.infer<ReturnType<typeof buildSchema>>;

function toFormValues(request: DesignRequest): FormValues {
  return {
    trigger: request.trigger,
    quoteNumber: request.quoteNumber,
    orderLineId: request.orderLineId,
    productId: request.productId ?? "",
    productName: request.productName ?? "",
    customerBpId: request.customerBpId ?? null,
    assigneeId: request.assigneeId ?? "",
    // 保存済みの区分は「手動指定として復元」する — 自動判定に戻したいときは
    // 画面の「自動判定に戻す」で明示的に外す。
    kind: request.kindOverridden ? request.kind : null,
    baseDesignFileId: request.baseDesignFileId,
    changeReason: request.changeReason ?? "",
    desiredAt: request.desiredAt,
    priority: request.priority,
    description: request.description ?? "",
  };
}

export function DesignRequestForm({
  mode,
  request,
  quoteOptions = [],
  assigneeOptions = [],
  initialQuote = null,
  initialOrderLine = null,
  initialProduct = null,
  customerOptions = [],
  initialCustomerBpId = null,
  initialDesiredAt = null,
}: {
  mode: "create" | "edit";
  /** 編集時: 対象設計依頼書（サーバー取得の view-model）。 */
  request?: DesignRequest | null;
  /** 新規時: 見積書リンク用の直近見積 options（サーバー読込）。 */
  quoteOptions?: QuoteOption[];
  /** 担当者候補（有効な従業員）。 */
  assigneeOptions?: QuoteOption[];
  /** `?quote=` 起票時の見積書（サーバーで実在確認済み）。 */
  initialQuote?: QuoteOption | null;
  /** `?orderLine=` 起票時の注文明細（value = uuid）。 */
  initialOrderLine?: QuoteOption | null;
  /** `?product=` 起票時の製品。 */
  initialProduct?: QuoteOption | null;
  /** 版を載せられる受注元。 */
  customerOptions?: QuoteOption[];
  /** 起票元から引き継いだ受注元（見積・注文明細の顧客）。 */
  initialCustomerBpId?: string | null;
  /** `?orderLine=` 起票時の希望納期の既定（その明細の納期）。 */
  initialDesiredAt?: string | null;
}) {
  const tr = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const requestId = mode === "edit" ? request?.id : undefined;

  // 呼び出し元がリンクしてきた参照元。トリガーはこれに従って固定する。
  const prefilled = initialOrderLine ?? initialQuote;
  const prefilledTrigger: Trigger | null = initialOrderLine
    ? "SALES_ORDER"
    : initialQuote
      ? "QUOTE"
      : null;

  /**
   * 製品ごとの判定結果と版一覧。製品を選ぶたびにサーバーへ引きに行く
   * （判定規則をクライアントに持たせない — 保存時の判定はサーバーが決める）。
   */
  const [kindContext, setKindContext] = useState<{
    detection: DesignKindDetection;
    versions: QuoteOption[];
  } | null>(null);

  const form = useForm<FormValues>({
    validate: zodResolver(buildSchema(tr)),
    initialValues:
      mode === "edit" && request
        ? toFormValues(request)
        : {
            trigger: prefilledTrigger ?? "QUOTE",
            quoteNumber: initialQuote?.value ?? null,
            orderLineId: initialOrderLine?.value ?? null,
            productId: initialProduct?.value ?? "",
            productName: initialProduct?.label ?? "",
            // 見積・受注から起票したときはその顧客が既定になる。
            customerBpId: initialCustomerBpId ?? null,
            assigneeId: "",
            kind: null,
            baseDesignFileId: null,
            changeReason: "",
            desiredAt: initialDesiredAt,
            priority: "NORMAL",
            description: "",
          },
  });

  const loadKindContext = async (
    productId: string | null,
    customerBpId: string | null = form.values.customerBpId,
  ) => {
    if (!productId) {
      setKindContext(null);
      return;
    }
    const ctx = await fetchKindContextAction(productId, customerBpId);
    setKindContext(ctx);
    // 手動指定していなければ、元図面の既定は判定時点の最新版のまま（null）。
    if (ctx && !form.values.kind) form.setFieldValue("baseDesignFileId", null);
  };

  // 初期表示（編集 / プリフィル）でも根拠と版一覧を出す。
  // biome-ignore lint/correctness/useExhaustiveDependencies: 製品 id が変わったときだけ引き直す
  useEffect(() => {
    void loadKindContext(form.values.productId || null);
  }, [form.values.productId]);

  /** 自動判定 + 手動上書きを合わせた、いま画面に出ている区分。 */
  const effectiveKind =
    form.values.kind ?? kindContext?.detection.kind ?? "NEW";

  /** トリガー切替 — もう一方の参照元をクリアする（作成後は変更不可）。 */
  const onTriggerChange = (value: string) => {
    form.setFieldValue("trigger", value as Trigger);
    form.setFieldValue("quoteNumber", null);
    form.setFieldValue("orderLineId", null);
  };

  const handleSubmit = (values: FormValues) => {
    const payload = {
      productId: values.productId,
      customerBpId: values.customerBpId,
      assigneeId: values.assigneeId,
      kind: values.kind,
      baseDesignFileId: values.baseDesignFileId,
      changeReason: values.changeReason || null,
      desiredAt: values.desiredAt,
      priority: values.priority,
      description: values.description || null,
    };
    startTransition(async () => {
      const result =
        mode === "edit" && requestId
          ? await updateDesignRequest(requestId, payload)
          : await createDesignRequest({
              trigger: values.trigger,
              quoteNumber: values.quoteNumber,
              orderLineId: values.orderLineId,
              ...payload,
            });
      if (result.ok) {
        notifications.show({
          title: tr("common.saved2"),
          message:
            mode === "edit"
              ? tr("sales.designRequests.theDesignRequestWasUpdated")
              : tr("sales.designRequestForm.createdMessage", {
                  number: result.data.number,
                }),
          color: "green",
        });
        router.push(`${BASE_PATH}/${result.data.number}`);
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
        tr("common.sales"),
        { label: tr("common.designRequest2"), href: BASE_PATH },
        mode === "edit" ? tr("common.edit") : tr("common.new2"),
      ]}
      isDirty={form.isDirty()}
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
          ? tr("sales.designRequestForm.editTitle", {
              requestId: requestId ?? "",
            })
          : tr("sales.designRequests.newDesignRequest")
      }
    >
      <FormSection
        description={tr("sales.designRequests.theTriggerAtQuoteOrAt")}
        title={tr("common.basicInformation")}
      >
        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
          {mode === "create" && prefilledTrigger ? (
            // 呼び出し元（見積書 / 注文明細）からの起票 — 参照元は固定。
            // 切り替えられるようにすると、誤操作でリンクが黙って外れる。
            <>
              <FieldValue
                label={tr("common.trigger")}
                value={
                  <Badge
                    color={DESIGN_TRIGGER_COLOR[prefilledTrigger] ?? "gray"}
                    variant="light"
                  >
                    {designTriggerLabel(prefilledTrigger, locale) ??
                      prefilledTrigger}
                  </Badge>
                }
              />
              <FieldValue
                label={
                  prefilledTrigger === "QUOTE"
                    ? tr("common.quote")
                    : tr("common.orderLine")
                }
                value={prefilled?.label ?? "—"}
              />
            </>
          ) : mode === "create" ? (
            <>
              <Input.Wrapper
                label={
                  <HelpLabel {...fieldHelp(tr, "designRequest", "trigger")} />
                }
                withAsterisk
              >
                <SegmentedControl
                  data={TRIGGERS.map((t) => ({
                    value: t,
                    label: designTriggerLabel(t, locale) ?? t,
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
                  description={tr(
                    "sales.designRequests.n1TheSourceQuoteWhenDesign",
                  )}
                  label={
                    <HelpLabel {...fieldHelp(tr, "designRequest", "quote")} />
                  }
                  placeholder={tr(
                    "sales.designRequests.chooseFromRecentQuotes",
                  )}
                  searchable
                  {...form.getInputProps("quoteNumber")}
                />
              ) : form.values.trigger === "SALES_ORDER" ? (
                <SearchSelect
                  description={tr(
                    "sales.designRequests.n3TheOrderLineWhenDesign",
                  )}
                  label={
                    <HelpLabel
                      {...fieldHelp(tr, "designRequest", "orderLine")}
                    />
                  }
                  onChange={(v) => form.setFieldValue("orderLineId", v)}
                  onSearch={searchOrderLineOptions}
                  placeholder={tr("sales.designRequests.searchOrderLines")}
                  storageKey="sales-order"
                  value={form.values.orderLineId}
                />
              ) : (
                // 単独 — 紐づける書類が無いので、欄を出さずに何が起きるかだけ書く。
                <FieldValue
                  label={tr("common.source")}
                  value={
                    <Text c="dimmed" size="sm">
                      {tr("sales.designRequests.noneNotTiedToAQuote")}
                    </Text>
                  }
                />
              )}
            </>
          ) : (
            <>
              {/* トリガー・参照元は作成後変更不可。 */}
              <FieldValue
                label={tr("common.trigger")}
                value={
                  request ? (
                    <Badge
                      color={DESIGN_TRIGGER_COLOR[request.trigger] ?? "gray"}
                      variant="light"
                    >
                      {designTriggerLabel(request.trigger, locale) ??
                        request.trigger}
                    </Badge>
                  ) : (
                    "—"
                  )
                }
              />
              <FieldValue
                label={
                  request && !hasSourceDocument(request.trigger)
                    ? tr("common.source")
                    : request?.trigger === "QUOTE"
                      ? tr("common.quote")
                      : tr("common.orderLine")
                }
                value={
                  request && !hasSourceDocument(request.trigger)
                    ? tr("common.none2")
                    : request?.trigger === "QUOTE"
                      ? (request?.quoteNumber ?? "—")
                      : (request?.orderLineNumber ?? "—")
                }
              />
            </>
          )}
          <SearchSelect
            error={form.errors.productId}
            f4={productF4(tr)}
            initialOption={
              form.values.productId
                ? {
                    value: form.values.productId,
                    label: form.values.productName,
                  }
                : null
            }
            label={<HelpLabel {...fieldHelp(tr, "designRequest", "product")} />}
            onChange={(v, opt) => {
              form.setFieldValue("productId", v ?? "");
              form.setFieldValue("productName", opt?.label ?? "");
              void loadKindContext(v);
            }}
            onSearch={searchProductOptions}
            placeholder={tr("common.searchProducts")}
            storageKey="product"
            value={form.values.productId || null}
            withAsterisk
          />
          {/* 受注元 — 完成した版がどの系列に載るか。図面は (製品 × 受注元)
              ごとに別々に育つので、ここが変わると区分（新規 / 改訂）の
              判定結果も変わる。 */}
          <Select
            clearable
            data={customerOptions}
            description={tr(
              "sales.designRequests.leaveItBlankForGenericUsable",
            )}
            label={tr("common.orderingCustomer")}
            onChange={(v) => {
              form.setFieldValue("customerBpId", v);
              void loadKindContext(form.values.productId || null, v);
            }}
            placeholder={tr("common.genericAllCustomers2")}
            searchable
            value={form.values.customerBpId}
          />
          <Select
            data={assigneeOptions}
            description={tr(
              "sales.designRequests.onceApprovedThisPersonIsNotified",
            )}
            label={
              <HelpLabel {...fieldHelp(tr, "designRequest", "assignee")} />
            }
            placeholder={tr("common.whoDrawsTheDrawing")}
            searchable
            withAsterisk
            {...form.getInputProps("assigneeId")}
          />
          <DatePickerInput
            clearable
            label={
              <HelpLabel {...fieldHelp(tr, "designRequest", "desiredAt")} />
            }
            onChange={(v) => form.setFieldValue("desiredAt", v)}
            placeholder={tr("sales.designRequests.whenTheDrawingIsNeededBy")}
            value={form.values.desiredAt}
            valueFormat="YYYY/MM/DD"
          />
          <Select
            data={designPriorityOptions(locale)}
            label={
              <HelpLabel {...fieldHelp(tr, "designRequest", "priority")} />
            }
            {...form.getInputProps("priority")}
          />
        </SimpleGrid>
      </FormSection>

      {/* 依頼区分 — 製品を選ぶと自動で決まる。根拠を出したうえで上書きも許す。 */}
      <FormSection
        description={tr(
          "sales.designRequests.determinedAutomaticallyByWhetherTheProduct",
        )}
        title={tr("common.requestKind")}
      >
        <Stack gap="sm">
          <Group gap="sm" wrap="wrap">
            <Badge
              color={DESIGN_KIND_COLOR[effectiveKind] ?? "gray"}
              size="lg"
              variant="light"
            >
              {designKindLabel(effectiveKind, locale) ?? effectiveKind}
            </Badge>
            <Badge color="gray" size="sm" variant="outline">
              {form.values.kind
                ? tr("sales.designRequests.setManually")
                : tr("sales.designRequests.determinedAutomatically")}
            </Badge>
            <Text c="dimmed" size="xs">
              {kindContext
                ? describeDetection(kindContext.detection, tr)
                : form.values.productId
                  ? tr("sales.designRequests.checking")
                  : tr("sales.designRequests.itIsDeterminedOnceYouChoose")}
            </Text>
          </Group>
          <Group gap="xs">
            <SegmentedControl
              data={designKindOptions(locale)}
              onChange={(v) =>
                form.setFieldValue("kind", v as "NEW" | "REVISION")
              }
              size="xs"
              value={effectiveKind}
            />
            {form.values.kind && (
              <GhostButton onClick={() => form.setFieldValue("kind", null)}>
                {tr("sales.designRequests.backToAutomatic")}
              </GhostButton>
            )}
          </Group>

          {effectiveKind === "REVISION" && (
            <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
              <Select
                clearable
                data={kindContext?.versions ?? []}
                description={tr(
                  "sales.designRequests.ifLeftEmptyTheLatestVersion",
                )}
                label={
                  <HelpLabel
                    {...fieldHelp(tr, "designRequest", "baseDesignFile")}
                  />
                }
                placeholder={
                  kindContext?.detection.latestFileLabel ??
                  tr("sales.designRequests.selectAVersion")
                }
                {...form.getInputProps("baseDesignFileId")}
              />
              <Textarea
                autosize
                label={
                  <HelpLabel
                    {...fieldHelp(tr, "designRequest", "changeReason")}
                  />
                }
                minRows={2}
                placeholder={tr("sales.designRequests.whyItIsBeingRedrawn")}
                withAsterisk
                {...form.getInputProps("changeReason")}
              />
            </SimpleGrid>
          )}
        </Stack>
      </FormSection>

      <FormSection title={tr("common.requestDetails")}>
        <Textarea
          autosize
          label={
            <HelpLabel {...fieldHelp(tr, "designRequest", "description")} />
          }
          minRows={4}
          placeholder={tr(
            "sales.designRequests.designRequestDetailsAndRequirementsOptional",
          )}
          {...form.getInputProps("description")}
        />
      </FormSection>
    </FormShell>
  );
}
