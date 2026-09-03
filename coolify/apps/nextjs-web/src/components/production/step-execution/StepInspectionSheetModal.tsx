"use client";

/**
 * StepInspectionSheetModal — 検査表（work_order_step_inspection_templates）の
 * 割当を、工程実行画面（design.md §12.3）専用のポップアップで見る/編集する。
 *
 * 常に**閲覧モードで開く**（design.md §10.10 の約束と同じ形をポップアップに
 * 適用したもの）。編集は「編集」を押してから始まり、下書きは MultiSelect の
 * ローカル state に留めて **保存を押すまでサーバーへ送らない**。キャンセル /
 * 閉じる（×・背景クリック）は下書きを捨てて閲覧モードへ戻すだけで、モーダル
 * 自体は保存成功時のみユーザーの操作で閉じる。
 */

import { Badge, Group, List, MultiSelect, Text } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { updateStepInspectionTemplates } from "@/app/(dashboard)/production/work-orders/[id]/steps/[stepId]/actions";
import { GhostButton } from "@/components/ui/buttons";
import { ModalShell } from "@/components/ui/modals";
import type { SelectOption } from "./model";

interface AssignedTemplate {
  id: number;
  code: string;
  name: string;
}

export function StepInspectionSheetModal({
  workOrderNumber,
  stepId,
  stepName,
  assigned,
  options,
  canEdit,
}: {
  workOrderNumber: number;
  stepId: string;
  stepName: string;
  assigned: AssignedTemplate[];
  options: SelectOption[];
  canEdit: boolean;
}) {
  const tr = useTranslations();
  const router = useRouter();
  const [opened, setOpened] = useState(false);
  const [editing, setEditing] = useState(false);
  const [selected, setSelected] = useState<string[]>(
    assigned.map((a) => String(a.id)),
  );
  const [isPending, startTransition] = useTransition();

  const assignedIds = assigned.map((a) => String(a.id));

  const open = () => {
    setSelected(assignedIds);
    setEditing(false);
    setOpened(true);
  };

  // 編集中の × / 背景クリック / キャンセルは下書きを捨てて閲覧モードへ戻す
  // だけ — モーダル自体を閉じない。閲覧モードでは通常どおり閉じる。
  const handleClose = () => {
    if (editing) {
      setSelected(assignedIds);
      setEditing(false);
      return;
    }
    setOpened(false);
  };

  const handleConfirm = () => {
    if (!editing) {
      setEditing(true);
      return;
    }
    startTransition(async () => {
      const result = await updateStepInspectionTemplates(
        workOrderNumber,
        stepId,
        selected.map(Number),
      );
      if (result.ok) {
        notifications.show({
          title: tr("common.saved"),
          message: stepName,
          color: "green",
        });
        setEditing(false);
        router.refresh();
      } else {
        notifications.show({
          title: tr("common.error2"),
          message:
            result.errors?.join(" / ") ??
            tr("production.stepExecutionActions.couldNotSaveInspectionSheets"),
          color: "red",
        });
      }
    });
  };

  return (
    <>
      <Group gap="xs" wrap="nowrap">
        <Text fw={600} size="sm">
          {tr("common.inspectionSheet")}
        </Text>
        {assigned.length > 0 ? (
          <Group gap={4}>
            {assigned.map((a) => (
              <Badge key={a.id} size="sm" variant="light">
                {a.code}
              </Badge>
            ))}
          </Group>
        ) : (
          <Text c="dimmed" size="xs">
            {tr("production.stepExecutionView.noInspectionSheetAssigned")}
          </Text>
        )}
        <GhostButton onClick={open}>
          {tr("production.stepExecutionView.viewInspectionSheet")}
        </GhostButton>
      </Group>
      <ModalShell
        cancelLabel={editing ? tr("common.cancel") : tr("common.close")}
        confirmLabel={editing ? tr("common.save") : tr("common.edit")}
        loading={isPending}
        onClose={handleClose}
        onConfirm={canEdit ? handleConfirm : undefined}
        opened={opened}
        title={`${tr("common.inspectionSheet")} — ${stepName}`}
      >
        {editing ? (
          <MultiSelect
            clearable
            data={options}
            label={tr("common.inspectionSheet")}
            onChange={setSelected}
            searchable
            value={selected}
          />
        ) : assigned.length > 0 ? (
          <List size="sm" spacing="xs">
            {assigned.map((a) => (
              <List.Item key={a.id}>
                {a.code} {a.name}
              </List.Item>
            ))}
          </List>
        ) : (
          <Text c="dimmed" size="sm">
            {tr("production.stepExecutionView.noInspectionSheetAssigned")}
          </Text>
        )}
      </ModalShell>
    </>
  );
}
