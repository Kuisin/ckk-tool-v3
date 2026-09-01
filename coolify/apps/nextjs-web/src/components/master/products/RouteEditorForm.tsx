"use client";

/**
 * RouteEditorForm — 製品工程ルートの新規作成 / 新バージョン作成フォーム。
 *
 * 工程構成エディタ（ProcessListEditor）を指示書ビルダーと共用する。
 * mode = "create": ルート名 + 構成 → createProductRoute（v1）。
 * mode = "new-version": 名前は読み取り表示、最新バージョンをプリフィルして
 * createProductRouteVersion（同一構成は server が拒否）。
 */

import { Alert, Select, SimpleGrid, TextInput } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconAlertTriangle } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import {
  createProductRoute,
  createProductRouteVersion,
} from "@/app/(dashboard)/master/products/route-actions";
import {
  type Option,
  ProcessListEditor,
  type StepLocation,
  toStepSnapshots,
} from "@/components/production/ProcessListEditor";
import { FormSection, FormShell } from "@/components/ui/shells";
import { useTr } from "@/hooks/useTr";
import { useIsMobile } from "@/hooks/useViewport";
import type { RouteStepSnapshot } from "@/lib/product-routes-core";
import type { CatalogStep, UseDep } from "@/lib/workflow-core";
import {
  isBlockingIssue,
  STOCK_ISSUE_STEP_CODE,
  validateComposition,
} from "@/lib/workflow-core";

