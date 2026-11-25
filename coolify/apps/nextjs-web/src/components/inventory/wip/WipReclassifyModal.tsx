"use client";

/**
 * WipReclassifyModal — 「未分類」の仕掛品を分類する。
 *
 * 移行で行き先を決められなかった旧来の半製品（品目が製品のまま・加工状態が
 * 「未分類」）に、仕掛ブランク（材種 × 径 × 長）・加工状態（済んだ工程の並び）・
 * 仕上がり寸法・目標製品を与える。サーバー（reclassifyWip）は未分類から OUT、
 * 分類先へ IN を 1 枚の入出庫伝票に書く — 数量は変わらない。
 *
 * 検証は lib/wip-stock-core.ts `validateWipReclassify`（サーバーと同じ関数）。
 */

import {
  ActionIcon,
  Badge,
  Divider,
  Group,
  NumberInput,
  Select,
  SimpleGrid,
  Stack,
  Text,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconX } from "@tabler/icons-react";
import { useTranslations } from "next-intl";
import { Fragment, useState, useTransition } from "react";
import {
  searchMaterialTypeOptions,
  searchProductItemOptions,
} from "@/app/(dashboard)/_shared/option-search";
import { reclassifyWip } from "@/app/(dashboard)/inventory/wip/actions";
import { ModalShell } from "@/components/ui/modals";
import { SearchSelect } from "@/components/ui/SearchSelect";
import { useIsMobile } from "@/hooks/useViewport";
import { validateWipReclassify } from "@/lib/wip-stock-core";
import type { WipStepOption, WipStockRow } from "./model";

const toNum = (v: number | string): number | null =>
  typeof v === "number" ? v : v.trim() === "" ? null : Number(v);

