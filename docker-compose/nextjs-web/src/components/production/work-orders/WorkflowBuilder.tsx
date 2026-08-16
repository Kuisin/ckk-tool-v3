"use client";

/**
 * WorkflowBuilder — 指示書 新規作成 / 編集 (PD12 / PD22, design.md §8.3)。
 *
 * 注文請書・種別・予定数量・使用素材・検査表の基本情報と、工程構成エディタ
 * （ProcessListEditor — 工程選択 + 実施場所、必須随伴工程の自動追加）で構成する。
 *
 * 工程ルート（製品の工程リスト）: 注文請書を選ぶと対象製品のルートを読み込み、
 * ルート + バージョン（既定 = 最新）を選ぶと工程構成をプリフィルする。構成を
 * 変更すると保存時に新バージョンとして自動保存される（変更検知は
 * routeStepsEqual — server 側と同一基準）。ルートを使わない場合、ルート名を
 * 入力すればその構成を新ルート v1 として保存できる。
 *
 * 在庫フロア（§4 在庫考慮）: 製造分は「受注数量 − 引当済在庫 − 他の製造指示」
 * を予定数量の下限として表示・検証する（不良予備分の上乗せは自由）。
 */

import {
  Alert,
  MultiSelect,
  NumberInput,
  SegmentedControl,
  Select,
  SimpleGrid,
  Stack,
  Text,
  Textarea,
  TextInput,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { notifications } from "@mantine/notifications";
import { IconAlertTriangle, IconInfoCircle } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { z } from "zod";
import {
  searchMaterialOptions,
  searchProductOptions,
  searchSalesOrderOptions,
} from "@/app/(dashboard)/_shared/option-search";
import {
  createWorkOrder,
  getMaterialAtp,
  getProductRoutesForProduct,
  getProductRoutesForSalesOrder,
  getRouteVersionSteps,
  getSalesOrderInfo,
  getStockFloorInfo,
  updateWorkOrder,
  type WorkOrderInput,
} from "@/app/(dashboard)/production/work-orders/actions";
import type {
  InspectionTemplateOption,
  SalesOrderRef,
} from "@/app/(dashboard)/production/work-orders/data";
import {
  ProcessListEditor,
  type StepLocation,
  toStepSnapshots,
} from "@/components/production/ProcessListEditor";
import { SearchSelect } from "@/components/ui/SearchSelect";
import { FormSection, FormShell } from "@/components/ui/shells";
import { useIsMobile } from "@/hooks/useViewport";
// type-only import — lib/atp は server-only（型はバンドルされない）。
import type { MaterialAtp } from "@/lib/atp";
import { WORK_ORDER_TYPE_OPTIONS } from "@/lib/enum-labels";
import { zodResolver } from "@/lib/form";
import { formatDate, workOrderNumberLabel } from "@/lib/format";
import type {
  RouteStepSnapshot,
  RouteView,
  StockFloorInfo,
} from "@/lib/product-routes-core";
import { routeStepsEqual } from "@/lib/product-routes-core";
import type { CatalogStep, UseDep } from "@/lib/workflow-core";
import { isBlockingIssue, validateComposition } from "@/lib/workflow-core";
import type { WorkOrderView } from "./model";

const BASE_PATH = "/production/work-orders";

interface Option {
  value: string;
  label: string;
}

const schema = z.object({
  // 対象が注文請書のときのみ必須（handleSubmit で検証）
  salesOrderId: z.string(),
  // 在庫向け（注文請書なし）のときの対象製品
  productId: z.string().nullable(),
  type: z.enum(["FROM_STOCK", "MANUFACTURE"]),
  plannedQuantity: z.number().int().min(1, "予定数量は1以上"),
  materialId: z.string().nullable(),
  inspectionTemplateIds: z.array(z.string()),
  notes: z.string(),
  selectedStepIds: z.array(z.number()).min(1, "工程を1つ以上選択してください"),
});

type FormValues = z.infer<typeof schema>;

/** 指示書の対象: 注文請書配下 / 在庫向け（注文請書なし・製品直接指定）。 */
type BuilderTarget = "SALES_ORDER" | "STOCK";

function initialValues(
  workOrder: WorkOrderView | null | undefined,
): FormValues {
  if (!workOrder) {
    return {
      salesOrderId: "",
      productId: null,
      type: "MANUFACTURE",
      plannedQuantity: 1,
      materialId: null,
      inspectionTemplateIds: [],
      notes: "",
      selectedStepIds: [],
    };
  }
  return {
    salesOrderId: workOrder.salesOrderId ?? "",
    productId:
      workOrder.salesOrderId == null ? String(workOrder.productId) : null,
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
      plantId: s.plantId != null ? String(s.plantId) : null,
      supplierBpId: s.supplierBpId,
      workHours: s.plannedWorkHours,
    };
  }
  return map;
}

