"use client";

/**
 * ChargesPanel — 追加料金（送料など）の表示と編集。指示書と出荷書で共用する。
 *
 * 2 つの書類で同じ部品なのは、**行の形が同じ**だから（料金項目 × 数量 × 単価）。
 * 違うのは意味のほうで、指示書は予定・出荷書は請求される実体 — その説明は
 * 呼び出し側が `description` で渡す。
 *
 * 金額を人が入れられるかは**料金マスタの決まり方**で決まる（lib/charge-core.ts）:
 * 固定なら入力欄を読み取り専用にする。サーバーも同じ関数を見て保存するので、
 * 画面を迂回しても固定料金は書き換わらない。
 *
 * 閲覧が既定・押して編集（design.md §10.10）。モバイルでは 1 行 = 1 カード
 * （§20.2 — 列が 4 つあると Select が何を選んでいるのか読めない）。
 */

import {
  Group,
  NumberInput,
  Paper,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconPlus, IconTrash } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { GhostButton, SecondaryButton } from "@/components/ui/buttons";
import { EditablePanel } from "@/components/ui/EditablePanel";
import { MoneyText } from "@/components/ui/MoneyText";
import { FormActions } from "@/components/ui/shells";
import { useIsMobile } from "@/hooks/useViewport";
import {
  type ChargeItemRef,
  chargesTotal,
  defaultUnitPriceFor,
  isUnitPriceEditable,
  resolveChargeUnitPrice,
} from "@/lib/charge-core";
import { lineAmountYen } from "@/lib/money";
import type { ActionResult } from "@/lib/server-action";

/** 画面に出す既存の 1 行（保存済み）。 */
export interface ChargeRowView {
  id: string;
  chargeItemId: number;
  /** 料金項目の表示名（**行に焼き込んだものではなくマスタの現在の名前**）。 */
  chargeItemLabel: string;
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
  /** 複写元の指示書番号（出荷書でだけ入る）。 */
  sourceWorkOrderNumber?: number | null;
}

/** 保存時にサーバーへ渡す 1 行。 */
export interface ChargeRowInput {
  chargeItemId: number;
  description: string;
  quantity: number;
  unitPrice: number | null;
}

/** 選択肢（料金マスタ）。 */
export interface ChargeItemChoice extends ChargeItemRef {
  code: string;
  label: string;
}

interface Draft {
  key: number;
  chargeItemId: number | null;
  description: string;
  quantity: number;
  unitPrice: number | null;
}

export function ChargesPanel({
  rows,
  items,
  canEdit,
  onSave,
  title,
  description,
}: {
  rows: ChargeRowView[];
  items: ChargeItemChoice[];
  canEdit: boolean;
  onSave: (rows: ChargeRowInput[]) => Promise<ActionResult>;
  title: string;
  description: string;
}) {
  return (
    <EditablePanel
      canEdit={canEdit}
      description={
        <Text c="dimmed" size="xs">
          {description}
        </Text>
      }
      edit={({ close }) => (
        <ChargesEditor
          initial={rows}
          items={items}
          onClose={close}
          onSave={onSave}
        />
      )}
      title={title}
      view={<ChargesView rows={rows} />}
    />
  );
}