export function WipReclassifyModal({
  row,
  stepOptions,
  onClose,
  onDone,
}: {
  row: WipStockRow;
  stepOptions: WipStepOption[];
  onClose: () => void;
  onDone: () => void;
}) {
  const tr = useTranslations();
  const isMobile = useIsMobile();
  const s = row.suggestion;
  const [quantity, setQuantity] = useState<number | string>(row.available);
  const [materialTypeId, setMaterialTypeId] = useState<string | null>(
    s?.materialTypeId != null ? String(s.materialTypeId) : null,
  );
  const [diameter, setDiameter] = useState<number | string>(
    s?.diameterMm ?? "",
  );
  const [length, setLength] = useState<number | string>(s?.lengthMm ?? "");
  const [stepIds, setStepIds] = useState<number[]>([]);
  const [finishedDiameter, setFinishedDiameter] = useState<number | string>(
    row.finishedDiameterMm ?? "",
  );
  const [finishedLength, setFinishedLength] = useState<number | string>(
    row.finishedLengthMm ?? "",
  );
  const [aimedItemId, setAimedItemId] = useState<string | null>(
    row.aimedItemId != null ? String(row.aimedItemId) : null,
  );
  // 入力が揃う前から赤くしない — 確定を 1 度押してから不備を出す。
  const [submitted, setSubmitted] = useState(false);
  const [pending, startTransition] = useTransition();

  const input = {
    quantity: toNum(quantity),
    materialTypeId: materialTypeId ? Number(materialTypeId) : null,
    diameterMm: toNum(diameter),
    lengthMm: toNum(length),
    stepIds,
    finishedDiameterMm: toNum(finishedDiameter),
    finishedLengthMm: toNum(finishedLength),
    aimedItemId: aimedItemId ? Number(aimedItemId) : null,
  };
  const { issues } = validateWipReclassify(input, row.available);
  const errorOf = (...codes: (typeof issues)[number][]) => {
    if (!submitted) return undefined;
    const hit = codes.find((c) => issues.includes(c));
    return hit
      ? tr(`inventory.wip.reclassify.issue.${hit}`, {
          available: row.available,
        })
      : undefined;
  };
  const stepName = (id: number) =>
    stepOptions.find((o) => o.id === id)?.name ?? `#${id}`;

  function submit() {
    setSubmitted(true);
    if (issues.length > 0) return;
    startTransition(async () => {
      const res = await reclassifyWip({ inventoryId: row.id, ...input });
      if (!res.ok) {
        notifications.show({
          title: tr("inventory.wip.reclassify.failed"),
          message: res.error,
          color: "red",
        });
        return;
      }
      notifications.show({
        title: tr("inventory.wip.reclassify.done"),
        message: tr("inventory.wip.reclassify.doneMessage", {
          number: res.data.movementNumber,
        }),
        color: "green",
      });
      onDone();
    });
  }

  const product = row.aimedProductCode
    ? `${row.aimedProductName ?? row.itemName}（${row.aimedProductCode}）`
    : (row.aimedProductName ?? row.itemName);

  return (
    <ModalShell
      confirmLabel={tr("inventory.wip.reclassify.action")}
      fullScreen={isMobile}
      loading={pending}
      onClose={onClose}
      onConfirm={submit}
      opened
      size="lg"
      title={tr("inventory.wip.reclassify.title")}
    >
      <Stack gap="sm">
        <Text c="dimmed" size="xs">
          {tr("inventory.wip.reclassify.description")}
        </Text>
        <Text fw={600} size="sm">
          {tr("inventory.wip.reclassify.source", {
            product,
            available: row.available.toLocaleString("ja-JP"),
          })}
        </Text>
        <NumberInput
          allowDecimal={false}
          error={errorOf("quantityRequired", "quantityExceedsAvailable")}
          label={tr("inventory.wip.reclassify.quantity")}
          max={row.available}
          min={1}
          onChange={setQuantity}
          value={quantity}
          withAsterisk
        />

        <Divider label={tr("inventory.wip.reclassify.blankSection")} />
        <SearchSelect
          error={errorOf("materialTypeRequired")}
          initialOption={
            s?.materialTypeId != null && s.materialTypeLabel
              ? { value: String(s.materialTypeId), label: s.materialTypeLabel }
              : null
          }
          label={tr("inventory.wip.reclassify.materialType")}
          onChange={setMaterialTypeId}
          onSearch={searchMaterialTypeOptions}
          storageKey="material-type"
          value={materialTypeId}
          withAsterisk
        />
        <SimpleGrid cols={isMobile ? 1 : 2} spacing="sm">
          <NumberInput
            decimalScale={3}
            error={errorOf("diameterInvalid")}
            label={tr("inventory.wip.reclassify.diameter")}
            min={0}
            onChange={setDiameter}
            value={diameter}
            withAsterisk
          />
          <NumberInput
            decimalScale={3}
            error={errorOf("lengthInvalid")}
            label={tr("inventory.wip.reclassify.length")}
            min={0}
            onChange={setLength}
            value={length}
            withAsterisk
          />
        </SimpleGrid>

        <Divider label={tr("inventory.wip.reclassify.stateSection")} />
        <Text c="dimmed" size="xs">
          {tr("inventory.wip.reclassify.stepsHint")}
        </Text>
        <Group data-wip-steps gap={4} wrap="wrap">
          {stepIds.length === 0 ? (
            <Badge color="gray" variant="light">
              {tr("inventory.wip.unprocessed")}
            </Badge>
          ) : (
            stepIds.map((id, i) => (
              // 同じ工程を 2 回入れられる（手直しでもう一度通した品）ので位置が鍵。
              <Fragment key={`${i}:${id}`}>
                {i > 0 && (
                  <Text c="dimmed" component="span" size="xs">
                    ›
                  </Text>
                )}
                <Badge
                  color="violet"
                  rightSection={
                    <ActionIcon
                      aria-label={tr("inventory.wip.reclassify.removeStep", {
                        name: stepName(id),
                      })}
                      color="violet"
                      onClick={() =>
                        setStepIds((ids) => ids.filter((_, j) => j !== i))
                      }
                      size="xs"
                      variant="transparent"
                    >
                      <IconX size={10} />
                    </ActionIcon>
                  }
                  variant="light"
                >
                  {stepName(id)}
                </Badge>
              </Fragment>
            ))
          )}
        </Group>
        <Select
          aria-label={tr("inventory.wip.reclassify.addStep")}
          data={stepOptions.map((o) => ({
            value: String(o.id),
            label: o.name,
          }))}
          // 選んだら並びの末尾へ足し、欄は空に戻す（同じ工程を続けて足せる）。
          onChange={(v) => {
            if (v) setStepIds((ids) => [...ids, Number(v)]);
          }}
          placeholder={tr("inventory.wip.reclassify.addStep")}
          searchable
          value={null}
        />
        <SimpleGrid cols={isMobile ? 1 : 2} spacing="sm">
          <NumberInput
            decimalScale={3}
            error={errorOf(
              "finishedDiameterRequired",
              "finishedDiameterInvalid",
            )}
            label={tr("inventory.wip.reclassify.finishedDiameter")}
            min={0}
            onChange={setFinishedDiameter}
            value={finishedDiameter}
            withAsterisk={stepIds.length > 0}
          />
          <NumberInput
            decimalScale={3}
            error={errorOf("finishedLengthRequired", "finishedLengthInvalid")}
            label={tr("inventory.wip.reclassify.finishedLength")}
            min={0}
            onChange={setFinishedLength}
            value={finishedLength}
            withAsterisk={stepIds.length > 0}
          />
        </SimpleGrid>
        {stepIds.length === 0 && (
          <Text c="dimmed" size="xs">
            {tr("inventory.wip.reclassify.finishedDefaultsToBlank")}
          </Text>
        )}

        <Divider />
        <SearchSelect
          clearable
          description={tr("inventory.wip.reclassify.aimedProductHelp")}
          initialOption={
            row.aimedItemId != null && row.aimedProductName
              ? { value: String(row.aimedItemId), label: product }
              : null
          }
          label={tr("inventory.wip.reclassify.aimedProduct")}
          onChange={setAimedItemId}
          onSearch={searchProductItemOptions}
          storageKey="product"
          value={aimedItemId}
        />
      </Stack>
    </ModalShell>
  );
}
