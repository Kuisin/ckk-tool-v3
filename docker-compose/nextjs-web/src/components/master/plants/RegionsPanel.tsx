"use client";

/**
 * RegionsPanel.tsx — 地域マスタ（/master/plants/regions）。
 *
 * 地域 = REGION スコープ権限の実体（plants.region_id が参照）。拠点一覧から
 * リンクされるサブページで、一覧 + インライン追加・編集を 1 画面で行う。
 * 削除は拠点未参照の地域のみ（サーバー側で count ガード）。
 */

import { Group, Table, Text, TextInput } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconCircleMinus, IconEdit, IconTrash } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  createRegion,
  deleteRegion,
  setRegionActive,
  updateRegion,
} from "@/app/(dashboard)/master/plants/actions";
import { ActiveBadge } from "@/components/ui/ActiveBadge";
import {
  CancelButton,
  GhostButton,
  PrimaryButton,
  SaveButton,
} from "@/components/ui/buttons";
import { DocNumber } from "@/components/ui/DocNumber";
import { openConfirm } from "@/components/ui/modals";
import { ListShell } from "@/components/ui/shells";

export interface RegionRow {
  id: number;
  code: string;
  nameJa: string;
  nameEn: string;
  plantCount: number;
  isActive: boolean;
}

interface EditState {
  nameJa: string;
  nameEn: string;
}

