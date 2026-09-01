"use client";

/**
 * LinkAdminPanel — リンク管理（SY0B）。
 *
 * 「索引」タブ: メモ / コメントに貼られた外部リンクの一覧（短縮コード・
 * 遷移先・利用回数）。ブロック対象の行はバッジで示す。
 * 「ブロック」タブ: 遷移を禁止するホスト名の管理。
 *
 * ブロック判定は確認ページ（/l/<code>）でクリックのたびに行われるので、
 * ここで追加した指定は**既存のリンクにも遡って効く**。
 */

import {
  Alert,
  Anchor,
  Badge,
  Group,
  Paper,
  Stack,
  Switch,
  Tabs,
  Text,
  TextInput,
  Tooltip,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import {
  IconInfoCircle,
  IconLink,
  IconShieldOff,
  IconTrash,
} from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  addBlacklistAction,
  deleteBlacklistAction,
  setBlacklistActiveAction,
} from "@/app/(dashboard)/settings/links/actions";
import { useFormat } from "@/components/layout/PreferencesProvider";
import { AppTabs } from "@/components/ui/AppTabs";
import { PrimaryButton } from "@/components/ui/buttons";
import { type Column, DataTable } from "@/components/ui/DataTable";
import { openConfirm } from "@/components/ui/modals";
import { useTr } from "@/hooks/useTr";
import type { BlacklistRow, LinkIndexRow } from "@/lib/link-index";