export function RouteEditorForm({
  mode,
  productId,
  productLabel,
  routeId,
  routeName,
  latestVersion,
  initialSteps,
  catalogSteps,
  useDeps,
  plantOptions,
  supplierOptions,
  customerOptions,
}: {
  mode: "create" | "new-version";
  productId: number;
  productLabel: string;
  /** new-version 時のみ。 */
  routeId?: number;
  routeName?: string;
  latestVersion?: number;
  /** new-version 時のプリフィル（最新バージョンのスナップショット）。 */
  initialSteps?: RouteStepSnapshot[];
  catalogSteps: CatalogStep[];
  useDeps: UseDep[];
  plantOptions: Option[];
  supplierOptions: Option[];
  /** create 時のみ: 対象顧客の選択肢（未指定 = 汎用のみ）。 */
  customerOptions?: Option[];
}) {
  const tr = useTr();
  const router = useRouter();
  const isMobile = useIsMobile();
  const [isPending, startTransition] = useTransition();
  const [customerBpId, setCustomerBpId] = useState<string | null>(null);
  const backPath = `/master/products/${productId}?tab=routes`;

  // 工程リストは製造分（MANUFACTURE）の構成 — 在庫分専用の
  // 製品出し（在庫）は選択肢に出さない。
  const manufactureCatalog = useMemo(
    () => catalogSteps.filter((c) => c.code !== STOCK_ISSUE_STEP_CODE),
    [catalogSteps],
  );

  const knownIds = useMemo(
    () => new Set(manufactureCatalog.map((s) => s.id)),
    [manufactureCatalog],
  );
  const usableInitial = useMemo(
    () => (initialSteps ?? []).filter((s) => knownIds.has(s.processStepId)),
    [initialSteps, knownIds],
  );
  const droppedCount = (initialSteps?.length ?? 0) - usableInitial.length;

  const [nameJa, setNameJa] = useState("");
  const [nameEn, setNameEn] = useState("");
  const [notes, setNotes] = useState("");
  const [selected, setSelected] = useState<number[]>(
    usableInitial.map((s) => s.processStepId),
  );
  const [locations, setLocations] = useState<Record<number, StepLocation>>(
    () => {
      const map: Record<number, StepLocation> = {};
      for (const s of usableInitial) {
        map[s.processStepId] = {
          executionLocation: s.executionLocation,
          plantId: s.plantId != null ? String(s.plantId) : null,
          supplierBpId: s.supplierBpId,
          workHours: s.workHours,
          lotInputMode: s.lotInputMode ?? null,
        };
      }
      return map;
    },
  );
  const [nameError, setNameError] = useState<string | null>(null);
  const [stepsError, setStepsError] = useState<string | null>(null);

  const blockers = useMemo(
    () =>
      validateComposition(selected, useDeps, manufactureCatalog).filter(
        isBlockingIssue,
      ),
    [selected, useDeps, manufactureCatalog],
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setNameError(null);
    setStepsError(null);
    if (mode === "create" && !nameJa.trim()) {
      setNameError(tr("ルート名（日本語）を入力してください"));
      return;
    }
    if (selected.length === 0) {
      setStepsError(tr("工程を1つ以上選択してください"));
      return;
    }
    if (blockers.length > 0) {
      notifications.show({
        title: tr("工程構成にエラーがあります"),
        message: tr("赤色の警告を解消してから保存してください"),
        color: "red",
      });
      return;
    }
    const steps = toStepSnapshots(selected, locations, manufactureCatalog).map(
      (s) => ({
        processStepId: s.processStepId,
        executionLocation: s.executionLocation,
        plantId: s.plantId,
        supplierBpId: s.supplierBpId,
        workHours: s.workHours,
        lotInputMode: s.lotInputMode ?? null,
      }),
    );
    startTransition(async () => {
      const result =
        mode === "create"
          ? await createProductRoute(productId, {
              nameJa,
              nameEn,
              customerBpId,
              notes,
              steps,
            })
          : await createProductRouteVersion(routeId as number, {
              notes,
              steps,
            });
      if (result.ok) {
        notifications.show({
          title: tr("保存しました"),
          message:
            mode === "create"
              ? tr("工程ルートを作成しました（v1）")
              : tr("新バージョンを作成しました"),
          color: "green",
        });
        router.push(backPath);
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
        tr("マスタ"),
        { label: "製品", href: "/master/products" },
        { label: productLabel, href: backPath },
        mode === "create" ? "工程ルート新規作成" : tr("新バージョン作成"),
      ]}
      isDirty={selected.length > 0 || !!nameJa}
      isPending={isPending}
      onCancel={() => router.push(backPath)}
      onSubmit={handleSubmit}
      title={
        mode === "create"
          ? tr("工程ルート 新規作成")
          : `工程ルート「${routeName}」新バージョン作成（v${(latestVersion ?? 0) + 1}）`
      }
    >
      <FormSection required title={tr("基本情報")}>
        <SimpleGrid cols={isMobile ? 1 : 2} spacing="sm">
          {mode === "create" ? (
            <>
              <TextInput
                error={nameError}
                label={tr("ルート名（日本語）")}
                onChange={(e2) => setNameJa(e2.currentTarget.value)}
                placeholder={tr("例: 標準工程")}
                value={nameJa}
                withAsterisk
              />
              <TextInput
                label={tr("ルート名（英語）")}
                onChange={(e2) => setNameEn(e2.currentTarget.value)}
                value={nameEn}
              />
              <Select
                clearable
                data={customerOptions ?? []}
                description={tr(
                  tr(
                    tr(
                      "指定すると同じ顧客×製品の指示書で優先選択されます（空 = 汎用）",
                    ),
                  ),
                )}
                label={tr("対象顧客")}
                onChange={setCustomerBpId}
                placeholder={tr("汎用（全顧客）")}
                searchable
                value={customerBpId}
              />
            </>
          ) : (
            <TextInput
              disabled
              label={tr("ルート名")}
              value={routeName ?? ""}
            />
          )}
          <TextInput
            description={
              mode === "new-version"
                ? tr("変更内容のメモ（バージョン履歴に表示）")
                : undefined
            }
            label={tr("備考")}
            onChange={(e2) => setNotes(e2.currentTarget.value)}
            value={notes}
          />
        </SimpleGrid>
        {droppedCount > 0 && (
          <Alert
            color="yellow"
            icon={<IconAlertTriangle size={16} />}
            mt="sm"
            p="xs"
            variant="light"
          >
            最新バージョンに現在無効な工程が {droppedCount}{" "}
            件含まれていたため除外しました
          </Alert>
        )}
      </FormSection>

      <ProcessListEditor
        catalogSteps={manufactureCatalog}
        error={stepsError}
        locations={locations}
        onLocationsChange={setLocations}
        onSelectedChange={setSelected}
        plantOptions={plantOptions}
        selected={selected}
        supplierOptions={supplierOptions}
        useDeps={useDeps}
      />
    </FormShell>
  );
}
