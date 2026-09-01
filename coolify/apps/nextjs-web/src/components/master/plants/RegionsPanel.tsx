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
import { useTr } from "@/hooks/useTr";
import type { Translate } from "@/lib/ui-text";

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
  tr: Translate,
  router: ReturnType<typeof useRouter>,
  result: { ok: boolean; error?: string },
  message: string,
  onOk?: () => void,
) {
  if (result.ok) {
    notifications.show({ title: tr("保存しました"), message, color: "green" });
    router.refresh();
    onOk?.();
  } else {
    notifications.show({
      title: tr("エラー"),
      message: tr(result.error) ?? tr("失敗しました"),
      color: "red",
    });
  }
}

function RegionModal({
  opened,
  onClose,
  region,
}: ModalBaseProps & { region: RegionRow | null }) {
  const tr = useTr();
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
        isEdit ? "地域を更新しました" : tr("地域を追加しました"),
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
      submitLabel={isEdit ? "保存" : tr("作成")}
      title={isEdit ? "地域の編集" : tr("地域の追加")}
    >
      <Stack gap="sm">
        <TextInput
          description={
            isEdit
              ? tr(
                  tr(
                    "REGION スコープ権限（scope_values）が参照する識別子のため変更できません",
                  ),
                )
              : undefined
          }
          disabled={isEdit}
          label="コード"
          onChange={(e) => setCode(e.currentTarget.value)}
          placeholder={tr("例: jp")}
          value={code}
          withAsterisk
        />
        <LocalizedTextInput
          jaProps={{
            value: nameJa,
            onChange: (e) => setNameJa(e.currentTarget.value),
          }}
          label={tr("名称")}
          placeholder={tr("例: 日本")}
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
  const tr = useTr();
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
        row.isActive ? "地域を無効化しました" : tr("地域を有効化しました"),
      );
    });
  };

  const handleDelete = (row: RegionRow) => {
    openConfirm({
      title: tr("地域の削除"),
      message: tr(
        "地域「{code} {nameJa}」を削除します。この操作は取り消せません。",
        { code: row.code, nameJa: row.nameJa },
      ),
      confirmLabel: tr("削除する"),
      onConfirm: () => {
        startTransition(async () => {
          const result = await deleteRegion(row.id);
          notifyResult(tr, router, result, tr("地域を削除しました"));
        });
      },
    });
  };

  return (
    <ListShell
      action={
        <CreateButton onClick={() => setModal({ region: null })}>
          {tr("地域を追加")}
        </CreateButton>
      }
      breadcrumbs={[
        tr("マスタ"),
        { label: "拠点", href: "/master/plants" },
        tr("地域"),
      ]}
      title={tr("地域")}
    >
      <Table.ScrollContainer minWidth={560}>
        <Table>
          <Table.Thead>
            <Table.Tr>
              <Table.Th w={140}>コード</Table.Th>
              <Table.Th>{tr("名称")}</Table.Th>
              <Table.Th w={90}>{tr("拠点数")}</Table.Th>
              <Table.Th w={90}>{tr("状態")}</Table.Th>
              <Table.Th w={220}>{tr("操作")}</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {rows.length === 0 && (
              <Table.Tr>
                <Table.Td colSpan={5}>
                  <Text c="dimmed" py="sm" size="sm" ta="center">
                    {tr(
                      tr(
                        "地域がありません — 「地域を追加」から作成してください",
                      ),
                    )}
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
                      {tr("編集")}
                    </GhostButton>
                    <GhostButton
                      leftSection={<IconCircleMinus size={14} />}
                      loading={isPending}
                      onClick={() => handleToggle(row)}
                    >
                      {row.isActive ? "無効化" : tr("有効化")}
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
        {tr(
          tr(
            "地域コードは REGION スコープ権限（scope_values）が参照する識別子のため\n        作成後は変更できません。削除は拠点から参照されていない地域のみ可能です。",
          ),
        )}
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