export function ChargesView({ rows }: { rows: ChargeRowView[] }) {
  const tr = useTranslations();
  const isMobile = useIsMobile();
  const total = chargesTotal(rows);

  if (rows.length === 0) {
    return (
      <Text c="dimmed" size="sm">
        {tr("charges.empty")}
      </Text>
    );
  }

  const label = (r: ChargeRowView) =>
    r.description
      ? `${r.chargeItemLabel}（${r.description}）`
      : r.chargeItemLabel;

  if (isMobile) {
    return (
      <Stack gap="xs">
        {rows.map((r) => (
          <Paper key={r.id} p="sm" radius="sm" withBorder>
            <Group justify="space-between" wrap="nowrap">
              <Text fw={600} size="sm">
                {label(r)}
              </Text>
              <MoneyText value={r.amount} />
            </Group>
            <Text c="dimmed" size="xs">
              {tr("charges.quantityTimesUnitPrice", {
                quantity: r.quantity,
                unitPrice: r.unitPrice.toLocaleString("ja-JP"),
              })}
            </Text>
          </Paper>
        ))}
        <Group justify="space-between">
          <Text fw={600} size="sm">
            {tr("charges.total")}
          </Text>
          <Text fw={700}>
            <MoneyText value={total} />
          </Text>
        </Group>
      </Stack>
    );
  }

  return (
    <Table striped withTableBorder>
      <Table.Thead>
        <Table.Tr>
          <Table.Th>{tr("charges.item")}</Table.Th>
          <Table.Th ta="right" w={90}>
            {tr("common.quantity")}
          </Table.Th>
          <Table.Th ta="right" w={130}>
            {tr("common.unitPrice")}
          </Table.Th>
          <Table.Th ta="right" w={130}>
            {tr("common.amount")}
          </Table.Th>
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {rows.map((r) => (
          <Table.Tr key={r.id}>
            <Table.Td>
              {label(r)}
              {r.sourceWorkOrderNumber != null && (
                <Text c="dimmed" size="xs">
                  {tr("charges.copiedFromWorkOrder", {
                    number: r.sourceWorkOrderNumber,
                  })}
                </Text>
              )}
            </Table.Td>
            <Table.Td className="tabular-nums" ta="right">
              {r.quantity}
            </Table.Td>
            <Table.Td ta="right">
              <MoneyText value={r.unitPrice} />
            </Table.Td>
            <Table.Td ta="right">
              <MoneyText value={r.amount} />
            </Table.Td>
          </Table.Tr>
        ))}
        <Table.Tr>
          <Table.Td colSpan={3} ta="right">
            <Text fw={600} size="sm">
              {tr("charges.total")}
            </Text>
          </Table.Td>
          <Table.Td ta="right">
            <Text fw={700}>
              <MoneyText value={total} />
            </Text>
          </Table.Td>
        </Table.Tr>
      </Table.Tbody>
    </Table>
  );
}

