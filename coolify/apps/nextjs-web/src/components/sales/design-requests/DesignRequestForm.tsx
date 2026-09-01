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
import { useLocale } from "next-intl";
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
import { PRODUCT_F4 } from "@/components/ui/f4-presets";
import { HelpLabel } from "@/components/ui/HelpLabel";
import { SearchSelect } from "@/components/ui/SearchSelect";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { FormSection, FormShell } from "@/components/ui/shells";
import { useTr } from "@/hooks/useTr";
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

const schema = z
  .object({
    trigger: z.enum(TRIGGERS),
    quoteNumber: z.string().nullable(),
    orderLineId: z.string().nullable(),
    // 依頼区分の自動判定に要るので必須。名称と単位だけで製品は登録できるので、
    // 新規品でも「先に製品を登録する」で運用が回る。
    productId: z.string().min(1, "製品を選択してください"),
    productName: z.string(),
    /** 版が載る系列。null = 汎用（どの顧客の指示書からも使える）。 */
    customerBpId: z.string().nullable(),
    assigneeId: z.string().min(1, "担当者を選択してください"),
    /** null = 自動判定に従う。値が入っていれば手動指定。 */
    kind: z.enum(["NEW", "REVISION"]).nullable(),
    baseDesignFileId: z.string().nullable(),
    changeReason: z.string(),
    desiredAt: z.string().nullable(),
    priority: z.enum(["NORMAL", "HIGH"]),
    description: z.string(),
  })
  .superRefine((v, ctx) => {
    const tr = useTr();
    // 改訂は「なぜ描き直すか」が要る（サーバー側でも同じ条件で弾く）。
    if (v.kind === "REVISION" && !v.changeReason.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["changeReason"],
        message: tr("改訂のときは変更理由を入力してください"),
      });
    }
  });

