"use client";

/**
 * ProductRoutesPanel — 製品詳細の工程タブ (MS24)。
 *
 * 製品の工程ルート（工程リスト）一覧。ルートごとにバージョン Select（既定 =
 * 最新）でスナップショットの工程を読み取り表示する。ルートの作成・新バージョン
 * 作成は専用ページ、名称変更・有効/無効・削除はモーダルで行う。
 */

import {
  Badge,
  Group,
  Modal,
  Paper,
  Select,
  SimpleGrid,
  Stack,
  Switch,
  Table,
  Text,
  TextInput,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconGitBranch, IconPlus } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import {
  deleteProductRoute,
  updateProductRoute,
} from "@/app/(dashboard)/master/products/route-actions";
import { useFormat } from "@/components/layout/PreferencesProvider";
import { ActiveBadge } from "@/components/ui/ActiveBadge";
import {
  DangerButton,
  GhostButton,
  PrimaryButton,
  SecondaryButton,
} from "@/components/ui/buttons";
import { EmptyState } from "@/components/ui/EmptyState";
import { useIsMobile } from "@/hooks/useViewport";
import { processCategoryLabel } from "@/lib/enum-labels";
import type { RouteView } from "@/lib/product-routes-core";

export function ProductRoutesPanel({
  productId,
  routes,
}: {
  productId: number;
  routes: RouteView[];
}) {
  const tr = useTranslations();
  const router = useRouter();

  return (
    <Stack gap="md">
      <Group justify="space-between">
        <Text fw={600} size="sm">
          {tr("master.products.stepListRoute")}
        </Text>
        <PrimaryButton
          leftSection={<IconPlus size={14} />}
          onClick={() =>
            router.push(`/master/products/${productId}/routes/new`)
          }
        >
          {tr("master.products.newRoute")}
        </PrimaryButton>
      </Group>
      {routes.length === 0 ? (
        <EmptyState
          icon={<IconGitBranch size={24} />}
          message={tr("master.products.noStepListIsRegisteredFor")}
        />
      ) : (
        routes.map((route) => (
          <RouteCard key={route.id} productId={productId} route={route} />
        ))
      )}
    </Stack>
  );
}