export function LinkAdminPanel({
  links,
  blacklist,
}: {
  links: LinkIndexRow[];
  blacklist: BlacklistRow[];
}) {
  const tr = useTr();
  const fmt = useFormat();
  const router = useRouter();
  const [tab, setTab] = useState<string | null>("index");
  const [pattern, setPattern] = useState("");
  const [reason, setReason] = useState("");
  const [pending, start] = useTransition();

  // 戻り値は void に固定する（notifications.show は id を返すので、
  // `return notifyError(...)` が useTransition の TransitionFunction に合わなくなる）。
  const notifyError = (message: string): void => {
    notifications.show({ title: tr("エラー"), message, color: "red" });
  };

  const add = () => {
    start(async () => {
      const result = await addBlacklistAction({ pattern, reason });
      if (!result.ok) return notifyError(result.error);
      notifications.show({
        title: tr("追加しました"),
        message: `${pattern} へのリンクをブロックします`,
        color: "green",
      });
      setPattern("");
      setReason("");
      router.refresh();
    });
  };

  const toggle = (row: BlacklistRow) => {
    start(async () => {
      const result = await setBlacklistActiveAction(row.id, !row.isActive);
      if (!result.ok) return notifyError(result.error);
      router.refresh();
    });
  };

  const remove = (row: BlacklistRow) => {
    openConfirm({
      title: tr("ブロック指定の削除"),
      message: `${row.pattern} のブロックを解除します。以後このホストへのリンクは通常どおり開けます。`,
      confirmLabel: "削除",
      onConfirm: () =>
        start(async () => {
          const result = await deleteBlacklistAction(row.id);
          if (!result.ok) return notifyError(result.error);
          router.refresh();
        }),
    });
  };

  const linkColumns: Column<LinkIndexRow>[] = [
    {
      key: "code",
      header: tr("短縮コード"),
      width: 130,
      render: (r) => (
        <Anchor ff="mono" href={`/l/${r.code}`} size="sm" target="_blank">
          {r.code}
        </Anchor>
      ),
    },
    {
      key: "hostname",
      header: tr("ホスト"),
      width: 200,
      render: (r) => (
        <Group gap="xs" wrap="nowrap">
          <Text size="sm">{r.hostname}</Text>
          {r.blocked && (
            <Badge color="red" size="xs" variant="light">
              {tr("ブロック中")}
            </Badge>
          )}
        </Group>
      ),
    },
    {
      key: "url",
      header: tr("遷移先"),
      width: 380,
      render: (r) => (
        <Tooltip label={r.url} multiline w={420} withArrow>
          <Text size="xs">{r.url}</Text>
        </Tooltip>
      ),
    },
    {
      key: "hitCount",
      header: tr("利用"),
      width: 80,
      align: "right",
      render: (r) => <Text size="sm">{r.hitCount}</Text>,
    },
    {
      key: "lastUsedAt",
      header: tr("最終利用"),
      width: 150,
      render: (r) => (
        <Text c="dimmed" size="xs">
          {r.lastUsedAt ? fmt.dateTime(r.lastUsedAt) : "—"}
        </Text>
      ),
    },
  ];

  const blockColumns: Column<BlacklistRow>[] = [
    {
      key: "pattern",
      header: tr("ホスト名"),
      width: 240,
      render: (r) => (
        <Text fw={600} size="sm">
          {r.pattern}
        </Text>
      ),
    },
    {
      key: "reason",
      header: tr("理由"),
      width: 300,
      render: (r) => (
        <Text c={r.reason ? undefined : "dimmed"} size="sm">
          {r.reason || "—"}
        </Text>
      ),
    },
    {
      key: "matchCount",
      header: tr("該当リンク"),
      width: 110,
      align: "right",
      render: (r) => <Text size="sm">{r.matchCount}</Text>,
    },
    {
      key: "isActive",
      header: "有効",
      width: 90,
      render: (r) => (
        <Switch
          checked={r.isActive}
          disabled={pending}
          onChange={() => toggle(r)}
          size="sm"
        />
      ),
    },
    {
      key: "createdAt",
      header: tr("登録"),
      width: 170,
      render: (r) => (
        <Text c="dimmed" size="xs">
          {fmt.dateTime(r.createdAt)}（{r.createdBy}）
        </Text>
      ),
    },
  ];

  return (
    <AppTabs onChange={setTab} value={tab}>
      <Tabs.List>
        <Tabs.Tab leftSection={<IconLink size={14} />} value="index">
          索引（{links.length}）
        </Tabs.Tab>
        <Tabs.Tab leftSection={<IconShieldOff size={14} />} value="blocked">
          ブロック（{blacklist.length}）
        </Tabs.Tab>
      </Tabs.List>

      <Tabs.Panel pt="md" value="index">
        <Stack gap="sm">
          <Alert
            color="blue"
            icon={<IconInfoCircle size={16} />}
            variant="light"
          >
            <Text size="xs">
              {tr(
                "メモ / コメントに貼られた外部リンクは短縮リンクに置き換えられ、\n              閲覧者は確認ページで遷移先を見てから外部へ移動します。",
              )}
            </Text>
          </Alert>
          <DataTable
            columns={linkColumns}
            data={links}
            emptyIcon={<IconLink size={24} />}
            emptyMessage={tr("外部リンクはまだ登録されていません")}
            getRowId={(r) => r.code}
            pageSize={20}
            settingsKey="links"
          />
        </Stack>
      </Tabs.Panel>

      <Tabs.Panel pt="md" value="blocked">
        <Stack gap="sm">
          <Paper p="sm" radius="md" withBorder>
            <Stack gap="sm">
              <Text fw={600} size="sm">
                {tr("ブロックを追加")}
              </Text>
              <Group align="flex-end" gap="sm">
                <TextInput
                  description={tr("サブドメインも含めてブロックします")}
                  label={tr("ホスト名")}
                  onChange={(e) => setPattern(e.currentTarget.value)}
                  placeholder="evil.example"
                  style={{ flex: 1 }}
                  value={pattern}
                />
                <TextInput
                  label={tr("理由（任意）")}
                  onChange={(e) => setReason(e.currentTarget.value)}
                  placeholder={tr("フィッシング報告あり")}
                  style={{ flex: 1 }}
                  value={reason}
                />
                <PrimaryButton
                  disabled={!pattern.trim()}
                  loading={pending}
                  onClick={add}
                >
                  {tr("追加")}
                </PrimaryButton>
              </Group>
            </Stack>
          </Paper>

          <DataTable
            columns={blockColumns}
            data={blacklist}
            emptyIcon={<IconShieldOff size={24} />}
            emptyMessage={tr("ブロック指定はありません")}
            getRowId={(r) => r.id}
            pageSize={20}
            rowActions={() => [
              {
                label: "削除",
                icon: <IconTrash size={14} />,
                color: "red",
                onAction: remove,
              },
            ]}
            settingsKey="blocked"
          />
        </Stack>
      </Tabs.Panel>
    </AppTabs>
  );
}
