"use client";

/**
 * SY0H のアカウント一覧 + 作成・有効化・無効化・共有範囲・バックアップコード。
 *
 * バックアップコードは**発行直後の 1 回だけ**表示する（以後どこからも読めない）。
 */

import {
  Alert,
  Badge,
  Button,
  Card,
  Checkbox,
  Code,
  Group,
  Modal,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Text,
  TextInput,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconPlus } from "@tabler/icons-react";
import { useState, useTransition } from "react";
import {
  activatePortalAccount,
  addPortalBpScope,
  createPortalAccount,
  deactivatePortalAccount,
  issueBackupCodes,
} from "@/app/(dashboard)/settings/portal/actions";
import { useTr } from "@/hooks/useTr";
import type { PortalAccountRow } from "@/lib/portal-admin";

type Option = { value: string; label: string };

export function PortalAccountsTable({
  accounts,
  bpOptions,
  canActivate,
  canIssueBackup,
}: {
  accounts: PortalAccountRow[];
  bpOptions: Option[];
  canActivate?: boolean;
  canIssueBackup?: boolean;
}) {
  const tr = useTr();
  const [pending, start] = useTransition();
  const [creating, setCreating] = useState(false);
  const [bpId, setBpId] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [scopeBranches, setScopeBranches] = useState(true);
  const [scopeEndUser, setScopeEndUser] = useState(false);
  const [issued, setIssued] = useState<string[] | null>(null);

  function notify(res: { ok: boolean; error?: string }, ok: string) {
    if (res.ok) {
      notifications.show({ color: "green", message: ok, title: tr("完了") });
    } else {
      notifications.show({
        color: "red",
        message: tr(res.error) ?? tr("失敗しました"),
        title: tr("エラー"),
      });
    }
  }

  function create() {
    if (!bpId) return;
    start(async () => {
      const res = await createPortalAccount({ bpId, email, displayName });
      notify(res, tr("アカウントを作成しました（既定は無効です）"));
      if (res.ok) {
        // 作った直後に BP スコープを 1 本入れておく（無いと何も見えない）。
        await addPortalBpScope({
          portalAccountId: res.data.id,
          bpId,
          includeBranches: scopeBranches,
          includeAsEndUser: scopeEndUser,
        });
        setCreating(false);
        setEmail("");
        setDisplayName("");
      }
    });
  }

  return (
    <Stack gap="md">
      <Group justify="flex-end">
        <Button
          leftSection={<IconPlus size={14} />}
          onClick={() => setCreating(true)}
        >
          {tr("新規作成")}
        </Button>
      </Group>

      <Card padding="md" radius="md" withBorder>
        <Table highlightOnHover striped withTableBorder>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>{tr("取引先")}</Table.Th>
              <Table.Th>{tr("担当者")}</Table.Th>
              <Table.Th>{tr("メール")}</Table.Th>
              <Table.Th>{tr("状態")}</Table.Th>
              <Table.Th>{tr("最終ログイン")}</Table.Th>
              <Table.Th>{tr("操作")}</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {accounts.length === 0 ? (
              <Table.Tr>
                <Table.Td colSpan={6}>
                  <Text c="dimmed" size="sm">
                    {tr("アカウントはまだありません。")}
                  </Text>
                </Table.Td>
              </Table.Tr>
            ) : (
              accounts.map((a) => (
                <Table.Tr key={a.id}>
                  <Table.Td>
                    <Text size="sm">{a.bpName}</Text>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm">{a.displayName}</Text>
                  </Table.Td>
                  <Table.Td>
                    <Text c="dimmed" ff="monospace" size="xs">
                      {a.maskedEmail}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Badge
                      color={a.isActive ? "green" : "gray"}
                      size="sm"
                      variant="light"
                    >
                      {a.isActive ? "有効" : tr("無効")}
                    </Badge>
                  </Table.Td>
                  <Table.Td>
                    <Text c="dimmed" size="xs">
                      {a.lastLoginAt?.slice(0, 10) ?? "—"}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Group gap="xs">
                      {a.isActive ? (
                        <Button
                          loading={pending}
                          onClick={() =>
                            start(async () =>
                              notify(
                                await deactivatePortalAccount(
                                  a.id,
                                  tr("管理画面から無効化"),
                                ),
                                tr("無効にしました"),
                              ),
                            )
                          }
                          size="compact-xs"
                          variant="default"
                        >
                          {tr("無効にする")}
                        </Button>
                      ) : (
                        <Button
                          disabled={!canActivate}
                          loading={pending}
                          onClick={() =>
                            start(async () =>
                              notify(
                                await activatePortalAccount(a.id),
                                tr("有効にしました"),
                              ),
                            )
                          }
                          size="compact-xs"
                          title={
                            canActivate
                              ? undefined
                              : tr(
                                  tr(
                                    tr(
                                      "有効化には特権アクセス（SY0G）の承認が必要です",
                                    ),
                                  ),
                                )
                          }
                        >
                          {tr("有効にする")}
                        </Button>
                      )}
                      <Button
                        disabled={!canIssueBackup}
                        loading={pending}
                        onClick={() =>
                          start(async () => {
                            const res = await issueBackupCodes(a.id);
                            if (res.ok) setIssued(res.data.codes);
                            notify(res, tr("バックアップコードを発行しました"));
                          })
                        }
                        size="compact-xs"
                        title={
                          canIssueBackup
                            ? undefined
                            : tr("発行には特権アクセス（SY0G）の承認が必要です")
                        }
                        variant="default"
                      >
                        {tr("バックアップコード")}
                      </Button>
                    </Group>
                  </Table.Td>
                </Table.Tr>
              ))
            )}
          </Table.Tbody>
        </Table>
      </Card>

      <Modal
        onClose={() => setCreating(false)}
        opened={creating}
        title={tr("ポータルアカウントの作成")}
      >
        <Stack gap="sm">
          <Select
            data={bpOptions}
            label={tr("取引先")}
            onChange={setBpId}
            searchable
            value={bpId}
            withAsterisk
          />
          <TextInput
            label={tr("担当者名")}
            onChange={(e) => setDisplayName(e.currentTarget.value)}
            value={displayName}
            withAsterisk
          />
          <TextInput
            label={tr("メールアドレス")}
            onChange={(e) => setEmail(e.currentTarget.value)}
            type="email"
            value={email}
            withAsterisk
          />
          <SimpleGrid cols={1} spacing="xs">
            <Checkbox
              checked={scopeBranches}
              description={tr(
                tr(
                  tr(
                    "親の取引先で共有すると、その支店宛の書類も見えます（支店から親へは遡りません）",
                  ),
                ),
              )}
              label={tr("支店宛の書類も含める")}
              onChange={(e) => setScopeBranches(e.currentTarget.checked)}
            />
            <Checkbox
              checked={scopeEndUser}
              description={tr(
                tr(
                  tr(
                    "卸し先の価格が需要家に見えることがあります。必要なときだけ。",
                  ),
                ),
              )}
              label={tr("需要家・出荷先としての書類も含める")}
              onChange={(e) => setScopeEndUser(e.currentTarget.checked)}
            />
          </SimpleGrid>
          <Alert color="gray" variant="light">
            <Text size="xs">
              {tr(
                tr(
                  tr(
                    "作成しただけでは何も見えません。「有効にする」で初めてログインできます\n              （有効化には承認が必要です）。",
                  ),
                ),
              )}
            </Text>
          </Alert>
          <Group justify="flex-end">
            <Button onClick={() => setCreating(false)} variant="default">
              キャンセル
            </Button>
            <Button
              disabled={!bpId || !email || !displayName}
              loading={pending}
              onClick={create}
            >
              {tr("作成")}
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Modal
        onClose={() => setIssued(null)}
        opened={issued !== null}
        title={tr("バックアップコード")}
      >
        <Stack gap="sm">
          <Alert color="orange" variant="light">
            <Text size="xs">
              {tr(
                tr(
                  tr(
                    "この画面を閉じると**二度と表示できません**。印刷するか書き写して、\n              担当者ご本人へ直接お渡しください。メールで送らないでください\n              （メールが使えないときのための手段です）。",
                  ),
                ),
              )}
            </Text>
          </Alert>
          <Code block>{(issued ?? []).join("\n")}</Code>
          <Group justify="flex-end">
            <Button onClick={() => setIssued(null)}>
              {tr("閉じた（控えました）")}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}
