"use client";

/**
 * RouteEditorForm — 製品工程ルートの新規作成 / 新バージョン作成フォーム。
 *
 * 工程構成エディタ（ProcessListEditor）を指示書ビルダーと共用する。
 * mode = "create": ルート名 + 構成 → createProductRoute（v1）。
 * mode = "new-version": 名前は読み取り表示、最新バージョンをプリフィルして
 * createProductRouteVersion（同一構成は server が拒否）。
 */

import { Alert, SimpleGrid, TextInput } from "@mantine/core";
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
import { useIsMobile } from "@/hooks/useViewport";
import type { RouteStepSnapshot } from "@/lib/product-routes-core";
import type { CatalogStep, UseDep } from "@/lib/workflow-core";
import { isBlockingIssue, validateComposition } from "@/lib/workflow-core";

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
  factoryOptions,
  supplierOptions,
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
  factoryOptions: Option[];
  supplierOptions: Option[];
}) {
  const router = useRouter();
  const isMobile = useIsMobile();
  const [isPending, startTransition] = useTransition();
  const backPath = `/master/products/${productId}?tab=routes`;

  const knownIds = useMemo(
    () => new Set(catalogSteps.map((s) => s.id)),
    [catalogSteps],
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
          factoryId: s.factoryId != null ? String(s.factoryId) : null,
          supplierBpId: s.supplierBpId,
        };
      }
      return map;
    },
  );
  const [nameError, setNameError] = useState<string | null>(null);
  const [stepsError, setStepsError] = useState<string | null>(null);

  const blockers = useMemo(
    () => validateComposition(selected, useDeps).filter(isBlockingIssue),
    [selected, useDeps],
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setNameError(null);
    setStepsError(null);
    if (mode === "create" && !nameJa.trim()) {
      setNameError("ルート名（日本語）を入力してください");
      return;
    }
    if (selected.length === 0) {
      setStepsError("工程を1つ以上選択してください");
      return;
    }
    if (blockers.length > 0) {
      notifications.show({
        title: "工程構成にエラーがあります",
        message: "赤色の警告を解消してから保存してください",
        color: "red",
      });
      return;
    }
    const steps = toStepSnapshots(selected, locations, catalogSteps).map(
      (s) => ({
        processStepId: s.processStepId,
        executionLocation: s.executionLocation,
        factoryId: s.factoryId,
        supplierBpId: s.supplierBpId,
      }),
    );
    startTransition(async () => {
      const result =
        mode === "create"
          ? await createProductRoute(productId, {
              nameJa,
              nameEn,
              notes,
              steps,
            })
          : await createProductRouteVersion(routeId as number, {
              notes,
              steps,
            });
      if (result.ok) {
        notifications.show({
          title: "保存しました",
          message:
            mode === "create"
              ? "工程ルートを作成しました（v1）"
              : "新バージョンを作成しました",
          color: "green",
        });
        router.push(backPath);
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
        "マスタ",
        { label: "製品", href: "/master/products" },
        { label: productLabel, href: backPath },
        mode === "create" ? "工程ルート新規作成" : "新バージョン作成",
      ]}
      isDirty={selected.length > 0 || !!nameJa}
      isPending={isPending}
      onCancel={() => router.push(backPath)}
      onSubmit={handleSubmit}
      title={
        mode === "create"
          ? "工程ルート 新規作成"
          : `工程ルート「${routeName}」新バージョン作成（v${(latestVersion ?? 0) + 1}）`
      }
    >
      <FormSection required title="基本情報">
        <SimpleGrid cols={isMobile ? 1 : 2} spacing="sm">
          {mode === "create" ? (
            <>
              <TextInput
                error={nameError}
                label="ルート名（日本語）"
                onChange={(e2) => setNameJa(e2.currentTarget.value)}
                placeholder="例: 標準工程"
                value={nameJa}
                withAsterisk
              />
              <TextInput
                label="ルート名（英語）"
                onChange={(e2) => setNameEn(e2.currentTarget.value)}
                value={nameEn}
              />
            </>
          ) : (
            <TextInput disabled label="ルート名" value={routeName ?? ""} />
          )}
          <TextInput
            description={
              mode === "new-version"
                ? "変更内容のメモ（バージョン履歴に表示）"
                : undefined
            }
            label="備考"
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
        catalogSteps={catalogSteps}
        error={stepsError}
        factoryOptions={factoryOptions}
        locations={locations}
        onLocationsChange={setLocations}
        onSelectedChange={setSelected}
        selected={selected}
        supplierOptions={supplierOptions}
        useDeps={useDeps}
      />
    </FormShell>
  );
}
