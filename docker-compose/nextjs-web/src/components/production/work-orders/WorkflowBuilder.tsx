"use client";

/**
 * WorkflowBuilder — 指示書 新規作成 / 編集 (PD12 / PD22, design.md §8.3)。
 *
 * 注文明細の割当・種別・予定数量・使用素材・保管場所・検査表の基本情報と、
 * 工程構成エディタ（ProcessListEditor — 工程選択 + 実施場所、必須随伴工程の
 * 自動追加）で構成する。
 *
 * 割当（分割・統合 — lib/work-order-alloc-core）: 1 指示書に複数の注文明細を
 * 割り当てられ（統合ロット・同一製品のみ）、1 明細を複数指示書に分けて部分
 * 手配することもできる。明細ごとの受注残（受注数量 − 手配済）を上限に割当数を
 * 入力し、予定数量は割当合計以上（不良予備分の上乗せは自由）。
 *
 * 工程ルート（製品の工程リスト）: 注文明細を選ぶと対象製品のルートを読み込み、
 * ルート + バージョン（既定 = 最新）を選ぶと工程構成をプリフィルする。構成を
 * 変更すると保存時に新バージョンとして自動保存される（変更検知は
 * routeStepsEqual — server 側と同一基準）。ルートを使わない場合、ルート名を
 * 入力すればその構成を新ルート v1 として保存できる。
 */

import {
  ActionIcon,
  Alert,
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
  TextInput,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { notifications } from "@mantine/notifications";
import {
  IconAlertTriangle,
  IconInfoCircle,
  IconPlus,
  IconTrash,
} from "@tabler/icons-react";
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
  searchOrderLineOptions,
  searchProductOptions,
} from "@/app/(dashboard)/_shared/option-search";
import {
  createWorkOrder,
  getMaterialAtp,
  getOrderLineInfo,
  getProductRoutesForOrderLine,
  getProductRoutesForProduct,
  getRouteVersionSteps,
  updateWorkOrder,
  type WorkOrderInput,
} from "@/app/(dashboard)/production/work-orders/actions";
import type {
  InspectionTemplateOption,
  OrderLineRef,
} from "@/app/(dashboard)/production/work-orders/data";
import { useFormat } from "@/components/layout/PreferencesProvider";
import {
  ProcessListEditor,
  type StepLocation,
  toStepSnapshots,
} from "@/components/production/ProcessListEditor";
import { GhostButton } from "@/components/ui/buttons";
import { HelpLabel } from "@/components/ui/HelpLabel";
import { SearchSelect } from "@/components/ui/SearchSelect";
import { FormSection, FormShell } from "@/components/ui/shells";
import { useIsMobile } from "@/hooks/useViewport";
// type-only import — lib/atp は server-only（型はバンドルされない）。
import type { MaterialAtp } from "@/lib/atp";
import { WORK_ORDER_TYPE_OPTIONS } from "@/lib/enum-labels";
import { fieldHelp } from "@/lib/field-help";
import { zodResolver } from "@/lib/form";
import type { RouteStepSnapshot, RouteView } from "@/lib/product-routes-core";
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
  // 在庫向け（注文明細なし）のときの対象製品
  productId: z.string().nullable(),
  type: z.enum(["FROM_STOCK", "MANUFACTURE"]),
  plannedQuantity: z.number().int().min(1, "予定数量は1以上"),
  materialId: z.string().nullable(),
  storageLocationId: z.string().nullable(),
  inspectionTemplateIds: z.array(z.string()),
  notes: z.string(),
  selectedStepIds: z.array(z.number()).min(1, "工程を1つ以上選択してください"),
});

type FormValues = z.infer<typeof schema>;

/** 指示書の対象: 注文明細配下 / 在庫向け（注文明細なし・製品直接指定）。 */
type BuilderTarget = "SALES_ORDER" | "STOCK";

/** 割当エディタの 1 行（注文明細 + 割当数量）。 */
interface AllocRow {
  key: number;
  orderLineId: string | null;
  quantity: number;
  info: OrderLineRef | null;
}