function ChargesEditor({
  initial,
  items,
  onClose,
  onSave,
}: {
  initial: ChargeRowView[];
  items: ChargeItemChoice[];
  onClose: () => void;
  onSave: (rows: ChargeRowInput[]) => Promise<ActionResult>;
}) {
  const tr = useTranslations();
  const router = useRouter();
  const isMobile = useIsMobile();
  const [pending, startTransition] = useTransition();
  // props からドラフトを作る（キャンセル = アンマウント = サーバの値へ戻る）。
  const [drafts, setDrafts] = useState<Draft[]>(() =>
    initial.map((r, i) => ({
      key: i,
      chargeItemId: r.chargeItemId,
      description: r.description,
      quantity: r.quantity,
      unitPrice: r.unitPrice,
    })),
  );
  const [nextKey, setNextKey] = useState(initial.length);

  const itemById = new Map(items.map((i) => [i.id, i]));
  const options = items.map((i) => ({
    value: String(i.id),
    label: `${i.label}（${i.code}）`,
  }));

  const patch = (key: number, part: Partial<Draft>) =>
    setDrafts((d) => d.map((r) => (r.key === key ? { ...r, ...part } : r)));

  /** 料金項目を選び直したら、単価はその項目の既定値へ入れ替える。 */
  const pickItem = (key: number, value: string | null) => {
    const item = value ? itemById.get(Number(value)) : undefined;
    patch(key, {
      chargeItemId: item?.id ?? null,
      unitPrice: item ? defaultUnitPriceFor(item) : null,
    });
  };

  const add = () => {
    setDrafts((d) => [
      ...d,
      {
        key: nextKey,
        chargeItemId: null,
        description: "",
        quantity: 1,
        unitPrice: null,
      },
    ]);
    setNextKey((k) => k + 1);
  };

  const lineAmount = (r: Draft) => {
    const item = r.chargeItemId != null ? itemById.get(r.chargeItemId) : null;
    if (!item) return 0;
    return lineAmountYen(resolveChargeUnitPrice(item, r.unitPrice), r.quantity);
  };
  const total = drafts.reduce((sum, r) => sum + lineAmount(r), 0);

  const save = () => {
    if (drafts.some((r) => r.chargeItemId == null)) {
      notifications.show({
        color: "red",
        message: tr("charges.everyRowNeedsAnItem"),
        title: tr("common.error"),
      });
      return;
    }
    startTransition(async () => {
      const result = await onSave(
        drafts.map((r) => ({
          chargeItemId: r.chargeItemId as number,
          description: r.description.trim(),
          quantity: r.quantity,
          unitPrice: r.unitPrice,
        })),
      );
      if (!result.ok) {
        notifications.show({
          color: "red",
          message: result.error,
          title: tr("common.error"),
        });
        return;
      }
      notifications.show({
        color: "green",
        message: tr("common.saved"),
        title: tr("common.saved"),
      });
      onClose();
      router.refresh();
    });
  };

  const itemField = (r: Draft) => (
    <Select
      aria-label={tr("charges.item")}
      data={options}
      onChange={(v) => pickItem(r.key, v)}
      placeholder={tr("charges.selectAnItem")}
      searchable
      size="xs"
      value={r.chargeItemId != null ? String(r.chargeItemId) : null}
    />
  );
  const descriptionField = (r: Draft) => (
    <TextInput
      aria-label={tr("charges.note")}
      onChange={(e) => patch(r.key, { description: e.currentTarget.value })}
      placeholder={tr("charges.notePlaceholder")}
      size="xs"
      value={r.description}
    />
  );
  const quantityField = (r: Draft) => (
    <NumberInput
      allowDecimal={false}
      aria-label={tr("common.quantity")}
      min={1}
      onChange={(v) =>
        patch(r.key, { quantity: typeof v === "number" ? v : 1 })
      }
      size="xs"
      value={r.quantity}
    />
  );
  const unitPriceField = (r: Draft) => {
    const item = r.chargeItemId != null ? itemById.get(r.chargeItemId) : null;
    // 固定料金はマスタの金額で動かせない（サーバーも同じ判断で保存する）。
    const editable = item ? isUnitPriceEditable(item) : true;
    return (
      <NumberInput
        aria-label={tr("common.unitPrice")}
        decimalScale={2}
        description={
          item && !editable ? tr("charges.fixedByMaster") : undefined
        }
        disabled={!editable}
        hideControls
        min={0}
        onChange={(v) =>
          patch(r.key, { unitPrice: typeof v === "number" ? v : null })
        }
        prefix="¥"
        size="xs"
        thousandSeparator=","
        value={
          (item ? resolveChargeUnitPrice(item, r.unitPrice) : r.unitPrice) ?? ""
        }
      />
    );
  };

  return (
    <Stack gap="sm">
      {drafts.length === 0 && (
        <Text c="dimmed" size="sm">
          {tr("charges.empty")}
        </Text>
      )}

      {isMobile
        ? drafts.length > 0 && (
            <Stack gap="sm">
              {drafts.map((r) => (
                <Paper key={r.key} p="sm" radius="sm" withBorder>
                  <Stack gap="xs">
                    {itemField(r)}
                    {descriptionField(r)}
                    <Group gap="xs" grow>
                      {quantityField(r)}
                      {unitPriceField(r)}
                    </Group>
                    <Group justify="space-between">
                      <MoneyText value={lineAmount(r)} />
                      <GhostButton
                        color="red"
                        leftSection={<IconTrash size={14} />}
                        onClick={() =>
                          setDrafts((d) => d.filter((x) => x.key !== r.key))
                        }
                      >
                        {tr("common.removeRow")}
                      </GhostButton>
                    </Group>
                  </Stack>
                </Paper>
              ))}
            </Stack>
          )
        : drafts.length > 0 && (
            <Table withTableBorder>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th w={220}>{tr("charges.item")}</Table.Th>
                  <Table.Th>{tr("charges.note")}</Table.Th>
                  <Table.Th w={90}>{tr("common.quantity")}</Table.Th>
                  <Table.Th w={150}>{tr("common.unitPrice")}</Table.Th>
                  <Table.Th ta="right" w={120}>
                    {tr("common.amount")}
                  </Table.Th>
                  <Table.Th w={48} />
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {drafts.map((r) => (
                  <Table.Tr key={r.key}>
                    <Table.Td>{itemField(r)}</Table.Td>
                    <Table.Td>{descriptionField(r)}</Table.Td>
                    <Table.Td>{quantityField(r)}</Table.Td>
                    <Table.Td>{unitPriceField(r)}</Table.Td>
                    <Table.Td ta="right">
                      <MoneyText value={lineAmount(r)} />
                    </Table.Td>
                    <Table.Td>
                      <GhostButton
                        aria-label={tr("common.removeRow")}
                        color="red"
                        onClick={() =>
                          setDrafts((d) => d.filter((x) => x.key !== r.key))
                        }
                        px="xs"
                      >
                        <IconTrash size={14} />
                      </GhostButton>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          )}

      <Group justify="space-between">
        <SecondaryButton
          fullWidth={isMobile}
          leftSection={<IconPlus size={14} />}
          onClick={add}
        >
          {tr("charges.addRow")}
        </SecondaryButton>
        <Group gap="xs">
          <Text fw={600} size="sm">
            {tr("charges.total")}
          </Text>
          <Text fw={700}>
            <MoneyText value={total} />
          </Text>
        </Group>
      </Group>

      <FormActions loading={pending} onCancel={onClose} onSave={save} />
    </Stack>
  );
}