function RouteCard({
  productId,
  route,
}: {
  productId: number;
  route: RouteView;
}) {
  const tr = useTranslations();
  const locale = useLocale();
  const fmt = useFormat();
  const router = useRouter();
  const isMobile = useIsMobile();
  const latest = route.versions[0] ?? null;
  const [versionId, setVersionId] = useState<string | null>(latest?.id ?? null);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const version =
    route.versions.find((v) => v.id === versionId) ?? latest ?? null;

  return (
    <Paper p="md" radius="md" withBorder>
      <Stack gap="sm">
        <Group justify="space-between" wrap={isMobile ? "wrap" : "nowrap"}>
          <Group gap="sm" style={{ minWidth: 0 }} wrap="nowrap">
            <Text fw={600} size="sm" truncate>
              {route.name}
            </Text>
            <Badge
              color={route.customerBpId != null ? "blue" : "gray"}
              variant="light"
            >
              {route.customerName ?? tr("common.generic")}
            </Badge>
            <ActiveBadge active={route.isActive} />
            <Text c="dimmed" size="xs">
              {route.versions.length} バージョン
            </Text>
          </Group>
          <Group gap="xs" wrap="nowrap">
            <SecondaryButton
              leftSection={<IconPlus size={14} />}
              onClick={() =>
                router.push(
                  `/master/products/${productId}/routes/${route.id}/new-version`,
                )
              }
              size="xs"
            >
              {tr("master.products.newVersion")}
            </SecondaryButton>
            <GhostButton onClick={() => setEditOpen(true)} size="xs">
              {tr("common.edit2")}
            </GhostButton>
            <GhostButton
              color="red"
              onClick={() => setDeleteOpen(true)}
              size="xs"
            >
              削除
            </GhostButton>
          </Group>
        </Group>
        <Group gap="sm">
          <Select
            allowDeselect={false}
            data={route.versions.map((v) => ({
              value: v.id,
              label: `v${v.version}（${fmt.date(v.createdAt)}）`,
            }))}
            onChange={setVersionId}
            size="xs"
            value={version?.id ?? null}
            w={220}
          />
          {version?.notes && (
            <Text c="dimmed" size="xs">
              {version.notes}
            </Text>
          )}
        </Group>
        {version && (
          <Table striped withTableBorder>
            <Table.Thead>
              <Table.Tr>
                <Table.Th w={40}>#</Table.Th>
                <Table.Th>工程</Table.Th>
                {!isMobile && (
                  <Table.Th w={140}>{tr("common.category")}</Table.Th>
                )}
                <Table.Th w={90}>{tr("common.workHours")}</Table.Th>
                <Table.Th w={isMobile ? 90 : 220}>
                  {tr("common.executionLocation")}
                </Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {version.steps.map((s, i) => (
                <Table.Tr key={s.processStepId}>
                  <Table.Td className="tabular-nums">{i + 1}</Table.Td>
                  <Table.Td>
                    <Text size="sm">{s.name}</Text>
                  </Table.Td>
                  {!isMobile && (
                    <Table.Td>
                      <Text c="dimmed" size="sm">
                        {processCategoryLabel(s.category, locale) ?? s.category}
                      </Text>
                    </Table.Td>
                  )}
                  <Table.Td>
                    <Text c="dimmed" className="tabular-nums" size="sm">
                      {s.workHours != null ? `${s.workHours} h` : "—"}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Group gap={6} wrap="nowrap">
                      <Badge
                        color={
                          s.executionLocation === "OUTSOURCE"
                            ? "orange"
                            : "gray"
                        }
                        size="xs"
                        variant="outline"
                      >
                        {s.executionLocation === "OUTSOURCE"
                          ? tr("common.outsourced")
                          : tr("common.inHouse")}
                      </Badge>
                      {!isMobile && (
                        <Text c="dimmed" size="xs" truncate>
                          {s.executionLocation === "OUTSOURCE"
                            ? (s.supplierName ?? "")
                            : (s.plantName ?? "")}
                        </Text>
                      )}
                    </Group>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        )}
      </Stack>
      <EditRouteModal
        onClose={() => setEditOpen(false)}
        opened={editOpen}
        route={route}
      />
      <DeleteRouteModal
        onClose={() => setDeleteOpen(false)}
        opened={deleteOpen}
        route={route}
      />
    </Paper>
  );
}

function EditRouteModal({
  route,
  opened,
  onClose,
}: {
  route: RouteView;
  opened: boolean;
  onClose: () => void;
}) {
  const tr = useTranslations();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [nameJa, setNameJa] = useState(route.name);
  const [nameEn, setNameEn] = useState(
    route.nameEn === route.name ? "" : route.nameEn,
  );
  const [isActive, setIsActive] = useState(route.isActive);

  const submit = () => {
    startTransition(async () => {
      const result = await updateProductRoute(route.id, {
        nameJa,
        nameEn,
        isActive,
        notes: route.notes ?? "",
      });
      if (result.ok) {
        notifications.show({
          title: tr("common.saved2"),
          message: tr("master.products.theProcessRouteWasUpdated"),
          color: "green",
        });
        onClose();
        router.refresh();
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
    <Modal
      onClose={onClose}
      opened={opened}
      title={tr("master.products.editTheProcessRoute")}
    >
      <Stack gap="sm">
        <SimpleGrid cols={2} spacing="sm">
          <TextInput
            label={tr("common.routeNameJapanese")}
            onChange={(e) => setNameJa(e.currentTarget.value)}
            value={nameJa}
            withAsterisk
          />
          <TextInput
            label={tr("common.routeNameEnglish")}
            onChange={(e) => setNameEn(e.currentTarget.value)}
            value={nameEn}
          />
        </SimpleGrid>
        <Switch
          checked={isActive}
          label="有効"
          onChange={(e) => setIsActive(e.currentTarget.checked)}
        />
        <Group justify="flex-end">
          <SecondaryButton onClick={onClose}>キャンセル</SecondaryButton>
          <PrimaryButton loading={isPending} onClick={submit}>
            {tr("common.save2")}
          </PrimaryButton>
        </Group>
      </Stack>
    </Modal>
  );
}

function DeleteRouteModal({
  route,
  opened,
  onClose,
}: {
  route: RouteView;
  opened: boolean;
  onClose: () => void;
}) {
  const tr = useTranslations();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const submit = () => {
    startTransition(async () => {
      const result = await deleteProductRoute(route.id);
      if (result.ok) {
        notifications.show({
          title: tr("common.deleted"),
          message: `工程ルート「${route.name}」を削除しました`,
          color: "green",
        });
        onClose();
        router.refresh();
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
    <Modal
      onClose={onClose}
      opened={opened}
      title={tr("common.confirmDeletion")}
    >
      <Stack gap="sm">
        <Text size="sm">
          工程ルート「{route.name}」を全バージョンごと削除します。
          この操作は取り消せません。
        </Text>
        <Group justify="flex-end">
          <SecondaryButton onClick={onClose}>
            {tr("common.back2")}
          </SecondaryButton>
          <DangerButton loading={isPending} onClick={submit}>
            削除
          </DangerButton>
        </Group>
      </Stack>
    </Modal>
  );
}