function initialValues(
  workOrder: WorkOrderView | null | undefined,
): FormValues {
  if (!workOrder) {
    return {
      productId: null,
      type: "MANUFACTURE",
      plannedQuantity: 1,
      materialId: null,
      storageLocationId: null,
      inspectionTemplateIds: [],
      notes: "",
      selectedStepIds: [],
    };
  }
  return {
    productId:
      workOrder.orderLines.length === 0 ? String(workOrder.productId) : null,
    type: workOrder.type as FormValues["type"],
    plannedQuantity: workOrder.plannedQuantity,
    materialId:
      workOrder.materialId != null ? String(workOrder.materialId) : null,
    storageLocationId:
      workOrder.storageLocationId != null
        ? String(workOrder.storageLocationId)
        : null,
    inspectionTemplateIds: workOrder.inspectionTemplates.map((t) =>
      String(t.id),
    ),
    notes: workOrder.notes ?? "",
    selectedStepIds: workOrder.steps.map((s) => s.processStepId),
  };
}

/** 編集時の初期割当行（既存の割当 → AllocRow。info は表示用に合成）。 */
function initialAllocRows(
  workOrder: WorkOrderView | null | undefined,
  initialOrderLine: OrderLineRef | null | undefined,
  initialQuantity: number | null,
): AllocRow[] {
  if (workOrder && workOrder.orderLines.length > 0) {
    return workOrder.orderLines.map((l, i) => ({
      key: i,
      orderLineId: l.orderLineId,
      quantity: l.allocatedQuantity,
      info: {
        id: l.orderLineId,
        number: l.number,
        label: `${l.number} ${workOrder.productName}（${l.lineQuantity}）`,
        customerName: l.customerName ?? "",
        productName: workOrder.productName,
        productId: workOrder.productId,
        quantity: l.lineQuantity,
        status: l.status,
        // 表示用の暫定値 — 選び直したときにサーバー値で更新される
        allocatedQuantity: 0,
        remainingQuantity: l.lineQuantity,
      },
    }));
  }
  if (initialOrderLine) {
    return [
      {
        key: 0,
        orderLineId: initialOrderLine.id,
        quantity:
          initialQuantity ??
          (initialOrderLine.remainingQuantity > 0
            ? initialOrderLine.remainingQuantity
            : initialOrderLine.quantity),
        info: initialOrderLine,
      },
    ];
  }
  return [{ key: 0, orderLineId: null, quantity: 1, info: null }];
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
  initialOrderLine,
  catalogSteps,
  useDeps,
  plantOptions,
  templateOptions,
  supplierOptions,
  storageLocationOptions,
  initialType = null,
  initialQuantity = null,
}: {
  mode: "create" | "edit";
  /** 編集時の既存指示書（view model）。 */
  workOrder?: WorkOrderView | null;
  /** `?orderLine=` プリセレクト（create 時）。 */
  initialOrderLine?: OrderLineRef | null;
  /** §4 分割ガイドからの起動: 種別・数量のプリセット（create 時）。 */
  initialType?: "FROM_STOCK" | "MANUFACTURE" | null;
  initialQuantity?: number | null;
  catalogSteps: CatalogStep[];
  useDeps: UseDep[];
  plantOptions: Option[];
  templateOptions: InspectionTemplateOption[];
  /** 外注先（VENDOR ロールの有効 BP）— サーバーで全件ロード。 */
  supplierOptions: Option[];
  /** 保管場所（有効のみ・拠点名付き）— 完成品の保管先。 */
  storageLocationOptions: Option[];
}) {
  const fmt = useFormat();
  const router = useRouter();
  const isMobile = useIsMobile();
  const [isPending, startTransition] = useTransition();

  const form = useForm<FormValues>({
    validate: zodResolver(schema),
    initialValues: {
      ...initialValues(workOrder),
      ...(mode === "create" && initialOrderLine
        ? {
            plannedQuantity:
              initialQuantity ??
              (initialOrderLine.remainingQuantity > 0
                ? initialOrderLine.remainingQuantity
                : initialOrderLine.quantity),
          }
        : {}),
      ...(mode === "create" && initialType ? { type: initialType } : {}),
    },
  });

  const [locations, setLocations] = useState<Record<number, StepLocation>>(
    initialLocations(workOrder),
  );
  // 対象: 注文明細配下 / 在庫向け（編集時は既存指示書から導出）
  const [target, setTarget] = useState<BuilderTarget>(
    workOrder && workOrder.orderLines.length === 0 ? "STOCK" : "SALES_ORDER",
  );
  // 割当行（分割・統合エディタ）。STOCK では使わない。
  const [allocRows, setAllocRows] = useState<AllocRow[]>(() =>
    initialAllocRows(workOrder, initialOrderLine, initialQuantity),
  );
  const nextRowKey = useRef(allocRows.length);
  // 編集時: 自分の既存割当（残数表示の戻し分 — サーバー検証は自分を除外する）
  const ownAllocations = useMemo(() => {
    const map = new Map<string, number>();
    for (const l of workOrder?.orderLines ?? []) {
      map.set(l.orderLineId, l.allocatedQuantity);
    }
    return map;
  }, [workOrder]);

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

  // 割当先頭の明細（工程ルート解決・素材 ATP の基準）
  const firstOrderLineId =
    allocRows.find((r) => r.orderLineId != null)?.orderLineId ?? null;
  const productIdValue = form.values.productId;
  useEffect(() => {
    // 対象に応じてルートを解決: 注文明細 → 明細の製品 / 在庫向け → 直接指定製品
    const load =
      target === "SALES_ORDER"
        ? firstOrderLineId
          ? () => getProductRoutesForOrderLine(firstOrderLineId)
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
  }, [target, firstOrderLineId, productIdValue]);

  // 別製品の注文明細へ切り替えたらルート選択をリセット
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

  // ── 割当（分割・統合） ─────────────────────────────────────────────────────
  /** 行の残数表示（編集時は自分の既存割当分を戻す — サーバーも自分を除外）。 */
  const rowRemaining = useCallback(
    (row: AllocRow): number | null => {
      if (!row.info || !row.orderLineId) return null;
      return (
        row.info.remainingQuantity + (ownAllocations.get(row.orderLineId) ?? 0)
      );
    },
    [ownAllocations],
  );

  const allocTotal = useMemo(
    () =>
      allocRows.reduce(
        (sum, r) => sum + (r.orderLineId != null ? r.quantity : 0),
        0,
      ),
    [allocRows],
  );

  // 予定数量は割当合計以上（在庫分は一致）。合計の変動に追従して自動補正する。
  const plannedQuantityValue = form.values.plannedQuantity;
  const typeValue = form.values.type;
  useEffect(() => {
    if (target !== "SALES_ORDER" || allocTotal <= 0) return;
    if (typeValue === "FROM_STOCK") {
      if (plannedQuantityValue !== allocTotal) {
        form.setFieldValue("plannedQuantity", allocTotal);
      }
    } else if (plannedQuantityValue < allocTotal) {
      form.setFieldValue("plannedQuantity", allocTotal);
    }
  }, [target, allocTotal, typeValue, plannedQuantityValue, form]);

  // 割当明細の製品が混在していないか（統合ロットは同一製品のみ）
  const productMismatch = useMemo(() => {
    const ids = new Set(
      allocRows
        .filter((r) => r.info && r.orderLineId)
        .map((r) => r.info?.productId ?? 0),
    );
    return ids.size > 1;
  }, [allocRows]);

  const updateAllocRow = (key: number, patch: Partial<AllocRow>) => {
    setAllocRows((rows) =>
      rows.map((r) => (r.key === key ? { ...r, ...patch } : r)),
    );
  };

  const onRowLineChange = (key: number, value: string | null) => {
    if (!value) {
      updateAllocRow(key, { orderLineId: null, info: null });
      return;
    }
    if (allocRows.some((r) => r.key !== key && r.orderLineId === value)) {
      notifications.show({
        title: "既に割り当て済みです",
        message: "同じ注文明細を複数行に割り当てることはできません",
        color: "yellow",
      });
      return;
    }
    updateAllocRow(key, { orderLineId: value });
    getOrderLineInfo(value).then((info) => {
      if (!info) return;
      const own = ownAllocations.get(value) ?? 0;
      const remaining = info.remainingQuantity + own;
      setAllocRows((rows) =>
        rows.map((r) =>
          r.key === key
            ? {
                ...r,
                info,
                quantity: remaining > 0 ? remaining : Math.max(1, r.quantity),
              }
            : r,
        ),
      );
    });
  };

  const addAllocRow = () => {
    setAllocRows((rows) => [
      ...rows,
      { key: nextRowKey.current++, orderLineId: null, quantity: 1, info: null },
    ]);
  };

  const removeAllocRow = (key: number) => {
    setAllocRows((rows) =>
      rows.length > 1
        ? rows.filter((r) => r.key !== key)
        : [
            {
              key: nextRowKey.current++,
              orderLineId: null,
              quantity: 1,
              info: null,
            },
          ],
    );
  };

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

  const handleSubmit = (values: FormValues) => {
    if (blockers.length > 0) {
      notifications.show({
        title: "工程構成にエラーがあります",
        message: "赤色の警告を解消してから保存してください",
        color: "red",
      });
      return;
    }
    const allocations = allocRows
      .filter((r) => r.orderLineId != null)
      .map((r) => ({
        orderLineId: r.orderLineId as string,
        quantity: r.quantity,
      }));
    if (target === "SALES_ORDER" && allocations.length === 0) {
      notifications.show({
        title: "注文明細が必要です",
        message: "指示書に割り当てる注文明細を選択してください",
        color: "red",
      });
      return;
    }
    if (target === "SALES_ORDER" && productMismatch) {
      notifications.show({
        title: "製品が混在しています",
        message: "1 つの指示書に割り当てる注文明細は同一製品にしてください",
        color: "red",
      });
      return;
    }
    if (target === "STOCK" && !values.productId) {
      form.setFieldError("productId", "対象製品を選択してください");
      return;
    }
    if (
      target === "SALES_ORDER" &&
      values.plannedQuantity < allocations.reduce((s, a) => s + a.quantity, 0)
    ) {
      form.setFieldError(
        "plannedQuantity",
        "予定数量は割当合計以上で入力してください",
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
      allocations: target === "SALES_ORDER" ? allocations : [],
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
      storageLocationId: values.storageLocationId
        ? Number(values.storageLocationId)
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
              ? `指示書 ${fmt.workOrderNumberLabel(
                  result.data.workOrderNumber,
                  workOrder?.createdAt ?? new Date(),
                )} を更新しました`
              : `指示書 ${fmt.workOrderNumberLabel(
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
      label: `v${v.version}（${fmt.date(v.createdAt)}）`,
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
          ? `指示書 ${fmt.workOrderNumberLabel(
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
              { value: "SALES_ORDER", label: "注文明細に紐づく" },
              { value: "STOCK", label: "在庫向け（注文明細なし）" },
            ]}
            onChange={(v) => {
              const next = v as BuilderTarget;
              setTarget(next);
              // 在庫向けは製造分のみ（顧客注文分は常に注文明細配下）
              if (next === "STOCK") form.setFieldValue("type", "MANUFACTURE");
            }}
            value={target}
          />
        </Stack>
        {target === "SALES_ORDER" && (
          <Stack gap="xs" mb="sm">
            <Text fw={500} size="sm">
              注文明細の割当
            </Text>
            <Text c="dimmed" size="xs">
              1 つの明細を複数の指示書に分けて手配（分割）することも、同一製品の
              複数明細を 1 つの指示書にまとめる（統合ロット）こともできます。
              割当数は明細ごとの受注残が上限です
            </Text>
            {allocRows.map((row) => {
              const remaining = rowRemaining(row);
              return (
                <Paper key={row.key} p="sm" radius="sm" withBorder>
                  <Group
                    align="flex-end"
                    gap="sm"
                    wrap={isMobile ? "wrap" : "nowrap"}
                  >
                    <div style={{ flex: 1, minWidth: 220 }}>
                      <SearchSelect
                        initialOption={
                          row.info
                            ? { value: row.info.id, label: row.info.label }
                            : null
                        }
                        label={
                          <HelpLabel {...fieldHelp("workOrder", "orderLine")} />
                        }
                        onChange={(v) => onRowLineChange(row.key, v)}
                        onSearch={searchOrderLineOptions}
                        placeholder="注文明細番号・製品・顧客で検索"
                        storageKey="sales-order"
                        value={row.orderLineId}
                        withAsterisk
                      />
                    </div>
                    <NumberInput
                      allowDecimal={false}
                      label="割当数量"
                      max={
                        remaining != null && remaining > 0
                          ? remaining
                          : undefined
                      }
                      min={1}
                      onChange={(v) =>
                        updateAllocRow(row.key, {
                          quantity: typeof v === "number" ? v : 1,
                        })
                      }
                      style={{ width: isMobile ? "100%" : 140 }}
                      value={row.quantity}
                      withAsterisk
                    />
                    <ActionIcon
                      aria-label="割当行を削除"
                      color="red"
                      mb={4}
                      onClick={() => removeAllocRow(row.key)}
                      variant="subtle"
                    >
                      <IconTrash size={16} />
                    </ActionIcon>
                  </Group>
                  {row.info && (
                    <Text c="dimmed" mt={4} size="xs">
                      {row.info.customerName} / {row.info.productName} /
                      受注数量 {row.info.quantity}
                      {remaining != null && ` / 割当可能残 ${remaining}`}
                    </Text>
                  )}
                </Paper>
              );
            })}
            {productMismatch && (
              <Alert
                color="red"
                icon={<IconAlertTriangle size={16} />}
                p="xs"
                variant="light"
              >
                割当明細の製品が混在しています — 1
                つの指示書に割り当てる注文明細は同一製品にしてください
              </Alert>
            )}
            {form.values.type !== "FROM_STOCK" && (
              <GhostButton
                leftSection={<IconPlus size={14} />}
                onClick={addAllocRow}
                style={{ alignSelf: "flex-start" }}
              >
                明細を追加（統合ロット）
              </GhostButton>
            )}
          </Stack>
        )}
        <SimpleGrid cols={isMobile ? 1 : 2} spacing="sm">
          {target === "STOCK" && (
            <Stack gap={4}>
              <SearchSelect
                error={form.errors.productId}
                initialOption={
                  workOrder && workOrder.orderLines.length === 0
                    ? {
                        value: String(workOrder.productId),
                        label: workOrder.productName,
                      }
                    : null
                }
                label={<HelpLabel {...fieldHelp("workOrder", "product")} />}
                onChange={(v) => form.setFieldValue("productId", v)}
                onSearch={searchProductOptions}
                placeholder="製品コード・名称で検索"
                storageKey="product"
                value={form.values.productId}
                withAsterisk
              />
              <Text c="dimmed" size="xs">
                完成品は指示書番号のロットで在庫入庫され、後日任意の注文明細の
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
                if (v === "FROM_STOCK") {
                  form.setFieldValue("materialId", null);
                  // 在庫分は割当 1 件のみ — 先頭の有効行だけ残す
                  setAllocRows((rows) => {
                    const first =
                      rows.find((r) => r.orderLineId != null) ?? rows[0];
                    return [first];
                  });
                }
              }}
              value={form.values.type}
            />
          </Stack>
          <NumberInput
            allowDecimal={false}
            description={
              target === "SALES_ORDER" && allocTotal > 0
                ? form.values.type === "FROM_STOCK"
                  ? "在庫分は割当合計と一致します"
                  : `割当合計 ${allocTotal} 以上（不良予備分は上乗せ可）`
                : undefined
            }
            label={<HelpLabel {...fieldHelp("workOrder", "plannedQuantity")} />}
            min={Math.max(1, target === "SALES_ORDER" ? allocTotal : 1)}
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
              label={<HelpLabel {...fieldHelp("workOrder", "material")} />}
              onChange={(v) => form.setFieldValue("materialId", v)}
              onSearch={searchMaterialOptions}
              placeholder="素材コード・名称で検索"
              storageKey="material"
              value={form.values.materialId}
            />
          )}
          <Select
            clearable
            data={storageLocationOptions}
            label="保管場所"
            placeholder="完成品の保管場所を選択"
            searchable={storageLocationOptions.length > 5}
            {...form.getInputProps("storageLocationId")}
          />
          <MultiSelect
            clearable
            data={templateSelectData}
            label={
              <HelpLabel {...fieldHelp("workOrder", "inspectionTemplates")} />
            }
            placeholder={
              form.values.inspectionTemplateIds.length
                ? undefined
                : "検査表テンプレートを選択"
            }
            searchable
            {...form.getInputProps("inspectionTemplateIds")}
          />
        </SimpleGrid>
        {/* 素材 ATP 警告（充足=緑 / 不足+入荷予定あり=黄 / 不足+入荷予定なし=赤）。
            警告のみ — 保存はブロックしない（§5 素材判断は指示書承認側で行う）。 */}
        {materialIdValue && materialAtpInfo && (
          <MaterialAtpAlert
            atp={materialAtpInfo}
            plannedQuantity={form.values.plannedQuantity}
          />
        )}
      </FormSection>

      {(target === "SALES_ORDER"
        ? allocRows.some((r) => r.info != null)
        : !!productIdValue) && (
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
                label={
                  <HelpLabel {...fieldHelp("workOrder", "newRouteName")} />
                }
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
        label={<HelpLabel {...fieldHelp("workOrder", "notes")} />}
        minRows={2}
        {...form.getInputProps("notes")}
      />
    </FormShell>
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
  const fmt = useFormat();
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
        {fmt.date(atp.nextReceiptDate)}
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
