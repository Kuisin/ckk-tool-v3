"use client";

/**
 * SharePageModal — 現在のページを他ユーザー / グループへ共有（_demo-system 参照）。
 *
 * 共有内容は現在の URL（path + search params）。X6 により一覧のフィルタ・
 * ページ・詳細タブまで URL に含まれるため、受け取り側は送信者と同じ画面
 * 状態をそのまま開ける。配信は通知基盤（ベル / プッシュ / メール）。
 */

import {
  Alert,
  Code,
  Modal,
  MultiSelect,
  Stack,
  Switch,
  Text,
  Textarea,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconInfoCircle, IconShare2 } from "@tabler/icons-react";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { CancelButton, PrimaryButton } from "@/components/ui/buttons";
import { appList } from "@/lib/app-list";
import { fetchShareOptionsAction, sharePageAction } from "./share-actions";

export function SharePageModal({
  opened,
  onClose,
}: {
  opened: boolean;
  onClose: () => void;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [users, setUsers] = useState<string[]>([]);
  const [groups, setGroups] = useState<string[]>([]);
  const [everyone, setEveryone] = useState(false);
  const [comment, setComment] = useState("");
  const [options, setOptions] = useState<{
    users: { value: string; label: string }[];
    groups: { value: string; label: string }[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const currentUrl = useMemo(() => {
    const q = searchParams.toString();
    return q ? `${pathname}?${q}` : pathname;
  }, [pathname, searchParams]);

  // ページ表示名（appList の href 前方一致で解決）
  const pageLabel = useMemo(() => {
    const hit = [...appList]
      .sort((a, b) => b.href.length - a.href.length)
      .find((a) => pathname === a.href || pathname.startsWith(`${a.href}/`));
    return hit?.label ?? pathname;
  }, [pathname]);

  // 宛先候補はモーダルを開いた時に一度だけ取得（demo と同じ）
  useEffect(() => {
    if (!opened || options) return;
    fetchShareOptionsAction().then((res) => {
      if (res.ok) setOptions(res.data);
      else setError(res.error);
    });
  }, [opened, options]);

  const reset = () => {
    setUsers([]);
    setGroups([]);
    setEveryone(false);
    setComment("");
    setError(null);
  };

  const submit = () => {
    setError(null);
    if (!everyone && users.length === 0 && groups.length === 0) {
      setError("宛先を 1 件以上選択してください");
      return;
    }
    startTransition(async () => {
      const res = await sharePageAction({
        path: currentUrl,
        pageLabel,
        userIds: users,
        groupIds: groups.map(Number),
        everyone,
        comment,
      });
      if (res.ok) {
        notifications.show({
          title: "共有しました",
          message: `${res.data.recipientCount} 名に通知を送信しました`,
          color: "green",
        });
        reset();
        onClose();
      } else {
        setError(res.error);
      }
    });
  };

  return (
    <Modal onClose={onClose} opened={opened} title="ページを共有" withinPortal>
      <Stack gap="sm">
        <div>
          <Text c="dimmed" mb={4} size="xs">
            共有するページ（現在の表示状態を含む）
          </Text>
          <Code block>{currentUrl}</Code>
        </div>

        {error && (
          <Alert color="red" icon={<IconInfoCircle size={16} />}>
            {error}
          </Alert>
        )}

        <Switch
          checked={everyone}
          label="全員に共有"
          onChange={(e) => setEveryone(e.currentTarget.checked)}
          size="sm"
        />
        <MultiSelect
          clearable
          data={options?.users ?? []}
          disabled={everyone}
          label="ユーザー"
          onChange={setUsers}
          placeholder={options ? "ユーザーを選択" : "読み込み中..."}
          searchable
          value={users}
        />
        <MultiSelect
          clearable
          data={options?.groups ?? []}
          disabled={everyone}
          label="承認グループ"
          onChange={setGroups}
          placeholder="グループを選択"
          searchable
          value={groups}
        />
        <Textarea
          label="コメント（任意）"
          minRows={2}
          onChange={(e) => setComment(e.currentTarget.value)}
          placeholder="共有の目的・確認してほしい点など"
          value={comment}
        />

        <Stack gap="xs">
          <PrimaryButton
            fullWidth
            leftSection={<IconShare2 size={16} />}
            loading={isPending}
            onClick={submit}
          >
            共有
          </PrimaryButton>
          <CancelButton fullWidth onClick={onClose} />
        </Stack>
      </Stack>
    </Modal>
  );
}
