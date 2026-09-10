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

/** 新規 / 新バージョン ページへの行き先（製品配下 or 工程マスタ配下）。 */
export interface RoutePanelLinks {
  newRoute: string;
  newVersion: (routeId: number) => string;
}

/** 製品の製造工程リスト（MS24 工程タブ）の行き先。 */
export function productRouteLinks(productId: number): RoutePanelLinks {
  return {
    newRoute: `/master/products/${productId}/routes/new`,
    newVersion: (routeId) =>
      `/master/products/${productId}/routes/${routeId}/new-version`,
  };
}

/** 準備工程リスト（共通 — 工程マスタ MS08 配下）の行き先。 */
export const PREP_ROUTE_LINKS: RoutePanelLinks = {
  newRoute: "/master/process-steps/prep-routes/new",
  newVersion: (routeId) =>
    `/master/process-steps/prep-routes/${routeId}/new-version`,
};

export function ProductRoutesPanel({
  routes,
  links,
  title,
  emptyMessage,
}: {
  routes: RouteView[];
  links: RoutePanelLinks;
  /** 見出し（既定: 工程リスト）。 */
  title?: string;
  emptyMessage?: string;
}) {
  const tr = useTranslations();
  const router = useRouter();

  return (
    <Stack gap="md">
      <Group justify="space-between">
        <Text fw={600} size="sm">
          {title ?? tr("master.products.stepListRoute")}
        </Text>
        <PrimaryButton
          leftSection={<IconPlus size={14} />}
          onClick={() => router.push(links.newRoute)}
        >
          {tr("master.products.newRoute")}
        </PrimaryButton>
      </Group>
      {routes.length === 0 ? (
        <EmptyState
          icon={<IconGitBranch size={24} />}
          message={
            emptyMessage ?? tr("master.products.noStepListIsRegisteredFor")
          }
        />
      ) : (
        routes.map((route) => (
          <RouteCard key={route.id} links={links} route={route} />
        ))
      )}
    </Stack>
  );
}

/**
 * バージョン Select の 1 行 — `v3 · 2026/09/10 13:04`。日付だけだと同じ日に
 * 2 回直したときに見分けが付かないので時刻まで出す。最新には印を付ける —
 * 一覧の先頭が最新とは限らない（Select は開くまで並びが見えない）。
 */
export function RouteVersionOption({
  version,
  createdAt,
  isLatest,
}: {
  version: number;
  createdAt: string;
  isLatest: boolean;
}) {
  const tr = useTranslations();
  const fmt = useFormat();
  return (
    <Group gap="xs" justify="space-between" w="100%" wrap="nowrap">
      <Group gap={6} wrap="nowrap">
        <Text fw={isLatest ? 600 : undefined} size="sm">
          v{version}
        </Text>
        <Text c="dimmed" size="xs">
          {fmt.dateTime(createdAt)}
        </Text>
      </Group>
      {isLatest && (
        <Badge color="blue" size="xs" variant="light">
          {tr("common.latest")}
        </Badge>
      )}
    </Group>
  );
}

/** Select の閉じた状態に出す 1 行ラベル（renderOption は開いたときだけ）。 */
export function routeVersionLabel(
  v: { version: number; createdAt: string },
  isLatest: boolean,
  fmtDateTime: (iso: string) => string,
  latestLabel: string,
): string {
  const base = `v${v.version} · ${fmtDateTime(v.createdAt)}`;
  return isLatest ? `${base} — ${latestLabel}` : base;
}

function RouteCard({
  links,
  route,
}: {
  links: RoutePanelLinks;
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
            {route.kind === "MANUFACTURING" && (
              <Badge
                color={route.customerBpId != null ? "blue" : "gray"}
                variant="light"
              >
                {route.customerName ?? tr("common.generic")}
              </Badge>
            )}
            <ActiveBadge active={route.isActive} />
            <Text c="dimmed" size="xs">
              {route.versions.length} バージョン
            </Text>
          </Group>
          <Group gap="xs" wrap="nowrap">
            <SecondaryButton
              leftSection={<IconPlus size={14} />}
              onClick={() => router.push(links.newVersion(route.id))}
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
              {tr("common.delete")}
            </GhostButton>
          </Group>
        </Group>
        <Group gap="sm">
          <Select
            allowDeselect={false}
            data={route.versions.map((v) => ({
              value: v.id,
              label: routeVersionLabel(
                v,
                v.id === latest?.id,
                fmt.dateTime,
                tr("common.latest"),
              ),
            }))}
            onChange={setVersionId}
            renderOption={({ option }) => {
              const v = route.versions.find((x) => x.id === option.value);
              return v ? (
                <RouteVersionOption
                  createdAt={v.createdAt}
                  isLatest={v.id === latest?.id}
                  version={v.version}
                />
              ) : (
                option.label
              );
            }}
            size="xs"
            value={version?.id ?? null}
            w={300}
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
                <Table.Th>{tr("master.productDetail.routesTab")}</Table.Th>
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
          label={tr("common.enabled")}
          onChange={(e) => setIsActive(e.currentTarget.checked)}
        />
        <Group justify="flex-end">
          <SecondaryButton onClick={onClose}>
            {tr("common.cancel")}
          </SecondaryButton>
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
          message: tr("master.productRoutesPanel.routeDeletedMessage", {
            name: route.name,
          }),
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
          {tr("master.productRoutesPanel.deleteRouteConfirmMessage", {
            name: route.name,
          })}
        </Text>
        <Group justify="flex-end">
          <SecondaryButton onClick={onClose}>
            {tr("common.back2")}
          </SecondaryButton>
          <DangerButton loading={isPending} onClick={submit}>
            {tr("common.delete")}
          </DangerButton>
        </Group>
      </Stack>
    </Modal>
  );
}
