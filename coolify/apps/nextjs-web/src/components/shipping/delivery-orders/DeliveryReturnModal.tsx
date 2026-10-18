"use client";

/**
 * DeliveryReturnModal — 出荷後の返品を記録する（SH01 詳細から開く）。
 *
 * 出した物が返ってくる経路がこれまで無く、受け取っても在庫は減ったままだった。
 * 数を合わせるには棚卸で「増えた理由の分からない差異」として足すしかなく、
 * それは返品の記録ではない。
 *
 * 画面が言っていることは 3 つだけ:
 *   - 戻せるのは **出した数から、もう戻した数を引いた分**まで
 *   - 戻るのは **出荷元の拠点・同じロット**（棚は未割当 — どこへ置くかは
 *     在庫移動で決める）
 *   - **請求も出荷書の状態も動かない**（在庫だけが戻る）。これを書いておかないと
 *     「返品したのに請求書が直らない」と読まれる
 */

import { NumberInput, Stack, Table, Text, Textarea } from "@mantine/core";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { ModalShell } from "@/components/ui/modals";
import type { DeliveryOrderItem } from "./model";

export function DeliveryReturnModal({
  opened,
  onClose,
  items,
  loading,
  onSubmit,
}: {
  opened: boolean;
  onClose: () => void;
  items: DeliveryOrderItem[];
  loading?: boolean;
  onSubmit: (
    lines: { itemRowId: string; quantity: number }[],
    notes: string | null,
  ) => void;
}) {
  const tr = useTranslations();
  const [quantities, setQuantities] = useState<Record<string, number | "">>({});
  const [notes, setNotes] = useState("");

  const lines = useMemo(
    () =>
      Object.entries(quantities)
        .map(([itemRowId, q]) => ({
          itemRowId,
          quantity: typeof q === "number" ? q : 0,
        }))
        .filter((l) => l.quantity > 0),
    [quantities],
  );

  const close = () => {
    setQuantities({});
    setNotes("");
    onClose();
  };

  return (
    <ModalShell
      confirmDisabled={lines.length === 0}
      confirmLabel={tr("shipping.deliveryOrders.recordTheReturn")}
      loading={loading}
      onClose={close}
      onConfirm={() => onSubmit(lines, notes.trim() || null)}
      opened={opened}
      size="lg"
      title={tr("shipping.deliveryOrders.recordAReturn")}
    >
      <Text c="dimmed" size="xs">
        {tr("shipping.deliveryOrders.returnHelp")}
      </Text>
      <Table.ScrollContainer minWidth={520}>
        <Table>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>{tr("common.product")}</Table.Th>
              <Table.Th>{tr("common.lot")}</Table.Th>
              <Table.Th ta="right">{tr("common.quantity")}</Table.Th>
              <Table.Th ta="right">
                {tr("shipping.deliveryOrders.alreadyReturned")}
              </Table.Th>
              <Table.Th ta="right" w={140}>
                {tr("shipping.deliveryOrders.returnQuantity")}
              </Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {items.map((it) => {
              const remaining = it.quantity - it.returnedQuantity;
              return (
                <Table.Tr key={it.id}>
                  <Table.Td>{it.productName}</Table.Td>
                  <Table.Td>{it.lotNumber ?? "—"}</Table.Td>
                  <Table.Td className="tabular-nums" ta="right">
                    {it.quantity}
                  </Table.Td>
                  <Table.Td className="tabular-nums" ta="right">
                    {it.returnedQuantity}
                  </Table.Td>
                  <Table.Td>
                    <NumberInput
                      allowNegative={false}
                      // 戻せるのは残りまで。ここで止めてもサーバーと DB が
                      // 同じことを言う（画面だけの守りにしない）。
                      disabled={remaining <= 0}
                      max={remaining}
                      min={0}
                      onChange={(v) =>
                        setQuantities((prev) => ({
                          ...prev,
                          [it.id]: typeof v === "number" ? v : "",
                        }))
                      }
                      value={quantities[it.id] ?? ""}
                    />
                  </Table.Td>
                </Table.Tr>
              );
            })}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>
      <Stack gap="xs">
        <Textarea
          autosize
          label={tr("common.notes")}
          minRows={2}
          onChange={(e) => setNotes(e.currentTarget.value)}
          value={notes}
        />
      </Stack>
    </ModalShell>
  );
}
