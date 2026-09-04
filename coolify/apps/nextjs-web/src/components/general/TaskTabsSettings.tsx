"use client";

/**
 * TaskTabsSettings — 未処理一覧 (CM01) で「どのタブを出すか」を本人が決める。
 *
 * 6 枚あるタブのうち、自分が使うのはたいてい 1〜2 枚。使わないタブが前に
 * 並ぶとスマホでは自分のタブが画面外へ押し出されるので、隠せるようにした。
 * 並び順は変えられない（定義順で固定 — 入れ替えまで持たせると設定が
 * 「もう一つの画面」になる）。
 *
 * いま出ていないタブ（承認権限が無い・完了通知をまだ受け取っていない）は
 * 一覧に出さないが、**保存済みの設定は残す** — 条件が変わって出てきたときに、
 * 以前隠したはずのタブが復活しないように。
 */

import {
  ActionIcon,
  Checkbox,
  Group,
  Stack,
  Text,
  Tooltip,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconLayoutColumns } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { saveTaskTabsSetting } from "@/app/(dashboard)/general/tasks/actions";
import { SecondaryButton } from "@/components/ui/buttons";
import { ModalShell } from "@/components/ui/modals";
import { useIsMobile } from "@/hooks/useViewport";
import { type TaskTabDef, taskTabs } from "@/lib/tasks-tabs";

export function TaskTabsSettingsButton({
  available,
  hidden,
}: {
  /** いまこの人に出せるタブの id（権限・件数で変わる）。 */
  available: readonly string[];
  /** 保存済みの「隠す」設定（出せないタブの分も含む）。 */
  hidden: readonly string[];
}) {
  const tr = useTranslations();
  const router = useRouter();
  const isMobile = useIsMobile();
  const [opened, setOpened] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [checked, setChecked] = useState<string[]>([]);

  const choices: TaskTabDef[] = taskTabs(tr).filter((t) =>
    available.includes(t.id),
  );

  const open = () => {
    setChecked(choices.filter((t) => !hidden.includes(t.id)).map((t) => t.id));
    setOpened(true);
  };

  const save = () =>
    startTransition(async () => {
      // いま選べなかったタブの設定はそのまま持ち越す。
      const untouched = hidden.filter((id) => !available.includes(id));
      const next = [
        ...untouched,
        ...choices.filter((t) => !checked.includes(t.id)).map((t) => t.id),
      ];
      const result = await saveTaskTabsSetting(next);
      if (!result.ok) {
        notifications.show({
          title: tr("common.error2"),
          message: result.error ?? tr("common.couldNotSave"),
          color: "red",
        });
        return;
      }
      setOpened(false);
      notifications.show({
        message: tr("general.taskTabsSettings.theTabsToShowWereSaved"),
        color: "green",
      });
      router.refresh();
    });

  return (
    // ヘッダーは wrap="nowrap" なので、ボタンが潰れないよう縮まないことを明示する。
    <Group gap="xs" style={{ flexShrink: 0 }} wrap="nowrap">
      {isMobile ? (
        // 指で押す前提なので 40px（Mantine の "lg" = 34px では小さい）。
        <ActionIcon
          aria-label={tr("general.taskTabsSettings.tabsToShow")}
          onClick={open}
          size={40}
          variant="default"
        >
          <IconLayoutColumns size={18} />
        </ActionIcon>
      ) : (
        <Tooltip
          label={tr("general.taskTabsSettings.youCanHideTabsYouDo")}
          withinPortal
        >
          <SecondaryButton
            leftSection={<IconLayoutColumns size={16} />}
            onClick={open}
          >
            {tr("general.taskTabsSettings.tabsToShow")}
          </SecondaryButton>
        </Tooltip>
      )}

      <ModalShell
        confirmDisabled={checked.length === 0}
        confirmLabel={tr("common.save2")}
        loading={isPending}
        onClose={() => setOpened(false)}
        onConfirm={save}
        opened={opened}
        size="sm"
        title={tr("general.taskTabsSettings.tabsToShow")}
      >
        <Stack gap="xs">
          <Text c="dimmed" size="sm">
            {tr(
              "general.taskTabsSettings.uncheckedTabsDisappearFromYourScreen",
            )}
          </Text>
          <Checkbox.Group onChange={setChecked} value={checked}>
            <Stack gap="xs" mt={4}>
              {choices.map((t) => (
                <Checkbox key={t.id} label={t.label} value={t.id} />
              ))}
            </Stack>
          </Checkbox.Group>
          {checked.length === 0 && (
            <Text c="red" size="xs">
              {tr("general.taskTabsSettings.leaveAtLeastOne")}
            </Text>
          )}
        </Stack>
      </ModalShell>
    </Group>
  );
}
