"use client";

/**
 * WorkOrderStepsPanel — 工程ワークフロー表示パネル (_specs/design.md §12.2)。
 *
 * デスクトップ（lg 以上）は 2 ペイン: 左 = 工程リスト（分岐系列は分岐元
 * カード直下のネストカード）、右 = 縦型フロー図（WorkflowGraph、sticky）。
 * モバイル/狭幅はリストのみ + フロー図はトグルで折りたたみ。フロー図の
 * ノードクリックでリスト側のカードを選択・スクロール同期する。
 *
 * 分岐系列グループには 分岐数量 / 合流先 を表示し、全工程が未着手
 * （PENDING）の間は削除できる（removeBranch — ConfirmModal + 監査記録）。
 * 指示書が承認済み/進行中のときは各カードに開始/実行の deep link を出し、
 * 完了工程（分岐可能数量が残るもの）からは AddBranchModal で分岐を追加できる。
 */

import {
  ActionIcon,
  Anchor,
  Badge,
  Box,
  Collapse,
  Grid,
  Group,
  Paper,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconArrowsSplit, IconSitemap, IconTrash } from "@tabler/icons-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  type ReactNode,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { removeBranch } from "@/app/(dashboard)/production/work-orders/[id]/steps/[stepId]/actions";
import { SecondaryButton } from "@/components/ui/buttons";
import { openConfirm } from "@/components/ui/modals";
import {
  branchableQuantity,
  isOffMainline,
  type StepLinkState,
  type StepState,
  type WorkflowCtx,
} from "@/lib/workflow-core";
import { AddBranchModal } from "./AddBranchModal";
import { StepCard } from "./StepCard";
import { WorkflowGraph } from "./WorkflowGraph";
import type { StepLinkView, WorkOrderStepView } from "./work-orders/model";

const BASE_PATH = "/production/work-orders";

/** 分岐系列（分岐元カード直下にネスト表示する単位）。 */
interface BranchGroup {
  sourceId: string;
  headId: string;
  routedQuantity: number;
  mergeTargetId: string | null;
  steps: WorkOrderStepView[];
  /** 全工程が PENDING（= 削除可能）。 */
  deletable: boolean;
}

