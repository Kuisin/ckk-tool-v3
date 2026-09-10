"use client";

/**
 * RouteEditorForm — 工程リストの新規作成 / 新バージョン作成フォーム。
 *
 * 工程構成エディタ（ProcessListEditor）を指示書ビルダーと共用する。
 * mode = "create": ルート名 + 構成 → createProductRoute / createPrepRoute（v1）。
 * mode = "new-version": 名前は読み取り表示、最新バージョンをプリフィルして
 * createProductRouteVersion（同一構成は server が拒否）。
 *
 * kind で 2 つの顔を持つ（§7 — 工程リストは 準備 / 製造 の 2 本）:
 *   MANUFACTURING  製品 × 受注元 の製造工程リスト。準備工程はカタログから外し、
 *                  移行前の版に混ざっていた準備工程は「準備工程リストへ移った」
 *                  と知らせて外す。
 *   PREP           共通の準備工程リスト。製品も受注元も持たない。準備工程だけを
 *                  出し、開始工程（〇〇出し・受渡し）がちょうど 1 つ要る。
 * どちらも構成の検証は片方の種別の中だけで行う（compositionIssuesForKind）。
 */

import { Alert, Select, SimpleGrid, TextInput } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconAlertTriangle, IconInfoCircle } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useMemo, useState, useTransition } from "react";
import {
  createPrepRoute,
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
import type {
  CatalogStep,
  ProcessRouteKind,
  UseDep,
} from "@/lib/workflow-core";
import {
  compositionIssuesForKind,
  isBlockingIssue,
  isPrepStep,
  STOCK_ISSUE_STEP_CODE,
  validateComposition,
} from "@/lib/workflow-core";

const PREP_ROUTES_PATH = "/master/process-steps/prep-routes";

export function RouteEditorForm({
  mode,
  kind = "MANUFACTURING",
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
  /** 準備工程リスト（共通）か 製造工程リスト（製品 × 受注元）か。 */
  kind?: ProcessRouteKind;
  /** MANUFACTURING のみ。PREP は製品を持たない。 */
  productId?: number;
  productLabel?: string;
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
  const tr = useTranslations();
  const router = useRouter();
  const isMobile = useIsMobile();
  const [isPending, startTransition] = useTransition();
  const [customerBpId, setCustomerBpId] = useState<string | null>(null);
  const backPath =
    kind === "PREP"
      ? PREP_ROUTES_PATH
      : `/master/products/${productId}?tab=routes`;

  // 種別の中だけを見せる。在庫分専用の 製品出し（在庫）はどちらにも出さない
  // （在庫分の指示書は固定構成で工程リストを使わない）。
  const manufactureCatalog = useMemo(
    () =>
      catalogSteps.filter(
        (c) =>
          c.code !== STOCK_ISSUE_STEP_CODE &&
          (kind === "PREP" ? isPrepStep(c) : !isPrepStep(c)),
      ),
    [catalogSteps, kind],
  );

  const knownIds = useMemo(
    () => new Set(manufactureCatalog.map((s) => s.id)),
    [manufactureCatalog],
  );
  const usableInitial = useMemo(
    () => (initialSteps ?? []).filter((s) => knownIds.has(s.processStepId)),
    [initialSteps, knownIds],
  );
  // 移行前の製造工程リストの版には準備工程が混ざっている。それは「無効」では
  // なく「準備工程リストへ移った」ので、別に数えて別の言葉で知らせる。
  const catalogById = useMemo(
    () => new Map(catalogSteps.map((s) => [s.id, s])),
    [catalogSteps],
  );
  const movedPrepCount = useMemo(
    () =>
      kind === "MANUFACTURING"
        ? (initialSteps ?? []).filter((s) => {
            const c = catalogById.get(s.processStepId);
            return c != null && isPrepStep(c);
          }).length
        : 0,
    [initialSteps, catalogById, kind],
  );
  const droppedCount =
    (initialSteps?.length ?? 0) - usableInitial.length - movedPrepCount;

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
      compositionIssuesForKind(
        validateComposition(selected, useDeps, manufactureCatalog).filter(
          isBlockingIssue,
        ),
        kind,
        manufactureCatalog,
      ),
    [selected, useDeps, manufactureCatalog, kind],
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setNameError(null);
    setStepsError(null);
    if (mode === "create" && !nameJa.trim()) {
      setNameError(tr("master.products.enterTheRouteNameInJapanese"));
      return;
    }
    if (selected.length === 0) {
      setStepsError(tr("master.products.selectAtLeastOneStep"));
      return;
    }
    if (blockers.length > 0) {
      notifications.show({
        title: tr("common.thereIsAnErrorInThe"),
        message: tr("common.clearTheRedWarningsBeforeSaving"),
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
          ? kind === "PREP"
            ? await createPrepRoute({ nameJa, nameEn, notes, steps })
            : await createProductRoute(productId as number, {
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
          title: tr("common.saved2"),
          message:
            mode === "create"
              ? tr("master.products.theProcessRouteWasCreatedV1")
              : tr("common.aNewVersionWasCreated"),
          color: "green",
        });
        router.push(backPath);
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
      breadcrumbs={
        kind === "PREP"
          ? [
              tr("common.masterData"),
              {
                label: tr("common.processSteps"),
                href: "/master/process-steps",
              },
              { label: tr("master.prepRoutes.title"), href: backPath },
              mode === "create"
                ? tr("master.routeEditorForm.newRouteBreadcrumb")
                : tr("master.products.createANewVersion"),
            ]
          : [
              tr("common.masterData"),
              { label: tr("common.products"), href: "/master/products" },
              { label: productLabel ?? "", href: backPath },
              mode === "create"
                ? tr("master.routeEditorForm.newRouteBreadcrumb")
                : tr("master.products.createANewVersion"),
            ]
      }
      isDirty={selected.length > 0 || !!nameJa}
      isPending={isPending}
      onCancel={() => router.push(backPath)}
      onSubmit={handleSubmit}
      title={
        mode === "create"
          ? kind === "PREP"
            ? tr("master.prepRoutes.newPrepRoute")
            : tr("master.products.newProcessRoute")
          : tr("master.routeEditorForm.newVersionTitle", {
              name: routeName ?? "",
              version: (latestVersion ?? 0) + 1,
            })
      }
    >
      <FormSection required title={tr("common.basicInformation")}>
        <SimpleGrid cols={isMobile ? 1 : 2} spacing="sm">
          {mode === "create" ? (
            <>
              <TextInput
                error={nameError}
                label={tr("common.routeNameJapanese")}
                onChange={(e2) => setNameJa(e2.currentTarget.value)}
                placeholder={tr("common.eGStandardRoute")}
                value={nameJa}
                withAsterisk
              />
              <TextInput
                label={tr("common.routeNameEnglish")}
                onChange={(e2) => setNameEn(e2.currentTarget.value)}
                value={nameEn}
              />
              {kind === "MANUFACTURING" && (
                <Select
                  clearable
                  data={customerOptions ?? []}
                  description={tr(
                    "master.products.settingItMakesItPreferredFor",
                  )}
                  label={tr("common.targetCustomer")}
                  onChange={setCustomerBpId}
                  placeholder={tr("common.genericAllCustomers")}
                  searchable
                  value={customerBpId}
                />
              )}
            </>
          ) : (
            <TextInput
              disabled
              label={tr("master.products.routeName")}
              value={routeName ?? ""}
            />
          )}
          <TextInput
            description={
              mode === "new-version"
                ? tr("master.products.aNoteOnWhatChangedShown")
                : undefined
            }
            label={tr("common.notes")}
            onChange={(e2) => setNotes(e2.currentTarget.value)}
            value={notes}
          />
        </SimpleGrid>
        {movedPrepCount > 0 && (
          <Alert
            color="blue"
            icon={<IconInfoCircle size={16} />}
            mt="sm"
            p="xs"
            variant="light"
          >
            {tr("master.routeEditorForm.prepStepsMovedToPrepRoute", {
              count: movedPrepCount,
            })}
          </Alert>
        )}
        {droppedCount > 0 && (
          <Alert
            color="yellow"
            icon={<IconAlertTriangle size={16} />}
            mt="sm"
            p="xs"
            variant="light"
          >
            {tr("master.routeEditorForm.inactiveStepsExcluded", {
              count: droppedCount,
            })}
          </Alert>
        )}
        {kind === "PREP" && (
          <Alert
            color="gray"
            icon={<IconInfoCircle size={16} />}
            mt="sm"
            p="xs"
            variant="light"
          >
            {tr("master.prepRoutes.editorHelp")}
          </Alert>
        )}
      </FormSection>

      <ProcessListEditor
        catalogSteps={manufactureCatalog}
        error={stepsError}
        kind={kind}
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
