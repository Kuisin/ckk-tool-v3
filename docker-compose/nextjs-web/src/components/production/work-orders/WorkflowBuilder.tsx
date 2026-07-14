"use client";

/**
 * WorkflowBuilder — 指示書 新規作成 / 編集 (PD12 / PD22, design.md §8.3)。
 *
 * 注文請書・種別・予定数量・使用素材・検査表の基本情報と、工程カタログからの
 * STEP PICKER（カテゴリ別チェックリスト）で構成する。選択のたびに
 * validateComposition で構成検証し、ブロッカー（AND 不足・排他）は赤 Alert +
 * 保存不可、OR グループ全不在は黄 Alert（素材条件で充足の可能性）。
 * 「必須工程を自動追加」は requiredCompanions の閉包を一括追加する。
 * 選択済み工程は defaultOrder（カタログ既定順）で要約表示し、社内・外注可の
 * 工程のみ実施場所（社内→工場 / 外注→仕入先）を編集できる。
 */

import {
  Alert,
  Badge,
  Checkbox,
  Group,
  MultiSelect,
  NumberInput,
  Paper,
  SegmentedControl,
  Select,
  SimpleGrid,
  Stack,
  Text,
  Textarea,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { notifications } from "@mantine/notifications";
import {
  IconAlertTriangle,
  IconInfoCircle,
  IconWand,
} from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { z } from "zod";
import {
  searchMaterialOptions,
  searchSalesOrderOptions,
} from "@/app/(dashboard)/_shared/option-search";
import {
  createWorkOrder,
  getSalesOrderInfo,
  updateWorkOrder,
  type WorkOrderInput,
} from "@/app/(dashboard)/production/work-orders/actions";
import type { SalesOrderRef } from "@/app/(dashboard)/production/work-orders/data";
import { SecondaryButton } from "@/components/ui/buttons";
import { SearchSelect } from "@/components/ui/SearchSelect";
import { FormSection, FormShell } from "@/components/ui/shells";
import { useIsMobile } from "@/hooks/useViewport";
import {
  PROCESS_CATEGORY_LABEL,
  WORK_ORDER_TYPE_OPTIONS,
} from "@/lib/enum-labels";
import { zodResolver } from "@/lib/form";
import type { CatalogStep, UseDep } from "@/lib/workflow-core";
import {
  defaultOrder,
  isBlockingIssue,
  requiredCompanions,
  validateComposition,
} from "@/lib/workflow-core";
import { describeIssue, type WorkOrderView } from "./model";

const BASE_PATH = "/production/work-orders";

interface Option {
  value: string;
  label: string;
}

/** 社内・外注可の工程ごとの実施場所設定。 */
interface StepLocation {
  executionLocation: "INTERNAL" | "OUTSOURCE";
  factoryId: string | null;
  supplierBpId: string | null;
}

const schema = z.object({
  salesOrderId: z.string().min(1, "注文請書を選択してください"),
  type: z.enum(["FROM_STOCK", "MANUFACTURE"]),
  plannedQuantity: z.number().int().min(1, "予定数量は1以上"),
  materialId: z.string().nullable(),
  inspectionTemplateIds: z.array(z.string()),
  notes: z.string(),
  selectedStepIds: z.array(z.number()).min(1, "工程を1つ以上選択してください"),
});

type FormValues = z.infer<typeof schema>;

function initialValues(
  workOrder: WorkOrderView | null | undefined,
): FormValues {
  if (!workOrder) {
    return {
      salesOrderId: "",
      type: "MANUFACTURE",
      plannedQuantity: 1,
      materialId: null,
      inspectionTemplateIds: [],
      notes: "",
      selectedStepIds: [],
    };
  }
  return {
    salesOrderId: workOrder.salesOrderId,
    type: workOrder.type as FormValues["type"],
    plannedQuantity: workOrder.plannedQuantity,
    materialId:
      workOrder.materialId != null ? String(workOrder.materialId) : null,
    inspectionTemplateIds: workOrder.inspectionTemplates.map((t) =>
      String(t.id),
    ),
    notes: workOrder.notes ?? "",
    selectedStepIds: workOrder.steps.map((s) => s.processStepId),
  };
}

function initialLocations(
  workOrder: WorkOrderView | null | undefined,
): Record<number, StepLocation> {
  const map: Record<number, StepLocation> = {};
  for (const s of workOrder?.steps ?? []) {
    map[s.processStepId] = {
      executionLocation: s.executionLocation,
      factoryId: s.factoryId != null ? String(s.factoryId) : null,
      supplierBpId: s.supplierBpId,
    };
  }
  return map;
}

export function WorkflowBuilder({
  mode,
  workOrder,
  initialSalesOrder,
  catalogSteps,
  useDeps,
  factoryOptions,
  templateOptions,
  supplierOptions,
}: {
  mode: "create" | "edit";
  /** 編集時の既存指示書（view model）。 */
  workOrder?: WorkOrderView | null;
  /** `?salesOrder=` プリセレクト（create 時）。 */
  initialSalesOrder?: SalesOrderRef | null;
  catalogSteps: CatalogStep[];
  useDeps: UseDep[];
  factoryOptions: Option[];
  templateOptions: Option[];
  /** 外注先（VENDOR ロールの有効 BP）— サーバーで全件ロード。 */
  supplierOptions: Option[];
}) {
  const router = useRouter();
  const isMobile = useIsMobile();
  const [isPending, startTransition] = useTransition();

  const form = useForm<FormValues>({
    validate: zodResolver(schema),
    initialValues: {
      ...initialValues(workOrder),
      ...(mode === "create" && initialSalesOrder
        ? {
            salesOrderId: initialSalesOrder.id,
            plannedQuantity: initialSalesOrder.quantity,
          }
        : {}),
    },
  });

  const [locations, setLocations] = useState<Record<number, StepLocation>>(
    initialLocations(workOrder),
  );
  const [soInfo, setSoInfo] = useState<SalesOrderRef | null>(
    initialSalesOrder ??
      (workOrder
        ? {
            id: workOrder.salesOrderId,
            number: workOrder.salesOrderNumber,
            label: `${workOrder.salesOrderNumber} ${workOrder.productName}（${workOrder.salesOrderQuantity}）`,
            customerName: workOrder.customerName,
            productName: workOrder.productName,
            quantity: workOrder.salesOrderQuantity,
            status: "",
          }
        : null),
  );

  const stepById = useMemo(
    () => new Map(catalogSteps.map((s) => [s.id, s])),
    [catalogSteps],
  );
  const selected = form.values.selectedStepIds;

  // ── ライブ構成検証 ─────────────────────────────────────────────────────────
  const issues = useMemo(
    () => validateComposition(selected, useDeps),
    [selected, useDeps],
  );
  const blockers = issues.filter(isBlockingIssue);
  const warnings = issues.filter((i) => !isBlockingIssue(i));
  const missingCompanions = useMemo(
    () => requiredCompanions(selected, useDeps),
    [selected, useDeps],
  );

  const orderedSelected = useMemo(
    () => defaultOrder(selected, catalogSteps),
    [selected, catalogSteps],
  );

  // ── ハンドラ ───────────────────────────────────────────────────────────────
  const toggleStep = (stepId: number, checked: boolean) => {
    const next = checked
      ? [...selected, stepId]
      : selected.filter((id) => id !== stepId);
    form.setFieldValue("selectedStepIds", next);
  };

  const addCompanions = () => {
    form.setFieldValue("selectedStepIds", [...selected, ...missingCompanions]);
  };

  const onSalesOrderChange = (value: string | null) => {
    form.setFieldValue("salesOrderId", value ?? "");
    if (!value) {
      setSoInfo(null);
      return;
    }
    getSalesOrderInfo(value).then((info) => {
      setSoInfo(info);
      if (info) form.setFieldValue("plannedQuantity", info.quantity);
    });
  };

  const locationOf = (stepId: number): StepLocation =>
    locations[stepId] ?? {
      executionLocation: "INTERNAL",
      factoryId: null,
      supplierBpId: null,
    };

  const setLocation = (stepId: number, patch: Partial<StepLocation>) => {
    setLocations((prev) => ({
      ...prev,
      [stepId]: { ...locationOf(stepId), ...patch },
    }));
  };

  const handleSubmit = (values: FormValues) => {
    if (blockers.length > 0) {
      notifications.show({
        title: "工程構成にエラーがあります",
        message: "赤色の警告を解消してから保存してください",
        color: "red",
      });
      return;
    }
    const payload: WorkOrderInput = {
      salesOrderId: values.salesOrderId,
      type: values.type,
      plannedQuantity: values.plannedQuantity,
      materialId:
        values.type === "MANUFACTURE" && values.materialId
          ? Number(values.materialId)
          : null,
      inspectionTemplateIds: values.inspectionTemplateIds.map(Number),
      notes: values.notes,
      steps: orderedSelected.map((stepId) => {
        const cat = stepById.get(stepId);
        const editable = cat?.executionLocation === "INTERNAL_OR_OUTSOURCE";
        const loc = editable ? locationOf(stepId) : null;
        const execution = loc?.executionLocation ?? "INTERNAL";
        return {
          processStepId: stepId,
          executionLocation: execution,
          factoryId:
            execution === "INTERNAL" && loc?.factoryId
              ? Number(loc.factoryId)
              : null,
          supplierBpId:
            execution === "OUTSOURCE" ? (loc?.supplierBpId ?? null) : null,
        };
      }),
    };
    startTransition(async () => {
      const result =
        mode === "edit" && workOrder
          ? await updateWorkOrder(workOrder.workOrderNumber, payload)
          : await createWorkOrder(payload);
      if (result.ok) {
        notifications.show({
          title: "保存しました",
          message:
            mode === "edit"
              ? `指示書 #${result.data.workOrderNumber} を更新しました`
              : `指示書 #${result.data.workOrderNumber} を作成しました`,
          color: "green",
        });
        router.push(`${BASE_PATH}/${result.data.workOrderNumber}`);
      } else {
        notifications.show({
          title: "エラー",
          message: result.error,
          color: "red",
        });
      }
    });
  };

  // カテゴリ順（enum-labels の定義順）でグループ化
  const categories = Object.keys(PROCESS_CATEGORY_LABEL).filter((cat) =>
    catalogSteps.some((s) => s.category === cat),
  );

  return (
    <FormShell
      breadcrumbs={[
        "生産",
        { label: "指示書", href: BASE_PATH },
        mode === "edit" ? "編集" : "新規作成",
      ]}
      isPending={isPending}
      onCancel={() =>
        router.push(
          workOrder ? `${BASE_PATH}/${workOrder.workOrderNumber}` : BASE_PATH,
        )
      }
      onSubmit={form.onSubmit(handleSubmit)}
      title={
        mode === "edit"
          ? `指示書 #${workOrder?.workOrderNumber} 編集`
          : "指示書 新規作成"
      }
    >
      <FormSection required title="基本情報">
        <SimpleGrid cols={isMobile ? 1 : 2} spacing="sm">
          <Stack gap={4}>
            <SearchSelect
              error={form.errors.salesOrderId}
              initialOption={
                soInfo ? { value: soInfo.id, label: soInfo.label } : null
              }
              label="注文請書"
              onChange={onSalesOrderChange}
              onSearch={searchSalesOrderOptions}
              placeholder="注文請書番号・製品・顧客で検索"
              storageKey="sales-order"
              value={form.values.salesOrderId || null}
              withAsterisk
            />
            {soInfo && (
              <Text c="dimmed" size="xs">
                {soInfo.customerName} / {soInfo.productName} / 受注数量{" "}
                {soInfo.quantity}
              </Text>
            )}
          </Stack>
          <Stack gap={4}>
            <Text fw={500} size="sm">
              種別
            </Text>
            <SegmentedControl
              data={WORK_ORDER_TYPE_OPTIONS}
              onChange={(v) => {
                form.setFieldValue("type", v as FormValues["type"]);
                if (v === "FROM_STOCK") form.setFieldValue("materialId", null);
              }}
              value={form.values.type}
            />
          </Stack>
          <NumberInput
            allowDecimal={false}
            label="予定数量"
            min={1}
            withAsterisk
            {...form.getInputProps("plannedQuantity")}
          />
          {form.values.type === "MANUFACTURE" && (
            <SearchSelect
              initialOption={
                workOrder?.materialId != null && workOrder.materialCode
                  ? {
                      value: String(workOrder.materialId),
                      label: `${workOrder.materialCode}（${workOrder.materialName}）`,
                    }
                  : null
              }
              label="使用素材"
              onChange={(v) => form.setFieldValue("materialId", v)}
              onSearch={searchMaterialOptions}
              placeholder="素材コード・名称で検索"
              storageKey="material"
              value={form.values.materialId}
            />
          )}
          <MultiSelect
            clearable
            data={templateOptions}
            label="検査表"
            placeholder={
              form.values.inspectionTemplateIds.length
                ? undefined
                : "検査表テンプレートを選択"
            }
            searchable
            {...form.getInputProps("inspectionTemplateIds")}
          />
        </SimpleGrid>
      </FormSection>

      <FormSection
        description="工程カタログから使用する工程を選択します。依存（使用条件）は選択のたびに検証されます。"
        required
        title="工程選択"
      >
        {(blockers.length > 0 || warnings.length > 0) && (
          <Stack gap="xs" mb="md">
            {blockers.map((issue, i) => (
              <Alert
                color="red"
                icon={<IconAlertTriangle size={16} />}
                key={`b-${issue.stepId}-${issue.kind}-${i}`}
                p="xs"
                variant="light"
              >
                {describeIssue(issue, catalogSteps)}
              </Alert>
            ))}
            {warnings.map((issue, i) => (
              <Alert
                color="yellow"
                icon={<IconInfoCircle size={16} />}
                key={`w-${issue.stepId}-${issue.kind}-${i}`}
                p="xs"
                variant="light"
              >
                {describeIssue(issue, catalogSteps)}
              </Alert>
            ))}
            {missingCompanions.length > 0 && (
              <Group>
                <SecondaryButton
                  leftSection={<IconWand size={14} />}
                  onClick={addCompanions}
                >
                  必須工程を自動追加（{missingCompanions.length}件）
                </SecondaryButton>
              </Group>
            )}
          </Stack>
        )}
        {typeof form.errors.selectedStepIds === "string" && (
          <Text c="red" mb="xs" size="xs">
            {form.errors.selectedStepIds}
          </Text>
        )}
        <SimpleGrid cols={isMobile ? 1 : 2} spacing="md">
          {categories.map((cat) => (
            <Stack gap="xs" key={cat}>
              <Text c="dimmed" fw={600} size="xs">
                {PROCESS_CATEGORY_LABEL[cat]}
              </Text>
              {catalogSteps
                .filter((s) => s.category === cat)
                .map((s) => (
                  <Checkbox
                    checked={selected.includes(s.id)}
                    key={s.id}
                    label={
                      <Group gap={6} wrap="wrap">
                        <Text size="sm">{s.nameJa}</Text>
                        {s.isInspection && (
                          <Badge color="blue" size="xs" variant="light">
                            検査
                          </Badge>
                        )}
                        {s.isApprovalStep && (
                          <Badge color="teal" size="xs" variant="light">
                            承認
                          </Badge>
                        )}
                        {s.isSyncCapable && (
                          <Badge color="grape" size="xs" variant="light">
                            同期
                          </Badge>
                        )}
                        <Badge
                          color={
                            s.executionLocation === "INTERNAL_OR_OUTSOURCE"
                              ? "orange"
                              : "gray"
                          }
                          size="xs"
                          variant="outline"
                        >
                          {s.executionLocation === "INTERNAL_OR_OUTSOURCE"
                            ? "社内・外注"
                            : "社内"}
                        </Badge>
                      </Group>
                    }
                    onChange={(e) => toggleStep(s.id, e.currentTarget.checked)}
                    size="xs"
                  />
                ))}
            </Stack>
          ))}
        </SimpleGrid>
      </FormSection>

      <FormSection
        description="実行順はカタログ既定順です（実際の実行可否は工程間依存の解決で決まります）。社内・外注可の工程は実施場所を選択できます。"
        title="選択済み工程・実施場所"
      >
        {orderedSelected.length === 0 ? (
          <Text c="dimmed" size="sm">
            工程が未選択です
          </Text>
        ) : (
          <Stack gap="xs">
            {orderedSelected.map((stepId, i) => {
              const cat = stepById.get(stepId);
              if (!cat) return null;
              const editable =
                cat.executionLocation === "INTERNAL_OR_OUTSOURCE";
              const loc = locationOf(stepId);
              return (
                <Paper key={stepId} p="sm" radius="sm" withBorder>
                  <Group
                    align={isMobile ? "flex-start" : "center"}
                    justify="space-between"
                    wrap={isMobile ? "wrap" : "nowrap"}
                  >
                    <Group gap="sm" wrap="nowrap">
                      <Text
                        c="dimmed"
                        className="tabular-nums"
                        size="xs"
                        w={20}
                      >
                        {i + 1}
                      </Text>
                      <Text fw={600} size="sm">
                        {cat.nameJa}
                      </Text>
                      <Text c="dimmed" size="xs">
                        {PROCESS_CATEGORY_LABEL[cat.category] ?? cat.category}
                      </Text>
                    </Group>
                    {editable ? (
                      <Group gap="xs" wrap="nowrap">
                        <SegmentedControl
                          data={[
                            { value: "INTERNAL", label: "社内" },
                            { value: "OUTSOURCE", label: "外注" },
                          ]}
                          onChange={(v) =>
                            setLocation(stepId, {
                              executionLocation: v as "INTERNAL" | "OUTSOURCE",
                            })
                          }
                          size="xs"
                          value={loc.executionLocation}
                        />
                        {loc.executionLocation === "INTERNAL" ? (
                          <Select
                            clearable
                            data={factoryOptions}
                            onChange={(v) =>
                              setLocation(stepId, { factoryId: v })
                            }
                            placeholder="工場"
                            searchable
                            size="xs"
                            value={loc.factoryId}
                            w={200}
                          />
                        ) : (
                          <Select
                            clearable
                            data={supplierOptions}
                            onChange={(v) =>
                              setLocation(stepId, { supplierBpId: v })
                            }
                            placeholder="仕入先（外注先）"
                            searchable
                            size="xs"
                            value={loc.supplierBpId}
                            w={200}
                          />
                        )}
                      </Group>
                    ) : (
                      <Badge color="gray" size="xs" variant="outline">
                        社内
                      </Badge>
                    )}
                  </Group>
                </Paper>
              );
            })}
          </Stack>
        )}
      </FormSection>

      <Textarea
        autosize
        label="備考"
        minRows={2}
        {...form.getInputProps("notes")}
      />
    </FormShell>
  );
}
