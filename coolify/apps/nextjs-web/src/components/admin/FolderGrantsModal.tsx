"use client";

/**
 * FolderGrantsModal — フォルダ単位のアクセス権管理（SY06、system:ADMIN のみ）。
 * file_folder_grants の一覧・付与（読み / 読み書き）・削除を行う。
 */

import {
  Badge,
  Group,
  Loader,
  Modal,
  Select,
  Stack,
  Switch,
  Table,
  Text,
  TextInput,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconFolder, IconTrash } from "@tabler/icons-react";
import { useTranslations } from "next-intl";
import { useEffect, useState, useTransition } from "react";
import {
  deleteFolderGrant,
  type FolderGrantRow,
  fetchFolderGrants,
  type GrantUserOption,
  upsertFolderGrant,
} from "@/app/(dashboard)/settings/files/actions";
import { GhostButton, PrimaryButton } from "@/components/ui/buttons";
import { HelpLabel } from "@/components/ui/HelpLabel";
import { openConfirm } from "@/components/ui/modals";
import { fieldHelp } from "@/lib/field-help";

export function FolderGrantsModal({
  opened,
  onClose,
  defaultPrefix,
  folders,
}: {
  opened: boolean;
  onClose: () => void;
  /** 開いたときの初期フォルダ（現在表示中のフォルダ）。 */
  defaultPrefix: string;
  /** 既知のフォルダ候補（サジェスト用）。 */
  folders: string[];
}) {
  const tr = useTranslations();
  const [loading, setLoading] = useState(true);
  const [grants, setGrants] = useState<FolderGrantRow[]>([]);
  const [users, setUsers] = useState<GrantUserOption[]>([]);
  const [prefix, setPrefix] = useState(defaultPrefix);
  const [userId, setUserId] = useState<string | null>(null);
  const [canWrite, setCanWrite] = useState(false);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!opened) return;
    setPrefix(defaultPrefix);
    setUserId(null);
    setCanWrite(false);
    setLoading(true);
    fetchFolderGrants().then((res) => {
      if (res.ok) {
        setGrants(res.data.grants);
        setUsers(res.data.users);
      } else {
        notifications.show({
          title: tr("admin.folderGrantsModal.couldNotLoad"),
          message: res.error,
          color: "red",
        });
      }
      setLoading(false);
    });
  }, [opened, defaultPrefix, tr]);

  function onAdd() {
    if (!userId) return;
    startTransition(async () => {
      const res = await upsertFolderGrant({
        pathPrefix: prefix,
        userId,
        canWrite,
      });
      if (!res.ok) {
        notifications.show({
          title: tr("common.saveFailed2"),
          message: res.error,
          color: "red",
        });
        return;
      }
      notifications.show({
        title: tr("admin.folderGrantsModal.thePermissionWasGranted"),
        message: prefix,
        color: "green",
      });
      const reload = await fetchFolderGrants();
      if (reload.ok) setGrants(reload.data.grants);
      setUserId(null);
    });
  }

  function onDelete(row: FolderGrantRow) {
    openConfirm({
      title: tr("admin.folderGrantsModal.removeThePermission"),
      message: `「${row.pathPrefix}」への ${row.userName} さんのアクセス権を削除します。`,
      confirmLabel: "削除",
      onConfirm: () => {
        startTransition(async () => {
          const res = await deleteFolderGrant(row.id);
          if (!res.ok) {
            notifications.show({
              title: tr("common.deleteFailed"),
              message: res.error,
              color: "red",
            });
            return;
          }
          setGrants((prev) => prev.filter((g) => g.id !== row.id));
        });
      },
    });
  }

  return (
    <Modal
      onClose={onClose}
      opened={opened}
      size="lg"
      title={tr("common.folderPermissions")}
    >
      {loading ? (
        <Group justify="center" py="xl">
          <Loader size="sm" />
        </Group>
      ) : (
        <Stack gap="md">
          <Stack gap="xs">
            <Text fw={600} size="sm">
              {tr("admin.folderGrantsModal.grantAPermission")}
            </Text>
            <Group align="flex-end" gap="xs" wrap="wrap">
              <TextInput
                label={
                  <HelpLabel {...fieldHelp("fileManagement", "grantFolder")} />
                }
                leftSection={<IconFolder size={14} />}
                list="folder-grant-suggestions"
                onChange={(e) => setPrefix(e.currentTarget.value)}
                placeholder="uploads"
                style={{ flex: 1, minWidth: 180 }}
                value={prefix}
              />
              <datalist id="folder-grant-suggestions">
                {folders.map((f) => (
                  <option key={f} value={f} />
                ))}
              </datalist>
              <Select
                data={users}
                label={
                  <HelpLabel {...fieldHelp("fileManagement", "grantUser")} />
                }
                onChange={setUserId}
                placeholder={tr("common.select")}
                searchable
                style={{ flex: 1, minWidth: 200 }}
                value={userId}
              />
              <Switch
                checked={canWrite}
                label={
                  <HelpLabel {...fieldHelp("fileManagement", "grantWrite")} />
                }
                onChange={(e) => setCanWrite(e.currentTarget.checked)}
                pb={6}
                size="sm"
              />
              <PrimaryButton
                disabled={!userId || !prefix.trim()}
                loading={pending}
                onClick={onAdd}
              >
                {tr("admin.folderGrantsModal.grant")}
              </PrimaryButton>
            </Group>
            <Text c="dimmed" size="xs">
              {tr("admin.folderGrantsModal.everyFileBeneathTheFolderGiven")}
            </Text>
          </Stack>

          <Stack gap="xs">
            <Text fw={600} size="sm">
              {tr("admin.folderGrantsModal.granted")}
            </Text>
            {grants.length === 0 ? (
              <Text c="dimmed" size="sm">
                {tr("admin.folderGrantsModal.thereAreNoIndividualGrants")}
              </Text>
            ) : (
              <Table>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>{tr("common.folder")}</Table.Th>
                    <Table.Th>{tr("common.user")}</Table.Th>
                    <Table.Th>{tr("common.permission")}</Table.Th>
                    <Table.Th />
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {grants.map((g) => (
                    <Table.Tr key={g.id}>
                      <Table.Td>
                        <Text ff="mono" size="sm">
                          {g.pathPrefix}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        <Text size="sm">
                          {g.userName}{" "}
                          <Text c="dimmed" component="span" size="xs">
                            ({g.username})
                          </Text>
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        <Badge
                          color={g.canWrite ? "blue" : "gray"}
                          variant="light"
                        >
                          {g.canWrite
                            ? "読み書き"
                            : tr("admin.folderGrantsModal.read")}
                        </Badge>
                      </Table.Td>
                      <Table.Td align="right">
                        <GhostButton
                          color="red"
                          leftSection={<IconTrash size={14} />}
                          onClick={() => onDelete(g)}
                          size="xs"
                        >
                          削除
                        </GhostButton>
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            )}
          </Stack>
        </Stack>
      )}
    </Modal>
  );
}
