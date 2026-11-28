"use client";

/**
 * ScalePresetForm — 数量スケールのプリセット編集（SY02 の 1 セクション）。
 *
 * 「何本から何倍か」の表。価格表（SA02）で新しいバリアントを作るとき、この表が
 * 数量段階の初期値になる。行は**開始数量と倍率**だけ持ち、範囲（〜何本）は次の行の
 * 開始数量から導く — 隙間と重なりを作れない形にしてある。
 * 「単価」は画面上の試算用の基準単価 × 倍率で、保存はされない（読み合わせ用）。
 */

import {
  ActionIcon,
  Group,
  NumberInput,
  Stack,
  Table,
  Text,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconPlus, IconRestore, IconTrash } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { updateScalePreset } from "@/app/(dashboard)/settings/actions";
import { quantityRange } from "@/components/sales/price-lists/model";
import { GhostButton } from "@/components/ui/buttons";
import { openConfirm } from "@/components/ui/modals";
import { PageHeader } from "@/components/ui/PageHeader";
import { FormActions, FormSection } from "@/components/ui/shells";
import {
  DEFAULT_SCALE_PRESET,
  MIN_SCALE_MULTIPLIER,
  type ScalePresetRow,
  scalePresetIssueMessage,
  scalePresetRanges,
  scalePresetUnitPrice,
  validateScalePreset,
} from "@/lib/price-scale-preset";

const BASE = "/settings/trial-pricing-engine";

export function ScalePresetForm({ initial }: { initial: ScalePresetRow[] }) {
  const tr = useTranslations();
  const router = useRouter();
  const [rows, setRows] = useState<ScalePresetRow[]>(initial);
  const [previewBase, setPreviewBase] = useState<number>(1000);
  const [isPending, startTransition] = useTransition();

  const setRow = (i: number, patch: Partial<ScalePresetRow>) =>
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  const addRow = () =>
    setRows((rs) => {
      const last = rs[rs.length - 1];
      return [
        ...rs,
        {
          minQuantity: (last?.minQuantity ?? 0) + 100,
          multiplier: last?.multiplier ?? 1,
        },
      ];
    });

  const resetToDefault = () =>
    openConfirm({
      title: tr("settings.scalePreset.resetConfirmTitle"),
      message: tr("settings.scalePreset.resetConfirmMessage"),
      confirmLabel: tr("settings.scalePreset.resetToDefault"),
      onConfirm: () => setRows(DEFAULT_SCALE_PRESET.map((r) => ({ ...r }))),
    });

  const save = () => {
    const issue = validateScalePreset(rows);
    if (issue) {
      notifications.show({
        title: tr("common.error2"),
        message: scalePresetIssueMessage(issue, tr),
        color: "red",
      });
      return;
    }
    startTransition(async () => {
      const res = await updateScalePreset(rows);
      if (res.ok) {
        notifications.show({
          title: tr("common.saved2"),
          message: tr("settings.scalePreset.saved"),
          color: "green",
        });
        router.push(BASE);
      } else {
        notifications.show({
          title: tr("common.error2"),
          message: res.error,
          color: "red",
        });
      }
    });
  };

  // 表示は開始数量の昇順（入力中に並びが入れ替わらないよう、編集用の rows は
  // そのまま持ち、範囲の導出だけ並べ替えて行う）。
  const ranges = scalePresetRanges(rows);
  const rangeOf = (r: ScalePresetRow) =>
    ranges.find((x) => x.minQuantity === r.minQuantity);

  return (
    <Stack gap="md">
      <PageHeader
        breadcrumbs={[
          tr("common.system"),
          { label: tr("common.priceEstimateEngine"), href: BASE },
          tr("settings.scalePreset.title"),
        ]}
        title={tr("settings.scalePreset.title")}
      />
      <FormSection
        description={tr("settings.scalePreset.description")}
        title={tr("settings.scalePreset.title")}
      >
        <Stack gap="sm">
          <NumberInput
            description={tr("settings.scalePreset.previewBaseHint")}
            label={tr("settings.scalePreset.previewBase")}
            maw={260}
            min={0}
            onChange={(v) => setPreviewBase(typeof v === "number" ? v : 0)}
            prefix="¥"
            thousandSeparator=","
            value={previewBase}
          />
          <Table withTableBorder>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>{tr("settings.scalePreset.colFrom")}</Table.Th>
                <Table.Th>{tr("settings.scalePreset.colRange")}</Table.Th>
                <Table.Th>{tr("settings.scalePreset.colMultiplier")}</Table.Th>
                <Table.Th ta="right">
                  {tr("settings.scalePreset.colUnitPrice")}
                </Table.Th>
                <Table.Th w={48} />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {rows.map((r, i) => {
                const range = rangeOf(r);
                return (
                  // 行の識別に位置以外のキーが無い（開始数量は編集で変わる）。
                  // biome-ignore lint/suspicious/noArrayIndexKey: 位置が識別子
                  <Table.Tr key={i}>
                    <Table.Td w={160}>
                      <NumberInput
                        allowDecimal={false}
                        aria-label={tr("settings.scalePreset.colFrom")}
                        disabled={i === 0}
                        min={1}
                        onChange={(v) =>
                          setRow(i, {
                            minQuantity: typeof v === "number" ? v : 0,
                          })
                        }
                        value={r.minQuantity}
                      />
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm">
                        {range
                          ? quantityRange(
                              range.minQuantity,
                              range.maxQuantity,
                              tr,
                            )
                          : "—"}
                      </Text>
                    </Table.Td>
                    <Table.Td w={160}>
                      <NumberInput
                        aria-label={tr("settings.scalePreset.colMultiplier")}
                        decimalScale={2}
                        min={MIN_SCALE_MULTIPLIER}
                        onChange={(v) =>
                          setRow(i, {
                            multiplier: typeof v === "number" ? v : 0,
                          })
                        }
                        prefix="×"
                        step={0.01}
                        value={r.multiplier}
                      />
                    </Table.Td>
                    <Table.Td ta="right">
                      <Text className="tabular-nums" ff="mono" size="sm">
                        ¥
                        {scalePresetUnitPrice(
                          previewBase,
                          r.multiplier,
                        ).toLocaleString("ja-JP")}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <ActionIcon
                        aria-label={tr("settings.scalePreset.removeRow")}
                        color="red"
                        disabled={i === 0}
                        onClick={() =>
                          setRows((rs) => rs.filter((_, j) => j !== i))
                        }
                        variant="subtle"
                      >
                        <IconTrash size={16} />
                      </ActionIcon>
                    </Table.Td>
                  </Table.Tr>
                );
              })}
            </Table.Tbody>
          </Table>
          <Group gap="xs">
            <GhostButton
              leftSection={<IconPlus size={16} />}
              onClick={addRow}
              size="xs"
            >
              {tr("settings.scalePreset.addRow")}
            </GhostButton>
            <GhostButton
              leftSection={<IconRestore size={16} />}
              onClick={resetToDefault}
              size="xs"
            >
              {tr("settings.scalePreset.resetToDefault")}
            </GhostButton>
          </Group>
        </Stack>
      </FormSection>
      <FormActions
        loading={isPending}
        onCancel={() => router.push(BASE)}
        onSave={save}
      />
    </Stack>
  );
}
