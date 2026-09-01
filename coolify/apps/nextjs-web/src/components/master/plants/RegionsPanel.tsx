"use client";

/**
 * RegionsPanel.tsx — 地域マスタ（/master/plants/regions）。
 *
 * 地域 = REGION スコープ権限の実体（plants.region_id が参照）。拠点一覧から
 * リンクされるサブページで、一覧 + モーダルでの追加・編集を 1 画面で行う。
 * 削除は拠点未参照の地域のみ（サーバー側で count ガード）。
 */

import { Group, Stack, Table, Text, TextInput } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconCircleMinus, IconEdit, IconTrash } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useState, useTransition } from "react";
import {
  createRegion,
  deleteRegion,
  setRegionActive,
  updateRegion,
} from "@/app/(dashboard)/master/plants/actions";
import { ActiveBadge } from "@/components/ui/ActiveBadge";
import { CreateButton, GhostButton } from "@/components/ui/buttons";
import { DocNumber } from "@/components/ui/DocNumber";
import {
  FormModal,
  type ModalBaseProps,
  openConfirm,
} from "@/components/ui/modals";
import { ListShell, LocalizedTextInput } from "@/components/ui/shells";
import type { Tr } from "@/lib/i18n";

export interface RegionRow {
  id: number;
  code: string;
  nameJa: string;
  nameEn: string;
  /** 日本語以外の翻訳（LocalizedTextInput の多言語ポップアップ初期値）。 */
  nameTranslations: Record<string, string>;
  plantCount: number;
  isActive: boolean;
}

// フックを使えない素の関数なので、解決済みの `tr` を引数で受ける
// （lib/format.ts の Formatters と同じ約束）。
function notifyResult(
  tr: Tr,
  router: ReturnType<typeof useRouter>,
  result: { ok: boolean; error?: string },
  message: string,
  onOk?: () => void,
) {
  if (result.ok) {
    notifications.show({ title: tr("common.saved2"), message, color: "green" });
    router.refresh();
    onOk?.();
  } else {
    notifications.show({
      title: tr("common.error2"),
      message: result.error ?? tr("common.failed"),
      color: "red",
    });
  }
}

function RegionModal({
  opened,
  onClose,
  region,
}: ModalBaseProps & { region: RegionRow | null }) {
  const tr = useTranslations();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const isEdit = !!region;
  const [code, setCode] = useState("");
  const [nameJa, setNameJa] = useState("");
  const [nameTranslations, setNameTranslations] = useState<
    Record<string, string>
  >({});

  useEffect(() => {
    if (!opened) return;
    setCode(region?.code ?? "");
    setNameJa(region?.nameJa ?? "");
    setNameTranslations(region?.nameTranslations ?? {});
  }, [opened, region]);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    startTransition(async () => {
      const input = { code, nameJa, nameTranslations, isActive: true };
      const result = isEdit
        ? await updateRegion(region.id, { ...input, isActive: region.isActive })
        : await createRegion(input);
      notifyResult(
        tr,
        router,
        result,
        isEdit ? "地域を更新しました" : tr("master.plants.theRegionWasAdded"),
        onClose,
      );
    });
  };

  return (
    <FormModal
      loading={isPending}
      onClose={onClose}
      onSubmit={handleSubmit}
      opened={opened}
      size="md"
      submitLabel={isEdit ? "保存" : tr("common.create2")}
      title={isEdit ? "地域の編集" : tr("master.plants.addARegion")}
    >
      <Stack gap="sm">
        <TextInput
          description={
            isEdit
              ? tr("master.plants.itCannotBeChangedBecauseRegion")
              : undefined
          }
          disabled={isEdit}
          label="コード"
          onChange={(e) => setCode(e.currentTarget.value)}
          placeholder={tr("master.plants.eGJp")}
          value={code}
          withAsterisk
        />
        <LocalizedTextInput
          jaProps={{
            value: nameJa,
            onChange: (e) => setNameJa(e.currentTarget.value),
          }}
          label={tr("common.name2")}
          placeholder={tr("master.plants.eGJapan")}
          required
          translationsProps={{
            value: nameTranslations,
            onChange: setNameTranslations,
          }}
        />
      </Stack>
    </FormModal>
  );
}

