"use client";

/**
 * SharePageModal — 現在のページを他ユーザー / グループへ共有（tools/demo-system 参照）。
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
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useMemo, useState, useTransition } from "react";
import { CancelButton, PrimaryButton } from "@/components/ui/buttons";
import { appLabel, appList } from "@/lib/app-list";
import type { Locale } from "@/lib/i18n";
import { fetchShareOptionsAction, sharePageAction } from "./share-actions";

export function SharePageModal({
  opened,
  onClose,
}: {
  opened: boolean;
  onClose: () => void;
}) {
  const tr = useTranslations();
  const locale = useLocale() as Locale;
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
    return hit ? appLabel(hit, locale) : pathname;
  }, [pathname, locale]);

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
      setError(tr("layout.sharePageModal.selectAtLeastOneRecipient"));
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
          title: tr("layout.sharePageModal.shared"),
          message: tr("layout.sharePageModal.notifiedRecipientcountPeople", {
            recipientCount: res.data.recipientCount,
          }),
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
    <Modal
      onClose={onClose}
      opened={opened}
      title={tr("common.shareThisPage")}
      withinPortal
    >
      <Stack gap="sm">
        <div>
          <Text c="dimmed" mb={4} size="xs">
            {tr("layout.sharePageModal.thePageToShareIncludingIts")}
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
          label={tr("layout.sharePageModal.shareWithEveryone")}
          onChange={(e) => setEveryone(e.currentTarget.checked)}
          size="sm"
        />
        <MultiSelect
          clearable
          data={options?.users ?? []}
          disabled={everyone}
          label={tr("common.user")}
          onChange={setUsers}
          placeholder={
            options ? "ユーザーを選択" : tr("layout.sharePageModal.loading")
          }
          searchable
          value={users}
        />
        <MultiSelect
          clearable
          data={options?.groups ?? []}
          disabled={everyone}
          label={tr("common.approvalGroup")}
          onChange={setGroups}
          placeholder={tr("common.selectAGroup")}
          searchable
          value={groups}
        />
        <Textarea
          label={tr("common.commentOptional")}
          minRows={2}
          onChange={(e) => setComment(e.currentTarget.value)}
          placeholder={tr("layout.sharePageModal.whyYouAreSharingItWhat")}
          value={comment}
        />

        <Stack gap="xs">
          <PrimaryButton
            fullWidth
            leftSection={<IconShare2 size={16} />}
            loading={isPending}
            onClick={submit}
          >
            {tr("common.sharing")}
          </PrimaryButton>
          <CancelButton fullWidth onClick={onClose} />
        </Stack>
      </Stack>
    </Modal>
  );
}
