"use client";

/**
 * GoodsMovementForm.tsx — 手動入出庫 (ST06)。
 *
 * 移動タイプを選ぶと、その向き（IN/OUT/TRANSFER）+ requiresFrom/requiresTo に
 * よって 出庫元・入庫先の入力欄が現れる/隠れる。判定は
 * lib/movement-type-core.ts の `requiredEndpoints` / `validateMovement` —
 * 画面もサーバー（actions.ts）も同じ関数を呼ぶので、通る/通らないが食い違わない。
 *
 * 1 度使ったら閉じる画面ではなく、同じセッションで何度も打つ道具のため、
 * 保存に成功しても **移動タイプと出庫元・入庫先は残し**、品目・数量・ロット・
 * 備考だけを空にする（次の 1 行にすぐ移れるように）。直前の伝票番号は
 * 画面上部に残して、入出庫伝票の詳細へすぐ辿れるようにする。
 */

import {
  Alert,
  Anchor,
  Badge,
  Box,
  Group,
  LoadingOverlay,
  NumberInput,
  Paper,
  Select,
  Stack,
  Text,
  Textarea,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconAlertCircle, IconCircleCheck } from "@tabler/icons-react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useMemo, useState, useTransition } from "react";
import { searchItemOptions } from "@/app/(dashboard)/_shared/option-search";
import { postGoodsMovement } from "@/app/(dashboard)/inventory/goods-movement/actions";
import { ITEM_TYPE_COLOR } from "@/components/inventory/stock/model";
import { PageHeader } from "@/components/ui/PageHeader";
import { SearchSelect } from "@/components/ui/SearchSelect";
import { FormActions, FormSection } from "@/components/ui/shells";
import { useIsMobile } from "@/hooks/useViewport";
import { appLabelForKey, categoryLabel } from "@/lib/app-list";
import {
  inventoryTypeLabel,
  MOVEMENT_DIRECTION_COLOR,
  movementDirectionLabel,
} from "@/lib/enum-labels";
import type { Locale } from "@/lib/i18n";
import {
  type MovementDraft,
  type MovementProblem,
  requiredEndpoints,
  validateMovement,
} from "@/lib/movement-type-core";
import {
  type EndpointPlantOption,
  findLocation,
  findMovementType,
  findPlant,
  type MovementTypeOption,
  movementTypeOptionLabel,
  parseItemOptionValue,
} from "./model";

/** 出庫元・入庫先 1 件ぶんの選択（文字列で保持 — Mantine Select の値型）。 */
interface EndpointDraft {
  plantId: string | null;
  locationId: string | null;
  shelfId: string | null;
}

const EMPTY_ENDPOINT: EndpointDraft = {
  plantId: null,
  locationId: null,
  shelfId: null,
};

function toNumberOrNull(v: string | null): number | null {
  return v == null ? null : Number(v);
}

/** 出庫元 / 入庫先ブロック — 拠点 → 保管場所 → 棚のカスケード Select。 */
function EndpointFields({
  title,
  plants,
  value,
  onChange,
}: {
  title: string;
  plants: EndpointPlantOption[];
  value: EndpointDraft;
  onChange: (next: EndpointDraft) => void;
}) {
  const tr = useTranslations();
  const plant = findPlant(plants, toNumberOrNull(value.plantId));
  const location = findLocation(plant, toNumberOrNull(value.locationId));

  const plantOptions = plants.map((p) => ({
    value: String(p.id),
    label: p.label,
  }));
  const locationOptions = (plant?.locations ?? []).map((l) => ({
    value: String(l.id),
    label: l.label,
  }));
  const shelfOptions = (location?.shelves ?? []).map((s) => ({
    value: String(s.id),
    label: s.label,
  }));

  return (
    <FormSection required title={title}>
      <Stack gap="sm">
        <Select
          data={plantOptions}
          label={tr("common.site")}
          onChange={(v) =>
            onChange({ plantId: v, locationId: null, shelfId: null })
          }
          placeholder={tr("common.select")}
          searchable={plantOptions.length > 5}
          value={value.plantId}
          withAsterisk
        />
        <Select
          clearable
          data={locationOptions}
          disabled={!plant}
          label={tr("common.storageLocations")}
          onChange={(v) => onChange({ ...value, locationId: v, shelfId: null })}
          placeholder={tr("common.unassigned")}
          value={value.locationId}
        />
        <Select
          clearable
          data={shelfOptions}
          disabled={!location || shelfOptions.length === 0}
          label={tr("inventory.goodsMovement.shelf")}
          onChange={(v) => onChange({ ...value, shelfId: v })}
          placeholder={tr("common.unassigned")}
          value={value.shelfId}
        />
      </Stack>
    </FormSection>
  );
}