export function RegionsPanel({ rows }: { rows: RegionRow[] }) {
  const tr = useTranslations();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [modal, setModal] = useState<{ region: RegionRow | null } | null>(null);

  const handleToggle = (row: RegionRow) => {
    startTransition(async () => {
      const result = await setRegionActive(row.id, !row.isActive);
      notifyResult(
        tr,
        router,
        result,
        row.isActive
          ? "地域を無効化しました"
          : tr("master.plants.theRegionWasEnabled"),
      );
    });
  };

  const handleDelete = (row: RegionRow) => {
    openConfirm({
      title: tr("master.plants.deleteTheRegion"),
      message: `地域「${row.code} ${row.nameJa}」を削除します。この操作は取り消せません。`,
      confirmLabel: tr("common.delete2"),
      onConfirm: () => {
        startTransition(async () => {
          const result = await deleteRegion(row.id);
          notifyResult(
            tr,
            router,
            result,
            tr("master.plants.theRegionWasDeleted"),
          );
        });
      },
    });
  };

  return (
    <ListShell
      action={
        <CreateButton onClick={() => setModal({ region: null })}>
          {tr("master.plants.addARegion2")}
        </CreateButton>
      }
      breadcrumbs={[
        tr("common.masterData"),
        { label: "拠点", href: "/master/plants" },
        tr("common.region"),
      ]}
      title={tr("common.region")}
    >
      <Table.ScrollContainer minWidth={560}>
        <Table>
          <Table.Thead>
            <Table.Tr>
              <Table.Th w={140}>コード</Table.Th>
              <Table.Th>{tr("common.name2")}</Table.Th>
              <Table.Th w={90}>{tr("master.plants.sites")}</Table.Th>
              <Table.Th w={90}>{tr("common.status")}</Table.Th>
              <Table.Th w={220}>{tr("common.actions")}</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {rows.length === 0 && (
              <Table.Tr>
                <Table.Td colSpan={5}>
                  <Text c="dimmed" py="sm" size="sm" ta="center">
                    {tr("master.plants.thereAreNoRegionsCreateOne")}
                  </Text>
                </Table.Td>
              </Table.Tr>
            )}
            {rows.map((row) => (
              <Table.Tr key={row.id}>
                <Table.Td>
                  <DocNumber>{row.code}</DocNumber>
                </Table.Td>
                <Table.Td>
                  <Text size="sm">{row.nameJa}</Text>
                </Table.Td>
                <Table.Td>{row.plantCount}</Table.Td>
                <Table.Td>
                  <ActiveBadge active={row.isActive} />
                </Table.Td>
                <Table.Td>
                  <Group gap={4} wrap="nowrap">
                    <GhostButton
                      leftSection={<IconEdit size={14} />}
                      onClick={() => setModal({ region: row })}
                    >
                      {tr("common.edit2")}
                    </GhostButton>
                    <GhostButton
                      leftSection={<IconCircleMinus size={14} />}
                      loading={isPending}
                      onClick={() => handleToggle(row)}
                    >
                      {row.isActive ? "無効化" : tr("common.enable")}
                    </GhostButton>
                    <GhostButton
                      color="red"
                      disabled={row.plantCount > 0}
                      leftSection={<IconTrash size={14} />}
                      onClick={() => handleDelete(row)}
                    >
                      削除
                    </GhostButton>
                  </Group>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>
      <Text c="dimmed" mt="sm" size="xs">
        {tr("master.plants.theRegionCodeIsTheIdentifier")}
      </Text>
      {modal && (
        <RegionModal
          onClose={() => setModal(null)}
          opened
          region={modal.region}
        />
      )}
    </ListShell>
  );
}