/** スナップショット列 → 実施場所 map（プリフィル用）。 */
function snapshotLocations(
  steps: readonly RouteStepSnapshot[],
): Record<number, StepLocation> {
  const map: Record<number, StepLocation> = {};
  for (const s of steps) {
    map[s.processStepId] = {
      executionLocation: s.executionLocation,
      plantId: s.plantId != null ? String(s.plantId) : null,
      supplierBpId: s.supplierBpId,
      workHours: s.workHours,
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
  plantOptions,
  templateOptions,
  supplierOptions,
  initialType = null,
  initialQuantity = null,
}: {
  mode: "create" | "edit";
  /** 編集時の既存指示書（view model）。 */
  workOrder?: WorkOrderView | null;
  /** `?salesOrder=` プリセレクト（create 時）。 */
  initialSalesOrder?: SalesOrderRef | null;
  /** §4 分割ガイドからの起動: 種別・数量のプリセット（create 時）。 */
  initialType?: "FROM_STOCK" | "MANUFACTURE" | null;
  initialQuantity?: number | null;
  catalogSteps: CatalogStep[];
  useDeps: UseDep[];
  plantOptions: Option[];
  templateOptions: InspectionTemplateOption[];
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
            plannedQuantity: initialQuantity ?? initialSalesOrder.quantity,
          }
        : {}),
      ...(mode === "create" && initialType ? { type: initialType } : {}),
    },
  });

  const [locations, setLocations] = useState<Record<number, StepLocation>>(
    initialLocations(workOrder),
  );
  // 対象: 注文請書配下 / 在庫向け（編集時は既存指示書から導出）
  const [target, setTarget] = useState<BuilderTarget>(
    workOrder && workOrder.salesOrderId == null ? "STOCK" : "SALES_ORDER",
  );
  const [soInfo, setSoInfo] = useState<SalesOrderRef | null>(
    initialSalesOrder ??
      (workOrder?.salesOrderId != null &&
      workOrder.salesOrderNumber != null &&
      workOrder.salesOrderQuantity != null
        ? {
            id: workOrder.salesOrderId,
            number: workOrder.salesOrderNumber,
            label: `${workOrder.salesOrderNumber} ${workOrder.productName}（${workOrder.salesOrderQuantity}）`,
            customerName: workOrder.customerName ?? "",
            productName: workOrder.productName,
            productId: workOrder.productId,
            quantity: workOrder.salesOrderQuantity,
            status: "",
          }
        : null),
  );

  const selected = form.values.selectedStepIds;

  // 工程を追加したら、その工程を関連工程に持つ検査表を自動選択する
  // （手動で外した選択は、工程を追加し直さない限り復活しない）。
  const prevSelectedRef = useRef<Set<number>>(new Set(selected));
  useEffect(() => {
    const prev = prevSelectedRef.current;
    const added = selected.filter((id) => !prev.has(id));
    prevSelectedRef.current = new Set(selected);
    if (added.length === 0) return;
    const suggest = templateOptions
      .filter(
        (t) =>
          t.relatedProcessStepId != null &&
          added.includes(t.relatedProcessStepId),
      )
      .map((t) => t.value);
    if (suggest.length === 0) return;
    const current = form.values.inspectionTemplateIds;
    const merged = [...new Set([...current, ...suggest])];
    if (merged.length !== current.length) {
      form.setFieldValue("inspectionTemplateIds", merged);
    }
  }, [selected, templateOptions, form.values.inspectionTemplateIds, form]);

  // 編集時: 割当済みだが最新でないバージョンも選択肢に残す（バージョン固定）
  const templateSelectData = useMemo(() => {
    const known = new Set(templateOptions.map((t) => t.value));
    const extra = (workOrder?.inspectionTemplates ?? [])
      .filter((t) => !known.has(String(t.id)))
      .map((t) => ({ value: String(t.id), label: `${t.code} ${t.name}` }));
    return [
      ...templateOptions.map((t) => ({ value: t.value, label: t.label })),
      ...extra,
    ];
  }, [templateOptions, workOrder]);

  // ── 工程ルート（製品の工程リスト） ──────────────────────────────────────────
  const [routesInfo, setRoutesInfo] = useState<{
    productId: number;
    routes: RouteView[];
  } | null>(null);
  /** 選択中ルート id（文字列）。null = ルートを使わない。 */
  const [routeSel, setRouteSel] = useState<string | null>(
    workOrder?.routeId != null ? String(workOrder.routeId) : null,
  );
  const [versionSel, setVersionSel] = useState<string | null>(
    workOrder?.routeVersionId ?? null,
  );
  /** 選択バージョンの工程スナップショット（変更検知の基準）。 */
  const [baseSteps, setBaseSteps] = useState<RouteStepSnapshot[] | null>(null);
  /** ルートを使わない構成を保存する場合の新ルート名（空 = 保存しない）。 */
  const [newRouteName, setNewRouteName] = useState("");

  const salesOrderIdValue = form.values.salesOrderId;
  const productIdValue = form.values.productId;
  useEffect(() => {
    // 対象に応じてルートを解決: 注文請書 → SO の製品 / 在庫向け → 直接指定製品
    const load =
      target === "SALES_ORDER"
        ? salesOrderIdValue
          ? () => getProductRoutesForSalesOrder(salesOrderIdValue)
          : null
        : productIdValue
          ? () => getProductRoutesForProduct(Number(productIdValue))
          : null;
    if (!load) {
      setRoutesInfo(null);
      return;
    }
    let cancelled = false;
    load().then((info) => {
      if (!cancelled) setRoutesInfo(info);
    });
    return () => {
      cancelled = true;
    };
  }, [target, salesOrderIdValue, productIdValue]);

  // 別製品の注文請書へ切り替えたらルート選択をリセット
  useEffect(() => {
    if (routeSel == null || routesInfo == null) return;
    if (!routesInfo.routes.some((r) => String(r.id) === routeSel)) {
      setRouteSel(null);
      setVersionSel(null);
      setBaseSteps(null);
    }
  }, [routesInfo, routeSel]);

  // 編集時: 既存の routeVersionId の基準スナップショットをロード（プリフィル
  // はしない — 現在の構成は既存指示書の工程のまま）。
  useEffect(() => {
    if (mode !== "edit" || !workOrder?.routeVersionId) return;
    let cancelled = false;
    getRouteVersionSteps(workOrder.routeVersionId).then((steps) => {
      if (!cancelled) setBaseSteps(steps);
    });
    return () => {
      cancelled = true;
    };
  }, [mode, workOrder?.routeVersionId]);

  const selectedRoute = useMemo(
    () => routesInfo?.routes.find((r) => String(r.id) === routeSel) ?? null,
    [routesInfo, routeSel],
  );

  /** バージョン選択 → 工程構成をプリフィルし、基準スナップショットを保存。 */
  const applyVersion = useCallback(
    (versionId: string | null) => {
      setVersionSel(versionId);
      if (!versionId) {
        setBaseSteps(null);
        return;
      }
      getRouteVersionSteps(versionId).then((steps) => {
        const knownIds = new Set(catalogSteps.map((s) => s.id));
        const usable = steps.filter((s) => knownIds.has(s.processStepId));
        if (usable.length < steps.length) {
          notifications.show({
            title: "一部の工程を除外しました",
            message:
              "このバージョンには現在無効な工程が含まれていたため除外しました。保存時は新バージョンとして保存されます",
            color: "yellow",
          });
        }
        setBaseSteps(steps);
        form.setFieldValue(
          "selectedStepIds",
          usable.map((s) => s.processStepId),
        );
        setLocations(snapshotLocations(usable));
      });
    },
    [catalogSteps, form],
  );

  const onRouteChange = (value: string | null) => {
    setRouteSel(value);
    setNewRouteName("");
    if (!value) {
      setVersionSel(null);
      setBaseSteps(null);
      return;
    }
    const route = routesInfo?.routes.find((r) => String(r.id) === value);
    const latest = route?.versions[0];
    applyVersion(latest?.id ?? null);
  };

  // 指示書は工程リスト必須 — ルートのある製品では先頭ルートを初期選択する
  // （create 時にルート情報のロード完了ごとに 1 回。手動クリア後は再発火しない）。
  // biome-ignore lint/correctness/useExhaustiveDependencies: routesInfo ロード時のみ発火させる
  useEffect(() => {
    if (mode !== "create" || routesInfo == null || routeSel != null) return;
    const first = routesInfo.routes[0];
    if (first) {
      setRouteSel(String(first.id));
      applyVersion(first.versions[0]?.id ?? null);
    }
  }, [routesInfo]);

  /** 現在の構成のスナップショット（保存ペイロードと同じ規則）。 */
  const currentSnapshots = useMemo(
    () => toStepSnapshots(selected, locations, catalogSteps),
    [selected, locations, catalogSteps],
  );
  const routeModified =
    routeSel != null &&
    baseSteps != null &&
    !routeStepsEqual(baseSteps, currentSnapshots);
  const latestVersionOfRoute = selectedRoute?.versions[0]?.version ?? 0;

  // ── 在庫フロア（§4 在庫考慮 — 製造分の最低予定数量） ────────────────────────
  const [stockFloor, setStockFloor] = useState<StockFloorInfo | null>(null);
  useEffect(() => {
    if (target !== "SALES_ORDER" || !salesOrderIdValue) {
      setStockFloor(null);
      return;
    }
    let cancelled = false;
    getStockFloorInfo(
      salesOrderIdValue,
      mode === "edit" ? workOrder?.workOrderNumber : undefined,
    ).then((info) => {
      if (!cancelled) setStockFloor(info);
    });
    return () => {
      cancelled = true;
    };
  }, [target, salesOrderIdValue, mode, workOrder?.workOrderNumber]);

  const floor =
    target === "SALES_ORDER" && form.values.type === "MANUFACTURE"
      ? (stockFloor?.floor ?? 0)
      : 0;

  // ── 素材 ATP（§5 充足チェック — 警告のみ、保存はブロックしない） ─────────────
  const [materialAtpInfo, setMaterialAtpInfo] = useState<MaterialAtp | null>(
    null,
  );
  const materialIdValue =
    form.values.type === "MANUFACTURE" ? form.values.materialId : null;
  useEffect(() => {
    if (!materialIdValue) {
      setMaterialAtpInfo(null);
      return;
    }
    let cancelled = false;
    getMaterialAtp(Number(materialIdValue)).then((atp) => {
      if (!cancelled) setMaterialAtpInfo(atp);
    });
    return () => {
      cancelled = true;
    };
  }, [materialIdValue]);

  // ── ライブ構成検証（保存ガード — 表示は ProcessListEditor 側） ───────────────
  const blockers = useMemo(
    () => validateComposition(selected, useDeps).filter(isBlockingIssue),
    [selected, useDeps],
  );

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

  const handleSubmit = (values: FormValues) => {
    if (blockers.length > 0) {
      notifications.show({
        title: "工程構成にエラーがあります",
        message: "赤色の警告を解消してから保存してください",
        color: "red",
      });
      return;
    }
    if (target === "SALES_ORDER" && !values.salesOrderId) {
      form.setFieldError("salesOrderId", "注文請書を選択してください");
      return;
    }
    if (target === "STOCK" && !values.productId) {
      form.setFieldError("productId", "対象製品を選択してください");
      return;
    }
    if (
      target === "SALES_ORDER" &&
      values.type === "MANUFACTURE" &&
      floor > 0 &&
      values.plannedQuantity < floor
    ) {
      form.setFieldError(
        "plannedQuantity",
        `在庫引当を除いた必要数量 ${floor} 以上で入力してください`,
      );
      return;
    }
    // 指示書は常に工程リスト（ルート）に基づく — 既存を選ぶか新規作成する
    const route: WorkOrderInput["route"] | null =
      routeSel != null && versionSel != null
        ? {
            mode: "existing",
            routeId: Number(routeSel),
            baseVersionId: versionSel,
          }
        : newRouteName.trim()
          ? { mode: "new", name: newRouteName.trim() }
          : null;
    if (route == null) {
      notifications.show({
        title: "工程リストが必要です",
        message:
          "既存の工程リストを選択するか、新しい工程リスト名を入力してください",
        color: "red",
      });
      return;
    }
    const payload: WorkOrderInput = {
      salesOrderId: target === "SALES_ORDER" ? values.salesOrderId : null,
      productId:
        target === "STOCK" && values.productId
          ? Number(values.productId)
          : null,
      type: target === "STOCK" ? "MANUFACTURE" : values.type,
      plannedQuantity: values.plannedQuantity,
      materialId:
        values.type === "MANUFACTURE" && values.materialId
          ? Number(values.materialId)
          : null,
      inspectionTemplateIds: values.inspectionTemplateIds.map(Number),
      notes: values.notes,
      steps: currentSnapshots.map((s) => ({
        processStepId: s.processStepId,
        executionLocation: s.executionLocation,
        plantId: s.plantId,
        supplierBpId: s.supplierBpId,
        workHours: s.workHours,
      })),
      route,
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
              ? `指示書 ${workOrderNumberLabel(
                  result.data.workOrderNumber,
                  workOrder?.createdAt ?? new Date(),
                )} を更新しました`
              : `指示書 ${workOrderNumberLabel(
                  result.data.workOrderNumber,
                  new Date(),
                )} を作成しました`,
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

  const routeOptions: Option[] =
    routesInfo?.routes.map((r) => ({ value: String(r.id), label: r.name })) ??
    [];
  const versionOptions: Option[] =
    selectedRoute?.versions.map((v) => ({
      value: v.id,
      label: `v${v.version}（${formatDate(v.createdAt)}）`,
    })) ?? [];

  return (
    <FormShell
      breadcrumbs={[
        "生産",
        { label: "指示書", href: BASE_PATH },
        mode === "edit" ? "編集" : "新規作成",
      ]}
      isDirty={form.isDirty()}
      isPending={isPending}
      onCancel={() =>
        router.push(
          workOrder ? `${BASE_PATH}/${workOrder.workOrderNumber}` : BASE_PATH,
        )
      }
      onSubmit={form.onSubmit(handleSubmit)}
      title={
        mode === "edit"
          ? `指示書 ${workOrderNumberLabel(
              workOrder?.workOrderNumber,
              workOrder?.createdAt,
            )} 編集`
          : "指示書 新規作成"
      }
    >
      <FormSection required title="基本情報">
        <Stack gap={4} mb="sm">
          <Text fw={500} size="sm">
            対象
          </Text>
          <SegmentedControl
            data={[
              { value: "SALES_ORDER", label: "注文請書に紐づく" },
              { value: "STOCK", label: "在庫向け（注文請書なし）" },
            ]}
            onChange={(v) => {
              const next = v as BuilderTarget;
              setTarget(next);
              // 在庫向けは製造分のみ（顧客注文分は常に注文請書配下）
              if (next === "STOCK") form.setFieldValue("type", "MANUFACTURE");
            }}
            value={target}
          />
        </Stack>
        <SimpleGrid cols={isMobile ? 1 : 2} spacing="sm">
          {target === "SALES_ORDER" ? (
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
          ) : (
            <Stack gap={4}>
              <SearchSelect
                error={form.errors.productId}
                initialOption={
                  workOrder && workOrder.salesOrderId == null
                    ? {
                        value: String(workOrder.productId),
                        label: workOrder.productName,
                      }
                    : null
                }
                label="対象製品"
                onChange={(v) => form.setFieldValue("productId", v)}
                onSearch={searchProductOptions}
                placeholder="製品コード・名称で検索"
                storageKey="product"
                value={form.values.productId}
                withAsterisk
              />
              <Text c="dimmed" size="xs">
                完成品は指示書番号のロットで在庫入庫され、後日任意の注文請書の
                出荷に充当できます
              </Text>
            </Stack>
          )}
          <Stack gap={4}>
            <Text fw={500} size="sm">
              種別
            </Text>
            <SegmentedControl
              data={WORK_ORDER_TYPE_OPTIONS.map((o) => ({
                ...o,
                disabled: target === "STOCK" && o.value === "FROM_STOCK",
              }))}
              onChange={(v) => {
                form.setFieldValue("type", v as FormValues["type"]);
                if (v === "FROM_STOCK") form.setFieldValue("materialId", null);
              }}
              value={form.values.type}
            />
          </Stack>
          <NumberInput
            allowDecimal={false}
            description={
              floor > 0 ? `最低 ${floor}（不良予備分は上乗せ可）` : undefined
            }
            label="予定数量"
            min={Math.max(1, floor)}
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
            data={templateSelectData}
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
        {/* 在庫フロア（§4 在庫考慮）— 製造分のみ。下限はサーバーでも検証する。 */}
        {form.values.type === "MANUFACTURE" && stockFloor && (
          <StockFloorAlert
            info={stockFloor}
            plannedQuantity={form.values.plannedQuantity}
          />
        )}
        {/* 素材 ATP 警告（充足=緑 / 不足+入荷予定あり=黄 / 不足+入荷予定なし=赤）。
            警告のみ — 保存はブロックしない（§5 素材判断は指示書承認側で行う）。 */}
        {materialIdValue && materialAtpInfo && (
          <MaterialAtpAlert
            atp={materialAtpInfo}
            plannedQuantity={form.values.plannedQuantity}
          />
        )}
      </FormSection>

      {(target === "SALES_ORDER" ? soInfo != null : !!productIdValue) && (
        <FormSection
          description="指示書は常に製品の工程リストに基づきます。既存のリストを選ぶと工程構成をプリフィル、未登録の製品はこの画面から新しいリストを作成します。構成を変更した場合は保存時に新バージョンとして自動保存されます（使用済みバージョンは変更されません）。"
          required
          title="工程リスト"
        >
          <SimpleGrid cols={isMobile ? 1 : 2} spacing="sm">
            <Select
              clearable
              data={routeOptions}
              label="工程リスト"
              onChange={onRouteChange}
              placeholder={
                routeOptions.length
                  ? "工程リストを選択"
                  : "この製品の工程リストは未登録です（下で新規作成）"
              }
              searchable
              value={routeSel}
            />
            {routeSel != null ? (
              <Select
                allowDeselect={false}
                data={versionOptions}
                label="バージョン"
                onChange={(v) => applyVersion(v)}
                value={versionSel}
              />
            ) : (
              <TextInput
                description="この工程構成を製品の工程リスト v1 として保存します"
                label="新しい工程リスト名"
                onChange={(e) => setNewRouteName(e.currentTarget.value)}
                placeholder="例: 標準工程"
                value={newRouteName}
                withAsterisk
              />
            )}
          </SimpleGrid>
          {routeModified && selectedRoute && (
            <Alert
              color="blue"
              icon={<IconInfoCircle size={16} />}
              mt="sm"
              p="xs"
              variant="light"
            >
              工程構成がルート「{selectedRoute.name}」の選択バージョンから
              変更されています — 保存時に新バージョン v
              {latestVersionOfRoute + 1} として保存されます
            </Alert>
          )}
        </FormSection>
      )}

      <ProcessListEditor
        catalogSteps={catalogSteps}
        error={
          typeof form.errors.selectedStepIds === "string"
            ? form.errors.selectedStepIds
            : null
        }
        locations={locations}
        onLocationsChange={setLocations}
        onSelectedChange={(next) => form.setFieldValue("selectedStepIds", next)}
        plantOptions={plantOptions}
        selected={selected}
        supplierOptions={supplierOptions}
        useDeps={useDeps}
      />

      <Textarea
        autosize
        label="備考"
        minRows={2}
        {...form.getInputProps("notes")}
      />
    </FormShell>
  );
}

/**
 * 在庫フロアのインライン表示 — 受注数量・引当済在庫・他の製造指示から
 * 最低予定数量を示す。下回る入力はサーバー側でも拒否される。
 */
function StockFloorAlert({
  info,
  plannedQuantity,
}: {
  info: StockFloorInfo;
  plannedQuantity: number;
}) {
  const planned = Number.isFinite(plannedQuantity) ? plannedQuantity : 0;
  const parts = [
    `受注数量 ${info.soQuantity.toLocaleString("ja-JP")}`,
    `在庫引当済 ${info.reservedForSo.toLocaleString("ja-JP")}`,
    ...(info.otherManufacture > 0
      ? [`他の製造指示 ${info.otherManufacture.toLocaleString("ja-JP")}`]
      : []),
  ];
  if (info.floor <= 0) {
    return (
      <Alert
        color="green"
        icon={<IconInfoCircle size={16} />}
        mt="sm"
        p="xs"
        variant="light"
      >
        {parts.join(" ・ ")} — 必要数量は在庫・既存の製造指示で充足しています
      </Alert>
    );
  }
  const short = planned < info.floor;
  return (
    <Alert
      color={short ? "red" : "blue"}
      icon={
        short ? <IconAlertTriangle size={16} /> : <IconInfoCircle size={16} />
      }
      mt="sm"
      p="xs"
      variant="light"
    >
      {parts.join(" ・ ")} → 最低予定数量 {info.floor.toLocaleString("ja-JP")}
      （不良予備分として {info.floor.toLocaleString("ja-JP")}{" "}
      より多く設定できます）
    </Alert>
  );
}

/**
 * 素材 ATP インライン警告 — 現在利用可能数と予定数量の比較。
 * 緑: 充足 / 黄: 不足だが入荷予定あり（次回入荷日を表示）/ 赤: 不足・入荷予定なし。
 */
function MaterialAtpAlert({
  atp,
  plannedQuantity,
}: {
  atp: MaterialAtp;
  plannedQuantity: number;
}) {
  const planned = Number.isFinite(plannedQuantity) ? plannedQuantity : 0;
  const shortage = planned - atp.availableNow;

  if (shortage <= 0) {
    return (
      <Alert
        color="green"
        icon={<IconInfoCircle size={16} />}
        mt="sm"
        p="xs"
        variant="light"
      >
        素材在庫は充足しています（現在利用可能{" "}
        {atp.availableNow.toLocaleString("ja-JP")} / 予定数量{" "}
        {planned.toLocaleString("ja-JP")}）
      </Alert>
    );
  }
  if (atp.nextReceiptDate) {
    return (
      <Alert
        color="yellow"
        icon={<IconAlertTriangle size={16} />}
        mt="sm"
        p="xs"
        variant="light"
      >
        素材在庫が {shortage.toLocaleString("ja-JP")} 不足しています
        （現在利用可能 {atp.availableNow.toLocaleString("ja-JP")} / 予定数量{" "}
        {planned.toLocaleString("ja-JP")}）— 次回入荷予定:{" "}
        {formatDate(atp.nextReceiptDate)}
      </Alert>
    );
  }
  return (
    <Alert
      color="red"
      icon={<IconAlertTriangle size={16} />}
      mt="sm"
      p="xs"
      variant="light"
    >
      素材在庫が {shortage.toLocaleString("ja-JP")} 不足しています
      （現在利用可能 {atp.availableNow.toLocaleString("ja-JP")} / 予定数量{" "}
      {planned.toLocaleString("ja-JP")}）—
      入荷予定がありません。素材発注を検討してください
    </Alert>
  );
}