export function WorkOrderStepsPanel({
  steps,
  stepLinks = [],
  workOrderNumber,
  workOrderStatus,
  catalogOptions = [],
}: {
  steps: WorkOrderStepView[];
  stepLinks?: StepLinkView[];
  workOrderNumber?: number;
  workOrderStatus?: string;
  /** 分岐追加モーダル用の工程カタログ options。 */
  catalogOptions?: { value: string; label: string }[];
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [branchSource, setBranchSource] = useState<WorkOrderStepView | null>(
    null,
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [graphOpen, setGraphOpen] = useState(false);
  const cardRefs = useRef(new Map<string, HTMLDivElement>());

  // 工程実行は承認済み/進行中の指示書のみ（design.md §12.3）
  const isExecutable =
    workOrderNumber != null &&
    (workOrderStatus === "APPROVED" || workOrderStatus === "IN_PROGRESS");

  // engine 形式（オフメインライン判定・分岐可能数量の計算用）
  const ctx = useMemo<WorkflowCtx>(() => {
    const engineSteps: StepState[] = steps.map((s) => ({
      id: s.id,
      processStepId: s.processStepId,
      status: s.status as StepState["status"],
      sortOrder: s.sortOrder,
      inputQuantity: s.inputQuantity,
      outputSuccess: s.outputSuccessQuantity,
      defectSemiFinished: s.outputDefectSemiFinished,
      defectScrap: s.outputDefectScrap,
      defectRework: s.outputDefectRework,
      sessionLockedBy: null,
    }));
    const engineLinks: StepLinkState[] = stepLinks.map((l) => ({
      sourceStepId: l.sourceStepId,
      targetStepId: l.targetStepId,
      routedQuantity: l.routedQuantity,
    }));
    return {
      plannedQuantity: 0,
      steps: engineSteps,
      links: engineLinks,
      execDeps: [],
    };
  }, [steps, stepLinks]);

  // 分岐系列のグルーピング（メインライン / 分岐元ごとのネスト）
  const { mainline, groupsBySource } = useMemo(() => {
    const stepById = new Map(steps.map((s) => [s.id, s]));
    const ordered = [...steps].sort(
      (a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id),
    );
    const offIds = new Set(
      ordered.filter((s) => isOffMainline(s.id, ctx)).map((s) => s.id),
    );
    const lower = (aId: string, b: WorkOrderStepView) => {
      const a = stepById.get(aId);
      if (!a) return false;
      return (
        a.sortOrder < b.sortOrder ||
        (a.sortOrder === b.sortOrder && a.id.localeCompare(b.id) < 0)
      );
    };

    const groups: BranchGroup[] = [];
    const assigned = new Set<string>();
    for (const s of ordered) {
      if (!offIds.has(s.id) || assigned.has(s.id)) continue;
      const headLink = stepLinks.find(
        (l) => l.targetStepId === s.id && lower(l.sourceStepId, s),
      );
      const series: WorkOrderStepView[] = [];
      let mergeTargetId: string | null = null;
      let cur: WorkOrderStepView | undefined = s;
      while (cur && !assigned.has(cur.id)) {
        assigned.add(cur.id);
        series.push(cur);
        const currentId = cur.id;
        const outs = stepLinks.filter((l) => l.sourceStepId === currentId);
        // チェーン継続は動的エッジ（0）優先。メインライン到達 = 合流先
        const orderedOuts = [
          ...outs.filter((l) => l.routedQuantity <= 0),
          ...outs.filter((l) => l.routedQuantity > 0),
        ];
        cur = undefined;
        for (const l of orderedOuts) {
          if (!offIds.has(l.targetStepId)) {
            mergeTargetId = l.targetStepId;
            continue;
          }
          if (!assigned.has(l.targetStepId)) {
            cur = stepById.get(l.targetStepId);
            break;
          }
        }
      }
      groups.push({
        sourceId: headLink?.sourceStepId ?? "",
        headId: s.id,
        routedQuantity: headLink?.routedQuantity ?? 0,
        mergeTargetId,
        steps: series,
        deletable: series.every((x) => x.status === "PENDING"),
      });
    }
    const bySource = new Map<string, BranchGroup[]>();
    for (const g of groups) {
      const list = bySource.get(g.sourceId) ?? [];
      list.push(g);
      bySource.set(g.sourceId, list);
    }
    return {
      mainline: ordered.filter((s) => !offIds.has(s.id)),
      groupsBySource: bySource,
    };
  }, [steps, stepLinks, ctx]);

  const stepName = (id: string | null) =>
    id == null ? null : (steps.find((s) => s.id === id)?.name ?? null);

  const handleSelect = (id: string) => {
    setSelectedId(id);
    cardRefs.current
      .get(id)
      ?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  };

  const handleDeleteBranch = (group: BranchGroup) => {
    if (workOrderNumber == null) return;
    openConfirm({
      title: "分岐の削除",
      message: `分岐系列（${group.steps.map((s) => s.name).join(" → ")}）を削除します。この操作は取り消せません。`,
      confirmLabel: "削除",
      onConfirm: () =>
        startTransition(async () => {
          const result = await removeBranch({
            workOrderNumber,
            headStepId: group.headId,
          });
          if (result.ok) {
            notifications.show({
              title: "分岐を削除しました",
              message: `${group.steps.length} 工程を削除`,
              color: "green",
            });
            router.refresh();
          } else {
            notifications.show({
              title: "エラー",
              message: result.errors?.join(" / ") ?? "分岐の削除に失敗しました",
              color: "red",
            });
          }
        }),
    });
  };

  const renderCard = (s: WorkOrderStepView) => {
    const branchable = branchableQuantity(s.id, ctx);
    return (
      <StepCard
        executeHref={
          isExecutable
            ? `${BASE_PATH}/${workOrderNumber}/steps/${s.id}`
            : undefined
        }
        onAddBranch={
          isExecutable &&
          s.status === "COMPLETED" &&
          catalogOptions.length > 0 &&
          (branchable ?? 0) > 0
            ? () => setBranchSource(s)
            : undefined
        }
        selected={selectedId === s.id}
        step={s}
      />
    );
  };

  const renderGroup = (group: BranchGroup) => {
    const mergeName = stepName(group.mergeTargetId);
    return (
      <Paper
        key={group.headId}
        ml="md"
        p="xs"
        radius="sm"
        style={{ borderLeft: "3px solid var(--mantine-color-orange-5)" }}
        withBorder
      >
        <Group justify="space-between" wrap="nowrap">
          <Group gap={6} wrap="wrap">
            <IconArrowsSplit color="var(--mantine-color-orange-6)" size={14} />
            <Text fw={600} size="xs">
              分岐系列
            </Text>
            <Badge color="orange" size="xs" variant="light">
              数量 {group.routedQuantity}
            </Badge>
            {mergeName && (
              <Badge color="gray" size="xs" variant="light">
                合流 → {mergeName}
              </Badge>
            )}
          </Group>
          {group.deletable && isExecutable && (
            <ActionIcon
              aria-label="分岐を削除"
              color="red"
              onClick={() => handleDeleteBranch(group)}
              size="sm"
              variant="subtle"
            >
              <IconTrash size={14} />
            </ActionIcon>
          )}
        </Group>
        <Stack gap="xs" mt="xs">
          {group.steps.map((s) => renderStep(s))}
        </Stack>
      </Paper>
    );
  };

  const renderStep = (s: WorkOrderStepView): ReactNode => (
    <Stack gap="xs" key={s.id}>
      <Box
        ref={(el: HTMLDivElement | null) => {
          if (el) cardRefs.current.set(s.id, el);
          else cardRefs.current.delete(s.id);
        }}
      >
        {renderCard(s)}
      </Box>
      {(groupsBySource.get(s.id) ?? []).map((g) => renderGroup(g))}
    </Stack>
  );

  const graph = (maxHeight?: number) => (
    <WorkflowGraph
      links={stepLinks}
      maxHeight={maxHeight}
      onSelectStep={handleSelect}
      selectedStepId={selectedId}
      steps={steps}
    />
  );

  return (
    <Paper p="md" radius="md" withBorder>
      <Group justify="space-between" mb="sm" wrap="nowrap">
        <Title order={5}>工程ワークフロー</Title>
        {isExecutable && steps.length > 0 ? (
          <Anchor
            component={Link}
            href={`${BASE_PATH}/${workOrderNumber}/steps`}
            size="xs"
          >
            工程実行ビューを開く
          </Anchor>
        ) : (
          steps.length > 0 && (
            <Text c="dimmed" size="xs">
              工程実行は指示書の承認後に可能になります
            </Text>
          )
        )}
      </Group>

      {steps.length === 0 ? (
        <Text c="dimmed" size="sm">
          工程がありません
        </Text>
      ) : (
        <Grid gap="md">
          <Grid.Col span={{ base: 12, lg: 7 }}>
            {/* 狭幅: フロー図はトグルで折りたたみ */}
            <Box hiddenFrom="lg" mb="sm">
              <SecondaryButton
                fullWidth
                leftSection={<IconSitemap size={14} />}
                onClick={() => setGraphOpen((o) => !o)}
              >
                {graphOpen ? "フロー図を隠す" : "フロー図を表示"}
              </SecondaryButton>
              <Collapse expanded={graphOpen}>
                <Box mt="sm">{graph(360)}</Box>
              </Collapse>
            </Box>
            <Stack gap="xs">{mainline.map((s) => renderStep(s))}</Stack>
          </Grid.Col>
          <Grid.Col span={{ base: 12, lg: 5 }} visibleFrom="lg">
            <Box style={{ position: "sticky", top: 76 }}>
              <Paper p="xs" radius="sm" withBorder>
                {graph(560)}
              </Paper>
            </Box>
          </Grid.Col>
        </Grid>
      )}

      {workOrderNumber != null && (
        <AddBranchModal
          catalogOptions={catalogOptions}
          maxQuantity={
            branchSource ? branchableQuantity(branchSource.id, ctx) : null
          }
          mergeTargets={steps.filter(
            (s) => s.status === "PENDING" && !isOffMainline(s.id, ctx),
          )}
          onClose={() => setBranchSource(null)}
          opened={branchSource != null}
          sourceStep={branchSource}
          workOrderNumber={workOrderNumber}
        />
      )}
    </Paper>
  );
}