export function RegionsPanel({ rows }: { rows: RegionRow[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // 追加フォーム
  const [newCode, setNewCode] = useState("");
  const [newNameJa, setNewNameJa] = useState("");
  const [newNameEn, setNewNameEn] = useState("");

  // 行編集
  const [editId, setEditId] = useState<number | null>(null);
  const [edit, setEdit] = useState<EditState>({ nameJa: "", nameEn: "" });

  const notifyResult = (
    result: { ok: boolean; error?: string },
    message: string,
  ) => {
    if (result.ok) {
      notifications.show({ title: "保存しました", message, color: "green" });
      router.refresh();
    } else {
      notifications.show({
        title: "エラー",
        message: result.error ?? "失敗しました",
        color: "red",
      });
    }
  };

  const handleAdd = () => {
    startTransition(async () => {
      const result = await createRegion({
        code: newCode,
        nameJa: newNameJa,
        nameEn: newNameEn,
        isActive: true,
      });
      if (result.ok) {
        setNewCode("");
        setNewNameJa("");
        setNewNameEn("");
      }
      notifyResult(result, "地域を追加しました");
    });
  };

  const handleSaveEdit = (row: RegionRow) => {
    startTransition(async () => {
      const result = await updateRegion(row.id, {
        code: row.code,
        nameJa: edit.nameJa,
        nameEn: edit.nameEn,
        isActive: row.isActive,
      });
      if (result.ok) setEditId(null);
      notifyResult(result, "地域を更新しました");
    });
  };

  const handleToggle = (row: RegionRow) => {
    startTransition(async () => {
      const result = await setRegionActive(row.id, !row.isActive);
      notifyResult(
        result,
        row.isActive ? "地域を無効化しました" : "地域を有効化しました",
      );
    });
  };

  const handleDelete = (row: RegionRow) => {
    openConfirm({
      title: "地域の削除",
      message: `地域「${row.code} ${row.nameJa}」を削除します。この操作は取り消せません。`,
      confirmLabel: "削除する",
      onConfirm: () => {
        startTransition(async () => {
          const result = await deleteRegion(row.id);
          notifyResult(result, "地域を削除しました");
        });
      },
    });
  };

  return (
    <ListShell
      breadcrumbs={[
        "マスタ",
        { label: "拠点", href: "/master/plants" },
        "地域",
      ]}
      title="地域"
    >
      <Table.ScrollContainer minWidth={640}>
        <Table>
          <Table.Thead>
            <Table.Tr>
              <Table.Th w={140}>コード</Table.Th>
              <Table.Th>名称（日本語）</Table.Th>
              <Table.Th>名称（英語）</Table.Th>
              <Table.Th w={90}>拠点数</Table.Th>
              <Table.Th w={90}>状態</Table.Th>
              <Table.Th w={220}>操作</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {rows.length === 0 && (
              <Table.Tr>
                <Table.Td colSpan={6}>
                  <Text c="dimmed" py="sm" size="sm" ta="center">
                    地域がありません — 下の行から追加してください
                  </Text>
                </Table.Td>
              </Table.Tr>
            )}
            {rows.map((row) =>
              editId === row.id ? (
                <Table.Tr key={row.id}>
                  <Table.Td>
                    <DocNumber>{row.code}</DocNumber>
                  </Table.Td>
                  <Table.Td>
                    <TextInput
                      onChange={(e) =>
                        setEdit((s) => ({
                          ...s,
                          nameJa: e.currentTarget.value,
                        }))
                      }
                      value={edit.nameJa}
                    />
                  </Table.Td>
                  <Table.Td>
                    <TextInput
                      onChange={(e) =>
                        setEdit((s) => ({
                          ...s,
                          nameEn: e.currentTarget.value,
                        }))
                      }
                      value={edit.nameEn}
                    />
                  </Table.Td>
                  <Table.Td>{row.plantCount}</Table.Td>
                  <Table.Td>
                    <ActiveBadge active={row.isActive} />
                  </Table.Td>
                  <Table.Td>
                    <Group gap="xs" wrap="nowrap">
                      <SaveButton
                        loading={isPending}
                        onClick={() => handleSaveEdit(row)}
                        type="button"
                      />
                      <CancelButton onClick={() => setEditId(null)} />
                    </Group>
                  </Table.Td>
                </Table.Tr>
              ) : (
                <Table.Tr key={row.id}>
                  <Table.Td>
                    <DocNumber>{row.code}</DocNumber>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm">{row.nameJa}</Text>
                  </Table.Td>
                  <Table.Td>
                    <Text c="dimmed" size="sm">
                      {row.nameEn}
                    </Text>
                  </Table.Td>
                  <Table.Td>{row.plantCount}</Table.Td>
                  <Table.Td>
                    <ActiveBadge active={row.isActive} />
                  </Table.Td>
                  <Table.Td>
                    <Group gap={4} wrap="nowrap">
                      <GhostButton
                        leftSection={<IconEdit size={14} />}
                        onClick={() => {
                          setEditId(row.id);
                          setEdit({ nameJa: row.nameJa, nameEn: row.nameEn });
                        }}
                      >
                        編集
                      </GhostButton>
                      <GhostButton
                        leftSection={<IconCircleMinus size={14} />}
                        onClick={() => handleToggle(row)}
                      >
                        {row.isActive ? "無効化" : "有効化"}
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
              ),
            )}
            {/* 追加行 */}
            <Table.Tr>
              <Table.Td>
                <TextInput
                  onChange={(e) => setNewCode(e.currentTarget.value)}
                  placeholder="例: jp"
                  value={newCode}
                />
              </Table.Td>
              <Table.Td>
                <TextInput
                  onChange={(e) => setNewNameJa(e.currentTarget.value)}
                  placeholder="例: 日本"
                  value={newNameJa}
                />
              </Table.Td>
              <Table.Td>
                <TextInput
                  onChange={(e) => setNewNameEn(e.currentTarget.value)}
                  placeholder="例: Japan"
                  value={newNameEn}
                />
              </Table.Td>
              <Table.Td colSpan={2} />
              <Table.Td>
                <PrimaryButton
                  disabled={!newCode.trim() || !newNameJa.trim()}
                  loading={isPending}
                  onClick={handleAdd}
                >
                  追加
                </PrimaryButton>
              </Table.Td>
            </Table.Tr>
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>
      <Text c="dimmed" mt="sm" size="xs">
        地域コードは REGION スコープ権限（scope_values）が参照する識別子のため
        作成後は変更できません。削除は拠点から参照されていない地域のみ可能です。
      </Text>
    </ListShell>
  );
}
