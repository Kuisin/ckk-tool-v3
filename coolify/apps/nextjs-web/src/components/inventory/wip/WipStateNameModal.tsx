"use client";

/**
 * WipStateNameModal — 加工状態に呼び名を付ける（任意のラベル）。
 *
 * 加工状態は「済んだ形を変える工程の並び」で、既定では工程名を並べて見せる。
 * 現場で呼び名がある状態（例: 「段付きブランク」）にはここで名前を付けられる。
 * 並びそのものは変えない — 名前はラベルで、突合には効かない。
 */

import { Stack, Text } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { renameWipState } from "@/app/(dashboard)/inventory/wip/actions";
import { ModalShell } from "@/components/ui/modals";
import { LocalizedTextInput } from "@/components/ui/shells";
import type { WipStockRow } from "./model";
import { WipStateLabel } from "./WipStockList";

export function WipStateNameModal({
  row,
  onClose,
  onDone,
}: {
  row: WipStockRow;
  onClose: () => void;
  onDone: () => void;
}) {
  const tr = useTranslations();
  const { ja = "", ...rest } = row.stateNameJson ?? {};
  const [nameJa, setNameJa] = useState(ja);
  const [translations, setTranslations] =
    useState<Record<string, string>>(rest);
  const [pending, startTransition] = useTransition();

  function submit() {
    startTransition(async () => {
      const res = await renameWipState({
        wipStateId: row.wipStateId,
        nameJa,
        nameTranslations: translations,
      });
      if (!res.ok) {
        notifications.show({
          title: tr("inventory.wip.renameFailed"),
          message: res.error,
          color: "red",
        });
        return;
      }
      notifications.show({
        title: tr("inventory.wip.renamed"),
        message: nameJa.trim() || "—",
        color: "green",
      });
      onDone();
    });
  }

  return (
    <ModalShell
      confirmLabel={tr("common.save")}
      loading={pending}
      onClose={onClose}
      onConfirm={submit}
      opened
      title={tr("inventory.wip.nameState")}
    >
      <Stack gap="sm">
        <div>
          <Text c="dimmed" mb={4} size="xs">
            {tr("inventory.wip.stateSteps")}
          </Text>
          <WipStateLabel
            row={{ isLegacy: false, stateName: null, stepNames: row.stepNames }}
          />
        </div>
        <LocalizedTextInput
          jaProps={{
            value: nameJa,
            onChange: (e) => setNameJa(e.currentTarget.value),
            description: tr("inventory.wip.stateNameHelp"),
          }}
          label={tr("inventory.wip.stateNameLabel")}
          translationsProps={{
            value: translations,
            onChange: setTranslations,
          }}
        />
      </Stack>
    </ModalShell>
  );
}