type FormValues = z.infer<typeof schema>;

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
}) {
  const tr = useTr();
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
    validate: zodResolver(schema),
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
            desiredAt: null,
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
          title: tr("保存しました"),
          message:
            mode === "edit"
              ? tr("設計依頼書を更新しました")
              : `設計依頼書 ${result.data.number} を作成しました`,
          color: "green",
        });
        router.push(`${BASE_PATH}/${result.data.number}`);
      } else {
        notifications.show({
          title: tr("エラー"),
          message: tr(result.error),
          color: "red",
        });
      }
    });
  };

  return (
    <FormShell
      breadcrumbs={[
        tr("販売"),
        { label: tr("設計依頼書"), href: BASE_PATH },
        mode === "edit" ? "編集" : tr("新規作成"),
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
          ? `設計依頼書 編集 ${requestId ?? ""}`
          : tr("設計依頼書 新規作成")
      }
    >
      <FormSection
        description={tr(
          "トリガー（見積時 / 受注時）と参照元は作成後に変更できません。保存時に依頼番号 DSG-YYYYMM-NNNNN が採番されます。",
        )}
        title={tr("基本情報")}
      >
        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
          {mode === "create" && prefilledTrigger ? (
            // 呼び出し元（見積書 / 注文明細）からの起票 — 参照元は固定。
            // 切り替えられるようにすると、誤操作でリンクが黙って外れる。
            <>
              <FieldValue
                label={tr("トリガー")}
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
                label={prefilledTrigger === "QUOTE" ? "見積書" : tr("注文明細")}
                value={prefilled?.label ?? "—"}
              />
            </>
          ) : mode === "create" ? (
            <>
              <Input.Wrapper
                label={<HelpLabel {...fieldHelp("designRequest", "trigger")} />}
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
                    "§1 見積と並行して設計を依頼する場合の見積元（任意）",
                  )}
                  label={<HelpLabel {...fieldHelp("designRequest", "quote")} />}
                  placeholder={tr("直近の見積書から選択")}
                  searchable
                  {...form.getInputProps("quoteNumber")}
                />
              ) : form.values.trigger === "SALES_ORDER" ? (
                <SearchSelect
                  description={tr(
                    "§3 受注と並行して設計を依頼する場合の注文明細（任意）",
                  )}
                  label={
                    <HelpLabel {...fieldHelp("designRequest", "orderLine")} />
                  }
                  onChange={(v) => form.setFieldValue("orderLineId", v)}
                  onSearch={searchOrderLineOptions}
                  placeholder={tr("注文明細を検索")}
                  storageKey="sales-order"
                  value={form.values.orderLineId}
                />
              ) : (
                // 単独 — 紐づける書類が無いので、欄を出さずに何が起きるかだけ書く。
                <FieldValue
                  label={tr("参照元")}
                  value={
                    <Text c="dimmed" size="sm">
                      {tr("なし（見積・受注に紐づけません）")}
                    </Text>
                  }
                />
              )}
            </>
          ) : (
            <>
              {/* トリガー・参照元は作成後変更不可。 */}
              <FieldValue
                label={tr("トリガー")}
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
                    ? tr("参照元")
                    : request?.trigger === "QUOTE"
                      ? tr("見積書")
                      : tr("注文明細")
                }
                value={
                  request && !hasSourceDocument(request.trigger)
                    ? tr("なし")
                    : request?.trigger === "QUOTE"
                      ? (request?.quoteNumber ?? "—")
                      : (request?.orderLineNumber ?? "—")
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
            label={<HelpLabel {...fieldHelp("designRequest", "product")} />}
            onChange={(v, opt) => {
              form.setFieldValue("productId", v ?? "");
              form.setFieldValue("productName", opt?.label ?? "");
              void loadKindContext(v);
            }}
            onSearch={searchProductOptions}
            placeholder={tr("製品を検索")}
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
              "空のままなら「汎用」— どの顧客の指示書からも使えます。版番号は受注元ごとに数えます",
            )}
            label={tr("受注元")}
            onChange={(v) => {
              form.setFieldValue("customerBpId", v);
              void loadKindContext(form.values.productId || null, v);
            }}
            placeholder={tr("汎用（すべての顧客）")}
            searchable
            value={form.values.customerBpId}
          />
          <Select
            data={assigneeOptions}
            description={tr(
              "承認されると、この人に「着手してください」の通知が届きます",
            )}
            label={<HelpLabel {...fieldHelp("designRequest", "assignee")} />}
            placeholder={tr("図面をつくる担当者")}
            searchable
            withAsterisk
            {...form.getInputProps("assigneeId")}
          />
          <DatePickerInput
            clearable
            label={<HelpLabel {...fieldHelp("designRequest", "desiredAt")} />}
            onChange={(v) => form.setFieldValue("desiredAt", v)}
            placeholder={tr("いつまでに図面が要るか")}
            value={form.values.desiredAt}
            valueFormat="YYYY/MM/DD"
          />
          <Select
            data={designPriorityOptions(locale)}
            label={<HelpLabel {...fieldHelp("designRequest", "priority")} />}
            {...form.getInputProps("priority")}
          />
        </SimpleGrid>
      </FormSection>

      {/* 依頼区分 — 製品を選ぶと自動で決まる。根拠を出したうえで上書きも許す。 */}
      <FormSection
        description={tr(
          "製品に過去の設計書があるかで自動判定します。違うときは手で変えられます。",
        )}
        title={tr("依頼区分")}
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
              {form.values.kind ? "手動指定" : tr("自動判定")}
            </Badge>
            <Text c="dimmed" size="xs">
              {kindContext
                ? describeDetection(kindContext.detection)
                : form.values.productId
                  ? tr("判定中…")
                  : tr("製品を選ぶと判定します")}
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
                {tr("自動判定に戻す")}
              </GhostButton>
            )}
          </Group>

          {effectiveKind === "REVISION" && (
            <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
              <Select
                clearable
                data={kindContext?.versions ?? []}
                description={tr("空にすると、判定した時点の最新版を基にします")}
                label={
                  <HelpLabel
                    {...fieldHelp("designRequest", "baseDesignFile")}
                  />
                }
                placeholder={
                  kindContext?.detection.latestFileLabel ?? tr("版を選択")
                }
                {...form.getInputProps("baseDesignFileId")}
              />
              <Textarea
                autosize
                label={
                  <HelpLabel {...fieldHelp("designRequest", "changeReason")} />
                }
                minRows={2}
                placeholder={tr("なぜ描き直すか")}
                withAsterisk
                {...form.getInputProps("changeReason")}
              />
            </SimpleGrid>
          )}
        </Stack>
      </FormSection>

      <FormSection title={tr("依頼内容")}>
        <Textarea
          autosize
          label={<HelpLabel {...fieldHelp("designRequest", "description")} />}
          minRows={4}
          placeholder={tr("設計依頼の内容・要件（任意）")}
          {...form.getInputProps("description")}
        />
      </FormSection>
    </FormShell>
  );
}