export function GoodsMovementForm({
  movementTypes,
  plants,
}: {
  movementTypes: MovementTypeOption[];
  plants: EndpointPlantOption[];
}) {
  const tr = useTranslations();
  const locale = useLocale() as Locale;
  const isMobile = useIsMobile();
  const [isPending, startTransition] = useTransition();

  const [movementTypeId, setMovementTypeId] = useState<string | null>(null);
  const [itemValue, setItemValue] = useState<string | null>(null);
  const [quantity, setQuantity] = useState<number | string>("");
  const [lotNumber, setLotNumber] = useState<number | string>("");
  const [from, setFrom] = useState<EndpointDraft>(EMPTY_ENDPOINT);
  const [to, setTo] = useState<EndpointDraft>(EMPTY_ENDPOINT);
  const [notes, setNotes] = useState("");
  const [lastMovementNumber, setLastMovementNumber] = useState<string | null>(
    null,
  );

  const selectedType = findMovementType(
    movementTypes,
    movementTypeId != null ? Number(movementTypeId) : null,
  );
  const requirement = selectedType
    ? requiredEndpoints(selectedType.direction)
    : { from: false, to: false };
  const showFrom = selectedType
    ? requirement.from || selectedType.requiresFrom
    : false;
  const showTo = selectedType
    ? requirement.to || selectedType.requiresTo
    : false;

  const parsedItem = parseItemOptionValue(itemValue);
  const numericQuantity =
    typeof quantity === "number" ? quantity : Number(quantity);

  const draft: MovementDraft = useMemo(
    () => ({
      itemId: parsedItem?.itemId ?? null,
      quantity: Number.isFinite(numericQuantity) ? numericQuantity : 0,
      from: {
        plantId: toNumberOrNull(from.plantId),
        storageLocationId: toNumberOrNull(from.locationId),
        shelfId: toNumberOrNull(from.shelfId),
      },
      to: {
        plantId: toNumberOrNull(to.plantId),
        storageLocationId: toNumberOrNull(to.locationId),
        shelfId: toNumberOrNull(to.shelfId),
      },
    }),
    [parsedItem, numericQuantity, from, to],
  );

  // 画面もサーバーも同じ validateMovement を呼ぶ（movement-type-core.ts）。
  const problems: MovementProblem[] = selectedType
    ? validateMovement(
        {
          direction: selectedType.direction,
          requiresFrom: selectedType.requiresFrom,
          requiresTo: selectedType.requiresTo,
        },
        draft,
      )
    : [];

  const problemLabel = (p: MovementProblem) =>
    tr(`inventory.goodsMovement.problem.${p}`);

  const canSubmit = selectedType != null && problems.length === 0;

  const resetForEntry = () => {
    setItemValue(null);
    setQuantity("");
    setLotNumber("");
    setNotes("");
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selectedType || !parsedItem || !canSubmit) return;
    startTransition(async () => {
      const result = await postGoodsMovement({
        movementTypeId: selectedType.id,
        itemId: parsedItem.itemId,
        quantity: numericQuantity,
        lotNumber: lotNumber === "" ? null : Number(lotNumber),
        from: {
          plantId: toNumberOrNull(from.plantId),
          storageLocationId: toNumberOrNull(from.locationId),
          shelfId: toNumberOrNull(from.shelfId),
        },
        to: {
          plantId: toNumberOrNull(to.plantId),
          storageLocationId: toNumberOrNull(to.locationId),
          shelfId: toNumberOrNull(to.shelfId),
        },
        notes: notes.trim(),
      });
      if (!result.ok) {
        notifications.show({
          title: tr("common.error2"),
          message: result.error,
          color: "red",
        });
        return;
      }
      notifications.show({
        title: tr("common.saved2"),
        message: tr("inventory.goodsMovement.posted", {
          number: result.data.movementNumber,
        }),
        color: "green",
      });
      setLastMovementNumber(result.data.movementNumber);
      resetForEntry();
    });
  };

  const title = appLabelForKey("goods-movement", "手動入出庫", locale); // i18n-ignore — app-list のカテゴリ名 / ja 既定値（対訳は app-list.ts が持つ）

  return (
    <Stack gap="md">
      <PageHeader
        breadcrumbs={[categoryLabel("在庫", locale), title]} // i18n-ignore — app-list のカテゴリ名 / ja 既定値（対訳は app-list.ts が持つ）
        title={title}
      />
      <Box component="form" onSubmit={handleSubmit} pos="relative">
        <LoadingOverlay visible={isPending} />
        <Stack gap="md">
          {lastMovementNumber && (
            <Alert
              color="green"
              icon={<IconCircleCheck size={16} />}
              title={tr("inventory.goodsMovement.lastPosted")}
              variant="light"
            >
              <Anchor
                component={Link}
                href={`/inventory/movements/${encodeURIComponent(lastMovementNumber)}`}
              >
                {lastMovementNumber}
              </Anchor>
            </Alert>
          )}

          <FormSection
            required
            title={tr("inventory.goodsMovement.movementType")}
          >
            <Stack gap="xs">
              <Select
                data={movementTypes.map((t) => ({
                  value: String(t.id),
                  label: movementTypeOptionLabel(t),
                }))}
                label={tr("inventory.goodsMovement.movementType")}
                onChange={setMovementTypeId}
                placeholder={tr("common.select")}
                searchable={movementTypes.length > 5}
                value={movementTypeId}
                withAsterisk
              />
              {selectedType && (
                <Group gap="xs">
                  <Badge
                    color={
                      MOVEMENT_DIRECTION_COLOR[selectedType.direction] ?? "gray"
                    }
                    variant="light"
                  >
                    {movementDirectionLabel(selectedType.direction, locale)}
                  </Badge>
                </Group>
              )}
            </Stack>
          </FormSection>

          {showFrom && (
            <EndpointFields
              onChange={setFrom}
              plants={plants}
              title={tr("inventory.goodsMovement.fromLocation")}
              value={from}
            />
          )}
          {showTo && (
            <EndpointFields
              onChange={setTo}
              plants={plants}
              title={tr("inventory.goodsMovement.toLocation")}
              value={to}
            />
          )}

          <FormSection
            required
            title={tr("inventory.goodsMovement.itemAndQuantity")}
          >
            <Stack gap="sm">
              <SearchSelect
                label={tr("inventory.goodsMovement.item")}
                onChange={setItemValue}
                onSearch={searchItemOptions}
                placeholder={tr("common.select")}
                renderOption={({ option }) => {
                  const parsed = parseItemOptionValue(option.value);
                  return (
                    <Group gap="xs" wrap="nowrap">
                      {parsed && (
                        <Badge
                          color={ITEM_TYPE_COLOR[parsed.itemType] ?? "gray"}
                          size="xs"
                          variant="light"
                        >
                          {inventoryTypeLabel(parsed.itemType, locale)}
                        </Badge>
                      )}
                      <Text size="sm">{option.label}</Text>
                    </Group>
                  );
                }}
                storageKey="goods-movement-item"
                value={itemValue}
                withAsterisk
              />
              <Group align="flex-end" grow={!isMobile}>
                <NumberInput
                  allowDecimal={parsedItem?.itemType === "MATERIAL"}
                  decimalScale={parsedItem?.itemType === "MATERIAL" ? 3 : 0}
                  label={tr("inventory.goodsMovement.quantity")}
                  min={0.001}
                  onChange={setQuantity}
                  value={quantity}
                  withAsterisk
                />
                <NumberInput
                  allowDecimal={false}
                  description={tr("inventory.goodsMovement.lotNumberHint")}
                  label={tr("inventory.goodsMovement.lotNumber")}
                  min={1}
                  onChange={setLotNumber}
                  value={lotNumber}
                />
              </Group>
              <Textarea
                label={tr("common.notesOptional")}
                onChange={(e) => setNotes(e.currentTarget.value)}
                rows={2}
                value={notes}
              />
            </Stack>
          </FormSection>

          {selectedType && problems.length > 0 && (
            <Paper p="sm" radius="md" withBorder>
              <Group gap="xs" mb={4}>
                <IconAlertCircle
                  color="var(--mantine-color-orange-6)"
                  size={16}
                />
                <Text c="orange" fw={600} size="sm">
                  {tr("inventory.goodsMovement.problemsTitle")}
                </Text>
              </Group>
              <Stack gap={2}>
                {problems.map((p) => (
                  <Text c="dimmed" key={p} size="xs">
                    {problemLabel(p)}
                  </Text>
                ))}
              </Stack>
            </Paper>
          )}
          {!selectedType && (
            <Text c="dimmed" size="xs">
              {tr("inventory.goodsMovement.selectAType")}
            </Text>
          )}

          <FormActions
            disabled={!canSubmit}
            loading={isPending}
            submitLabel={tr("inventory.goodsMovement.submit")}
          />
        </Stack>
      </Box>
    </Stack>
  );
}
